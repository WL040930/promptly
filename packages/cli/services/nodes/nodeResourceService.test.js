import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeResourceService, NodeResourceError } from './nodeResourceService.js';

const model = records => ({
    findAll: async () => records,
    findOne: async () => records[0] || null
});

const createService = overrides => createNodeResourceService({
    models: {
        Form: model([{ id: 'form_1', title: 'Registration' }]),
        Workflow: model([{ id: 'workflow_1', name: 'Welcome flow', status: 'Draft' }]),
        ExecutionLog: model([{ id: 'run_1234567890', status: 'Succeeded', workflowId: 'workflow_1' }]),
        Connection: model([{ accountEmail: 'owner@example.com' }])
    },
    getGoogleClient: async () => ({
        connection: { accountEmail: 'owner@example.com' },
        client: {
            request: async ({ url }) => url.includes('/drive/v3/files')
                ? { data: { files: [{ id: 'sheet_12345678901234567890', name: 'Orders', modifiedTime: '2026-07-01T00:00:00Z' }] } }
                : { data: { properties: { title: 'Orders' }, sheets: [{ properties: { sheetId: 1, title: 'July Orders', gridProperties: { rowCount: 200, columnCount: 30 } } }] } }
        }
    }),
    ...overrides
});

test('node resource service exposes account-owned resources without leaking model records', async () => {
    const service = createService();
    const forms = await service.list({ userId: 'user_1', resource: 'forms' });
    const records = await service.list({ userId: 'user_1', resource: 'promptly-records', params: { resource: 'executionLogs' } });
    assert.deepEqual(forms.options, [{ value: 'form_1', label: 'Registration', description: 'Promptly form' }]);
    assert.equal(records.options[0].value, 'run_1234567890');
});

test('node resource service lists spreadsheets and derives friendly full-sheet ranges', async () => {
    const service = createService();
    const spreadsheets = await service.list({ userId: 'user_1', resource: 'google-spreadsheets' });
    const ranges = await service.list({ userId: 'user_1', resource: 'google-sheet-ranges', params: { spreadsheetId: spreadsheets.options[0].value } });
    assert.equal(spreadsheets.options[0].label, 'Orders');
    assert.deepEqual(ranges.options[0], {
        value: "'July Orders'!A1:AD200",
        label: 'July Orders',
        description: 'AD columns · 200 rows',
        metadata: { sheetId: 1 }
    });
});

test('node resource service returns an actionable reconnect error for unavailable Google access', async () => {
    const service = createService({ getGoogleClient: async () => { throw new Error('missing'); } });
    await assert.rejects(
        () => service.list({ userId: 'user_1', resource: 'google-spreadsheets' }),
        error => error instanceof NodeResourceError
            && error.code === 'GOOGLE_CONNECTION_REQUIRED'
            && error.action.href === '/app/settings/connections'
    );
});

