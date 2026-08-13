import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionWorkflowResources } from './workflowResourceProvisioner.js';

test('workflow resource provisioning resolves one Sheet reference and reuses a ready resource', async () => {
    const calls = [];
    const spreadsheetService = {
        async createAndInitialize(input) {
            calls.push(input);
            await input.onFileReady?.({ id: 'sheet_123', range: "'Responses'!A1", webViewLink: 'https://example.test/sheet' });
            return { id: 'sheet_123', range: "'Responses'!A1", webViewLink: 'https://example.test/sheet' };
        }
    };
    const input = {
        userId: 'user_1',
        provisioningKeyPrefix: 'agent-run:run_1:artifact_1',
        spreadsheetService,
        changes: [{
            type: 'create_google_spreadsheet', ref: 'responses', title: 'Event Registration',
            sheetTitle: 'Responses', headers: ['Submitted At', 'Name']
        }],
        nodes: [{ id: 'append', subType: 'googleSheets', config: { spreadsheetId: { $provision: 'responses' }, range: "'Wrong'!A1" } }]
    };

    const first = await provisionWorkflowResources(input);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].headers, ['Submitted At', 'Name']);
    assert.equal(first.nodes[0].config.spreadsheetId, 'sheet_123');
    assert.equal(first.nodes[0].config.range, "'Responses'!A1");
    assert.equal(first.changes[0].status, 'ready');

    const second = await provisionWorkflowResources({ ...input, nodes: first.nodes, changes: first.changes });
    assert.equal(calls.length, 1);
    assert.equal(second.nodes[0].config.spreadsheetId, 'sheet_123');
});

test('workflow resource provisioning rejects an undeclared provision reference', async () => {
    await assert.rejects(
        () => provisionWorkflowResources({
            userId: 'user_1',
            provisioningKeyPrefix: 'agent-run:run_1:artifact_1',
            spreadsheetService: { async createAndInitialize() { throw new Error('must not run'); } },
            changes: [],
            nodes: [{ id: 'append', subType: 'googleSheets', config: { spreadsheetId: { $provision: 'missing' } } }]
        }),
        error => error.code === 'WORKFLOW_PROVISION_REFERENCE_INVALID'
    );
});
