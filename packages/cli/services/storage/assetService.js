import crypto from 'node:crypto';
import env from '../../config/env.js';
import { Asset } from '../../models/index.js';

const BUCKET = 'workflow-assets';
const MAX_BYTES = 50 * 1024 * 1024;
const safeName = name => String(name || 'asset').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
const checksum = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const storageKey = ({ userId, name }) => `${userId}/${crypto.randomUUID()}-${safeName(name)}`;

const storageRequest = async ({ method, key, body, contentType }) => {
    if (!env.supabase.serviceRoleKey) throw new Error('Private asset storage requires SUPABASE_SERVICE_ROLE_KEY.');
    const response = await fetch(`${env.supabase.url}/storage/v1/object/${BUCKET}/${key}`, {
        method,
        headers: {
            apikey: env.supabase.serviceRoleKey,
            Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
            ...(contentType ? { 'Content-Type': contentType } : {})
        },
        body
    });
    if (!response.ok) throw new Error(`Private asset storage returned ${response.status}.`);
    return response;
};

export const createAsset = async ({ userId, buffer, originalName, mimeType = 'application/octet-stream', workflowId = null, runId = null, formId = null, source = 'upload', metadata = {} }) => {
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) throw new Error('Asset must be a buffer no larger than 50 MB.');
    const key = storageKey({ userId, name: originalName });
    await storageRequest({ method: 'POST', key, body: buffer, contentType: mimeType });
    return Asset.create({ userId, workflowId, runId, formId, storageKey: key, bucket: BUCKET, originalName: safeName(originalName), mimeType, byteSize: buffer.length, checksum: checksum(buffer), status: 'clean', source, metadata });
};

export const getAssetForUser = async ({ id, userId }) => {
    const asset = await Asset.findOne({ where: { id, userId } });
    if (!asset) throw new Error('Asset not found.');
    if (asset.status !== 'clean') throw new Error('Asset is not available.');
    return asset;
};

export const downloadAsset = async ({ id, userId }) => {
    const asset = await getAssetForUser({ id, userId });
    const response = await storageRequest({ method: 'GET', key: asset.storageKey });
    return { asset, buffer: Buffer.from(await response.arrayBuffer()) };
};

export const listAssets = ({ userId }) => Asset.findAll({ where: { userId, status: 'clean' }, order: [['createdAt', 'DESC']], limit: 100 });

export { BUCKET, MAX_BYTES };
