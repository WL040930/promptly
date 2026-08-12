import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSpreadsheetService } from './googleSpreadsheetService.js';

test('creates and initializes a Google Sheet with a durable provisioning key', async () => {
    const calls = [];
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async request => {
        calls.push(request);
        if (request.method === 'GET' && request.url.includes('/drive/v3/files?')) return { data: { files: [] } };
        if (request.method === 'POST' && request.url.includes('/drive/v3/files?fields=')) return { data: { id: 'sheet_12345678901234567890', name: 'Responses', webViewLink: 'https://sheet.test' } };
        if (request.url.includes('?fields=sheets.properties')) return { data: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } };
        return { data: {} };
    } } }) });
    const created = await service.createAndInitialize({ userId: 'user_1', title: 'Responses', sheetTitle: 'Approved', headers: ['Email'], provisioningKey: 'proposal_1' });
    assert.equal(created.id, 'sheet_12345678901234567890');
    assert.equal(created.range, "'Approved'!A1");
    assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/drive/v3/files?fields=')).length, 1);
    assert.ok(calls.some(call => call.url.includes(':batchUpdate')));
    assert.ok(calls.some(call => call.method === 'PUT' && call.data?.values?.[0]?.[0] === 'Email'));
});

test('reconciles a Drive create that succeeds before Google returns a 403 response', async () => {
    const calls = [];
    const retries = [];
    let createdFile = null;
    let creates = 0;
    let readyResource = null;
    const service = createGoogleSpreadsheetService({
        provisioningReconcileAttempts: 2,
        waitForRetry: async delayMs => retries.push(delayMs),
        getGoogleClient: async () => ({ client: { request: async request => {
            calls.push(request);
            if (request.method === 'GET' && request.url.includes('/drive/v3/files?')) {
                return { data: { files: createdFile ? [createdFile] : [] } };
            }
            if (request.method === 'POST' && request.url.includes('/drive/v3/files?fields=')) {
                creates += 1;
                createdFile = {
                    id: 'sheet_reconciled_after_403',
                    name: request.data.name,
                    webViewLink: 'https://sheet.test/reconciled'
                };
                const error = new Error('Google returned a response after creating the Drive file.');
                error.response = { status: 403, data: { error: { status: 'PERMISSION_DENIED' } } };
                throw error;
            }
            if (request.url.includes('?fields=sheets.properties')) return { data: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } };
            if (request.method === 'PATCH' && request.url.includes('/drive/v3/files/')) return { data: { ...createdFile, name: 'Event Registration Responses' } };
            return { data: {} };
        } } })
    });

    const created = await service.createAndInitialize({
        userId: 'user_1',
        title: 'Event Registration Responses',
        sheetTitle: 'Responses',
        headers: ['Email'],
        provisioningKey: 'workflow-proposal:workflow_1:proposal_1:responses',
        onFileReady: resource => { readyResource = resource; }
    });

    assert.equal(creates, 1);
    assert.equal(created.id, 'sheet_reconciled_after_403');
    assert.equal(readyResource.id, 'sheet_reconciled_after_403');
    assert.equal(retries.length, 0);
    const createCall = calls.find(call => call.method === 'POST' && call.url.includes('/drive/v3/files?fields='));
    assert.equal(createCall.retry, false);
    assert.match(createCall.data.name, /Promptly [a-f0-9]{16}$/);
    assert.ok(calls.some(call => call.method === 'PATCH' && call.data?.name === 'Event Registration Responses'));
    assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/drive/v3/files?fields=')).length, 1);
});

