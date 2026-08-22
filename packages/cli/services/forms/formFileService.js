import crypto from 'node:crypto';
import { Asset } from '../../models/index.js';
import { createAsset, deleteStoredAsset } from '../storage/assetService.js';

const PENDING_STATUS = 'pending';
const FILE_KIND = 'promptly-file';
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PURGE_BATCH = 100;

const asJson = value => value?.toJSON?.() || value || {};
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const claimHash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const claimToken = () => crypto.randomBytes(32).toString('base64url');
const normalMimeType = value => String(value || 'application/octet-stream').split(';')[0].trim().toLowerCase() || 'application/octet-stream';

const fileError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

const uploadMetadata = asset => asJson(asset).metadata?.formUpload || {};

const fileField = (form, fieldId) => (asJson(form).fields || []).find(field => (
    String(field?.id) === String(fieldId) && field?.type === 'file' && !field?.deleted
));

const assertFileField = (form, fieldId) => {
    if (!fieldId || !fileField(form, fieldId)) {
        throw fileError('FORM_FILE_FIELD_INVALID', 'This upload field is no longer available on the form.');
    }
};

const assertFormAcceptingResponses = form => {
    if (asJson(form).settings?.acceptingResponses === false) {
        throw fileError('FORM_NOT_ACCEPTING_RESPONSES', 'This form is no longer accepting responses.');
    }
};

export const isPromptlyFileReference = value => (
    isPlainObject(value)
    && value.kind === FILE_KIND
    && typeof value.assetId === 'string'
    && value.assetId.length > 0
);

export const publicFileReference = asset => {
    const value = asJson(asset);
    return {
        kind: FILE_KIND,
        assetId: value.id,
        name: value.originalName,
        mimeType: value.mimeType,
        byteSize: value.byteSize,
        downloadPath: `/api/storage/assets/${value.id}`
    };
};

const storedFileReference = asset => publicFileReference(asset);

const isExpired = (metadata, now) => {
    const expiresAt = new Date(metadata?.expiresAt || 0).getTime();
    return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
};

const hasMatchingClaim = ({ asset, token }) => {
    const expected = uploadMetadata(asset).claimHash;
    if (!expected || !token) return false;
    const actual = claimHash(token);
    return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};

const pendingFileValues = ({ form, responseData }) => {
    if (!isPlainObject(responseData)) {
        throw fileError('FORM_RESPONSE_INVALID', 'Form response data must be an object.');
    }

    const values = [];
    for (const [fieldId, value] of Object.entries(responseData)) {
        if (!isPromptlyFileReference(value)) continue;
        assertFileField(form, fieldId);
        values.push({ fieldId, value });
    }
    return values.sort((left, right) => left.value.assetId.localeCompare(right.value.assetId));
};

/**
 * Create a private, one-time-claimable form upload. The caller receives the
 * claim only for the short period between upload and form submission; it is
 * never persisted in a FormResponse.
 */
export const createPendingFormFile = async ({ form, fieldId, buffer, originalName, mimeType }) => {
    assertFormAcceptingResponses(form);
    assertFileField(form, fieldId);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw fileError('FORM_FILE_EMPTY', 'Choose a non-empty file to upload.');
    }

    const token = claimToken();
    const expiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
    const asset = await createAsset({
        userId: asJson(form).userId,
        formId: asJson(form).id,
        buffer,
        originalName: String(originalName || 'upload'),
        mimeType: normalMimeType(mimeType),
        source: 'form-upload',
        status: PENDING_STATUS,
        metadata: {
            formUpload: {
                fieldId: String(fieldId),
                claimHash: claimHash(token),
                expiresAt
            }
        }
    });

    return {
        file: { ...publicFileReference(asset), uploadClaim: token },
        expiresAt
    };
};

/**
 * Atomically bind every private upload in a response to that response. The
 * returned object is safe to persist and to expose to workflow execution.
 */
