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

test('workflow resource provisioning replaces an instruction fragment with a safe Sheet title', async () => {
    let createdTitle = null;
    const result = await provisionWorkflowResources({
        userId: 'user_1',
        provisioningKeyPrefix: 'workflow-proposal:workflow_1:proposal_1',
        spreadsheetService: {
            async createAndInitialize(input) {
                createdTitle = input.title;
                return { id: 'sheet_456', range: "'Responses'!A1" };
            }
        },
        changes: [{
            type: 'create_google_spreadsheet',
            ref: 'responses',
            title: 'contact form and save every submission to a new',
            sheetTitle: 'Responses'
        }],
        nodes: []
    });

    assert.equal(createdTitle, 'Google Sheet Responses');
    assert.equal(result.changes[0].title, 'Google Sheet Responses');
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

test('workflow resource provisioning blocks an old form proposal that would create a Sheet per submission', async () => {
    let createCalls = 0;

    await assert.rejects(
        () => provisionWorkflowResources({
            userId: 'user_1',
            provisioningKeyPrefix: 'workflow-proposal:workflow_1:proposal_1',
            spreadsheetService: {
                async createAndInitialize() {
                    createCalls += 1;
                    throw new Error('must not run');
                }
            },
            changes: [{ type: 'create_google_spreadsheet', ref: 'responses', title: 'Event Registration' }],
            nodes: [
                { id: 'form', type: 'trigger', subType: 'form-submission', config: { formId: 'form_1' } },
                { id: 'create', type: 'action', subType: 'googleSheetsCreate', config: {} },
                { id: 'append', type: 'action', subType: 'googleSheets', config: { spreadsheetId: { $provision: 'responses' } } }
            ]
        }),
        error => error.code === 'WORKFLOW_FORM_RESPONSE_SHEET_DESTINATION_INVALID'
    );

    assert.equal(createCalls, 0);
});