test('returns a retry-safe outcome when an ambiguous Drive create cannot be reconciled', async () => {
    const service = createGoogleSpreadsheetService({
        provisioningReconcileAttempts: 1,
        getGoogleClient: async () => ({ client: { request: async request => {
            if (request.method === 'GET' && request.url.includes('/drive/v3/files?')) return { data: { files: [] } };
            if (request.method === 'POST' && request.url.includes('/drive/v3/files?fields=')) {
                const error = new Error('Drive connection reset.');
                error.code = 'ECONNABORTED';
                throw error;
            }
            return { data: {} };
        } } })
    });

    await assert.rejects(
        () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: 'ambiguous_create' }),
        error => error.code === 'GOOGLE_PROVISIONING_UNCERTAIN'
            && error.status === 409
            && error.message === 'Google did not confirm whether the spreadsheet was created. Wait a moment, then retry Apply safely.'
    );
});

test('explains that Google must be reconnected when the saved token returns 401', async () => {
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async () => {
        const error = new Error('Google returned 401');
        error.response = { status: 401 };
        throw error;
    } } }) });

    await assert.rejects(
        () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: 'proposal_401' }),
        error => error.code === 'GOOGLE_RECONNECT_REQUIRED'
            && error.status === 409
            && error.message === 'Google session expired while checking the existing spreadsheet. Reconnect Google to continue.'
            && error.action?.href === '/app/settings/connections'
    );
});

test('reports a Sheets permission failure without hiding it behind a reconnect message', async () => {
    const retries = [];
    const service = createGoogleSpreadsheetService({
        waitForRetry: async delayMs => retries.push(delayMs),
        getGoogleClient: async () => ({ client: { request: async () => {
        const error = new Error('Google denied Sheets access.');
        error.response = { status: 403, data: { error: { status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } } };
        throw error;
    } } })
    });

    await assert.rejects(
        () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: 'permission_denied', existingSpreadsheetId: 'sheet_permission_denied' }),
        error => error.code === 'GOOGLE_PERMISSION_REQUIRED'
            && error.message === 'Google denied access while preparing the spreadsheet. Check the Google Sheets permission and try again.'
            && error.action?.href === '/app/settings/connections'
    );
    assert.deepEqual(retries, []);
});

test('retries a transient Sheets rejection while a newly created spreadsheet becomes ready', async () => {
    const retries = [];
    const calls = [];
    let metadataAttempts = 0;
    let readyResource = null;
    const service = createGoogleSpreadsheetService({
        sheetReadyAttempts: 2,
        waitForRetry: async delayMs => retries.push(delayMs),
        getGoogleClient: async () => ({ client: { request: async request => {
            calls.push(request);
            if (request.method === 'GET' && request.url.includes('/drive/v3/files?')) return { data: { files: [] } };
            if (request.method === 'POST' && request.url.includes('/drive/v3/files?fields=')) return { data: { id: 'sheet_eventually_ready', name: 'Responses', webViewLink: 'https://sheet.test' } };
            if (request.url.includes('?fields=sheets.properties')) {
                metadataAttempts += 1;
                if (metadataAttempts === 1) {
                    const error = new Error('The new spreadsheet is not available yet.');
                    error.response = { status: 403 };
                    throw error;
                }
                return { data: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } };
            }
            return { data: {} };
        } } })
    });

    const created = await service.createAndInitialize({
        userId: 'user_1',
        title: 'Responses',
        headers: ['Email'],
        provisioningKey: 'eventually_ready',
        onFileReady: resource => { readyResource = resource; }
    });

    assert.equal(created.id, 'sheet_eventually_ready');
    assert.equal(readyResource.id, 'sheet_eventually_ready');
    assert.equal(metadataAttempts, 2);
    assert.deepEqual(retries, [250]);
    assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/drive/v3/files?fields=')).length, 1);
});

test('times out a Google request instead of leaving the Apply operation hanging', async () => {
    const service = createGoogleSpreadsheetService({
        requestTimeoutMs: 5,
        getGoogleClient: async () => ({ client: { request: async request => {
            assert.ok(request.signal, 'Google requests must receive an abort signal');
            return new Promise((_, reject) => request.signal.addEventListener('abort', () => {
                const error = new Error('Google request aborted.');
                error.name = 'AbortError';
                reject(error);
            }, { once: true }));
        } } })
    });

    await assert.rejects(
        () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: 'timeout' }),
        error => error.code === 'GOOGLE_PROVIDER_TIMEOUT'
            && error.status === 504
            && error.message === 'Google took too long to respond while checking the existing spreadsheet. Try again.'
    );
});

