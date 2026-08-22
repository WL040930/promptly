import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formFileInternals,
    isPromptlyFileReference,
    publicFileReference
} from './formFileService.js';

test('private file references expose only durable asset details', () => {
    const reference = publicFileReference({
        id: 'asset_1',
        originalName: 'resume.pdf',
        mimeType: 'application/pdf',
        byteSize: 42
    });

    assert.deepEqual(reference, {
        kind: 'promptly-file',
        assetId: 'asset_1',
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        byteSize: 42,
        downloadPath: '/api/storage/assets/asset_1'
    });
    assert.equal(isPromptlyFileReference(reference), true);
    assert.equal(isPromptlyFileReference({ kind: 'promptly-file' }), false);
});

test('private form uploads can only be attached to active file fields', () => {
    const form = {
        fields: [
            { id: 'resume', type: 'file' },
            { id: 'name', type: 'text' },
            { id: 'deleted_file', type: 'file', deleted: true }
        ]
    };
    const reference = { kind: 'promptly-file', assetId: 'asset_1', uploadClaim: 'claim' };

    assert.deepEqual(
        formFileInternals.pendingFileValues({ form, responseData: { resume: reference } }),
        [{ fieldId: 'resume', value: reference }]
    );
    assert.throws(
        () => formFileInternals.pendingFileValues({ form, responseData: { name: reference } }),
        error => error.code === 'FORM_FILE_FIELD_INVALID'
    );
    assert.throws(
        () => formFileInternals.pendingFileValues({ form, responseData: { deleted_file: reference } }),
        error => error.code === 'FORM_FILE_FIELD_INVALID'
    );
});

test('pending form upload expiry and mime normalization are deterministic', () => {
    const now = new Date('2026-08-20T00:00:00.000Z');
    assert.equal(formFileInternals.isExpired({ expiresAt: '2026-08-19T23:59:59.999Z' }, now), true);
    assert.equal(formFileInternals.isExpired({ expiresAt: '2026-08-20T00:00:00.001Z' }, now), false);
    assert.equal(formFileInternals.normalMimeType('text/CSV; charset=utf-8'), 'text/csv');
});
