import test from 'node:test';
import assert from 'node:assert/strict';
import { contextAfterApplyingForm, prepareAgentWorkflowArtifact, selectFormProposalPatches } from './agentApplyService.js';

test('Ask Promptly applies the same selected form patch set shown in the Form AI preview', () => {
    const patches = [
        { op: 'update_meta', patchId: 'title' },
        { op: 'add', patchId: 'resume' },
        { op: 'add', patchId: 'cover-letter' }
    ];

    const selected = selectFormProposalPatches({
        patches,
        selectedPatchIds: ['title', 'cover-letter']
    });

    assert.deepEqual(selected.selectedPatchIds, ['title', 'cover-letter']);
    assert.deepEqual(selected.patches.map(patch => patch.patchId), ['title', 'cover-letter']);
    assert.equal(selected.selectionApplied, true);
});

test('Ask Promptly rejects a patch selection that did not come from the proposal', () => {
    assert.throws(
        () => selectFormProposalPatches({ patches: [{ op: 'add', patchId: 'name' }], selectedPatchIds: ['unknown'] }),
        error => error.code === 'AGENT_INVALID_PROPOSAL'
    );
});

test('Ask Promptly remembers an applied form for the next conversational request', () => {
    assert.deepEqual(
        contextAfterApplyingForm({ workflowId: 'workflow_1', clarificationMode: 'ask_important' }, 'form_1'),
        { workflowId: 'workflow_1', formId: 'form_1', clarificationMode: 'ask_important' }
    );
});

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
