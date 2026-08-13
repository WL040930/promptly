import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAgentWorkflowArtifact } from './agentApplyService.js';

test('Ask Promptly prepares a compound workflow artifact by provisioning its response Sheet once', async () => {
    const formArtifact = {
        artifactKey: 'form_proposal',
        content: { schema: { fields: [{ id: 'name', label: 'Name', type: 'text' }] } }
    };
    const workflowArtifact = {
        id: 'artifact_workflow_1',
        artifactKey: 'workflow_proposal',
        type: 'workflow_proposal',
        status: 'draft',
        content: {
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses', title: 'Event Responses' }],
            nodes: [
                { id: 'form', subType: 'form-submission', config: { formId: 'artifact:form' } },
                { id: 'append', subType: 'googleSheets', config: { spreadsheetId: { $provision: 'responses' }, values: [] } }
            ]
        }
    };
    const run = {
        id: 'run_1',
        artifacts: [formArtifact, workflowArtifact],
        async update(patch) { Object.assign(this, patch); return this; }
    };
    let calls = 0;
    const spreadsheetService = {
        async createAndInitialize(input) {
            calls += 1;
            await input.onFileReady?.({ id: 'sheet_1', range: "'Responses'!A1", webViewLink: 'https://example.test/sheet_1' });
            return { id: 'sheet_1', range: "'Responses'!A1", webViewLink: 'https://example.test/sheet_1' };
        }
    };

    const prepared = await prepareAgentWorkflowArtifact({
        run, artifact: workflowArtifact, formArtifact, userId: 'user_1', spreadsheetService
    });
    assert.equal(calls, 1);
    assert.deepEqual(prepared.content.resourceChanges[0].headers, ['Submitted At', 'Response ID', 'Name']);
    assert.equal(prepared.content.nodes.find(node => node.id === 'append').config.spreadsheetId, 'sheet_1');
    assert.equal(prepared.content.nodes.find(node => node.id === 'append').config.values[0].length, 3);

    const retried = await prepareAgentWorkflowArtifact({
        run, artifact: prepared, formArtifact, userId: 'user_1', spreadsheetService
    });
    assert.equal(calls, 1);
    assert.equal(retried.content.resourceChanges[0].status, 'ready');
});
