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

test('explains that Google must be reconnected when Drive or Sheets returns 401/403', async () => {
    for (const status of [401, 403]) {
        const service = createGoogleSpreadsheetService({ getGoogleClient: async () => ({ client: { request: async () => {
            const error = new Error(`Google returned ${status}`);
            error.response = { status };
            throw error;
        } } }) });

        await assert.rejects(
            () => service.createAndInitialize({ userId: 'user_1', title: 'Responses', provisioningKey: `proposal_${status}` }),
            error => error.code === 'GOOGLE_RECONNECT_REQUIRED'
                && error.status === 409
                && error.message === 'Reconnect Google to create and use spreadsheets.'
                && error.action?.href === '/app/settings/connections'
        );
    }
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