export const claimFormFiles = async ({ form, responseData, transaction, now = new Date() }) => {
    const pendingValues = pendingFileValues({ form, responseData });
    const seenAssetIds = new Set();
    const claimed = new Map();

    for (const { fieldId, value } of pendingValues) {
        if (seenAssetIds.has(value.assetId)) {
            throw fileError('FORM_FILE_DUPLICATE', 'The same uploaded file cannot be used for more than one form field.');
        }
        seenAssetIds.add(value.assetId);

        const asset = await Asset.findOne({
            where: {
                id: value.assetId,
                userId: asJson(form).userId,
                formId: asJson(form).id,
                status: PENDING_STATUS,
                source: 'form-upload'
            },
            transaction,
            lock: transaction?.LOCK?.UPDATE
        });
        if (!asset) throw fileError('FORM_FILE_NOT_FOUND', 'This uploaded file is no longer available. Please upload it again.');

        const metadata = uploadMetadata(asset);
        if (metadata.fieldId !== String(fieldId) || isExpired(metadata, now) || !hasMatchingClaim({ asset, token: value.uploadClaim })) {
            throw fileError('FORM_FILE_CLAIM_INVALID', 'This uploaded file cannot be used for this submission. Please upload it again.');
        }
        claimed.set(fieldId, asset);
    }

    for (const [fieldId, asset] of claimed) {
        const metadata = uploadMetadata(asset);
        await asset.update({
            status: 'clean',
            metadata: {
                ...(asJson(asset).metadata || {}),
                formUpload: {
                    fieldId: metadata.fieldId,
                    claimedAt: now.toISOString()
                }
            }
        }, { transaction });
    }

    const sanitized = { ...responseData };
    for (const [fieldId, asset] of claimed) sanitized[fieldId] = storedFileReference(asset);
    return sanitized;
};

export const discardPendingFormFile = async ({ form, assetId, uploadClaim }) => {
    const formValue = asJson(form);
    let asset;
    await Asset.sequelize.transaction(async transaction => {
        asset = await Asset.findOne({
            where: {
                id: assetId,
                userId: formValue.userId,
                formId: formValue.id,
                status: PENDING_STATUS,
                source: 'form-upload'
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!asset || !hasMatchingClaim({ asset, token: uploadClaim })) {
            throw fileError('FORM_FILE_NOT_FOUND', 'This uploaded file is no longer available.');
        }
        await asset.update({ status: 'discarded' }, { transaction });
    });

    try {
        await deleteStoredAsset(asset);
        await asset.destroy();
    } catch (error) {
        // It remains unusable even when storage cleanup is retried later.
        console.warn('[FormFile] Could not remove discarded upload from storage:', error.message);
    }
};

/**
 * Best-effort cleanup for abandoned browser uploads. A stale record is marked
 * unusable before its object is removed, so it can never be claimed later.
 */
export const purgeExpiredPendingFormFiles = async ({ now = new Date(), limit = MAX_PURGE_BATCH } = {}) => {
    const candidates = await Asset.findAll({
        where: { status: PENDING_STATUS, source: 'form-upload' },
        order: [['createdAt', 'ASC']],
        limit: Math.min(Math.max(Number(limit) || MAX_PURGE_BATCH, 1), MAX_PURGE_BATCH)
    });
    const expired = candidates.filter(asset => isExpired(uploadMetadata(asset), now));
    await Promise.allSettled(expired.map(async asset => {
        await Asset.sequelize.transaction(async transaction => {
            const locked = await Asset.findOne({ where: { id: asset.id, status: PENDING_STATUS }, transaction, lock: transaction.LOCK.UPDATE });
            if (!locked || !isExpired(uploadMetadata(locked), now)) return;
            await locked.update({ status: 'discarded' }, { transaction });
        });
        await deleteStoredAsset(asset).catch(error => console.warn('[FormFile] Could not remove expired upload from storage:', error.message));
    }));
    return expired.length;
};

export const formFileInternals = {
    CLAIM_TTL_MS,
    FILE_KIND,
    claimHash,
    fileField,
    isExpired,
    normalMimeType,
    pendingFileValues
};
