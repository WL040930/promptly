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