test('reports the created file before Sheets initialisation can fail', async () => {
    let readyResource = null;
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async request => {
        if (request.method === 'GET' && request.url.includes('/drive/v3/files?')) return { data: { files: [] } };
        if (request.method === 'POST' && request.url.includes('/drive/v3/files?fields=')) return { data: { id: 'sheet_ready_callback', name: 'Responses', webViewLink: 'https://sheet.test' } };
        if (request.url.includes('?fields=sheets.properties')) return { data: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } };
        return { data: {} };
    } } }) });

    await service.createAndInitialize({
        userId: 'user_1',
        title: 'Responses',
        sheetTitle: 'Approved',
        provisioningKey: 'ready_callback',
        onFileReady: resource => { readyResource = resource; }
    });

    assert.deepEqual(readyResource, {
        id: 'sheet_ready_callback',
        name: 'Responses',
        sheetTitle: 'Approved',
        range: "'Approved'!A1",
        webViewLink: 'https://sheet.test'
    });
});

test('resumes a persisted spreadsheet ID without creating another Drive file', async () => {
    const calls = [];
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async request => {
        calls.push(request);
        if (request.url.includes('?fields=sheets.properties')) return { data: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] } };
        if (request.method === 'PATCH' && request.url.includes('/drive/v3/files/')) return { data: { id: 'sheet_saved_after_failure', name: 'Responses', webViewLink: 'https://sheet.test/saved' } };
        return { data: {} };
    } } }) });

    const resumed = await service.createAndInitialize({
        userId: 'user_1',
        title: 'Responses',
        headers: ['Email'],
        provisioningKey: 'resume_persisted_file',
        existingSpreadsheetId: 'sheet_saved_after_failure'
    });

    assert.equal(resumed.id, 'sheet_saved_after_failure');
    assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/drive/v3/files?fields=')).length, 0);
    assert.equal(calls.filter(call => call.method === 'GET' && call.url.includes('/drive/v3/files?')).length, 0);
    assert.ok(calls.some(call => call.method === 'PATCH' && call.data?.name === 'Responses'));
});

test('keeps a prepared spreadsheet usable when Google rejects the cosmetic Drive rename', async () => {
    const calls = [];
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async request => {
        calls.push(request);
        if (request.url.includes('?fields=sheets.properties')) return { data: { sheets: [{ properties: { sheetId: 0, title: 'Responses' } }] } };
        if (request.method === 'PATCH' && request.url.includes('/drive/v3/files/')) {
            const error = new Error('Google denied the final Drive rename.');
            error.response = { status: 403, data: { error: { status: 'PERMISSION_DENIED' } } };
            throw error;
        }
        return { data: {} };
    } } }) });

    const prepared = await service.createAndInitialize({
        userId: 'user_1',
        title: 'Event Registration Responses',
        sheetTitle: 'Responses',
        headers: ['Email'],
        provisioningKey: 'rename_is_cosmetic',
        existingSpreadsheetId: 'sheet_already_prepared'
    });

    assert.equal(prepared.id, 'sheet_already_prepared');
    assert.equal(prepared.range, "'Responses'!A1");
    assert.ok(calls.some(call => call.method === 'PATCH'));
});

test('asks the user to connect Google when no active client is available', async () => {
    const service = createGoogleSpreadsheetService({ getGoogleClient: async () => { throw new Error('No active connection'); } });

    await assert.rejects(
        () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: 'proposal_missing_connection' }),
        error => error.code === 'GOOGLE_CONNECTION_REQUIRED'
            && error.status === 409
            && error.message === 'Connect Google before creating a spreadsheet.'
    );
});
