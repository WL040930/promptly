import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkflowMetadataUpdates, resolveProvisionedGoogleSheetConfigs } from './workflowProposalApplier.js';

test('proposal application uses Google\'s authoritative range for a provisioned sheet', () => {
    const nodes = [{
        id: 'append', type: 'action', subType: 'googleSheets',
        config: { spreadsheetId: { $provision: 'approved_sheet' }, range: "'Sheet1'!A1", operation: 'append' }
    }];
    const resolved = resolveProvisionedGoogleSheetConfigs(nodes, new Map([[
        'approved_sheet', { id: 'spreadsheet_123', range: "'Responses'!A1" }
    ]]), (code, message) => Object.assign(new Error(message), { code }));

    assert.deepEqual(resolved, [{
        id: 'append', type: 'action', subType: 'googleSheets',
        config: { spreadsheetId: 'spreadsheet_123', range: "'Responses'!A1", operation: 'append' }
    }]);
});

test('proposal application updates only the requested workflow name', async () => {
    const workflow = {
        name: 'New Automation',
        async update(patch) { Object.assign(this, patch); }
    };
    const errorWith = (code, message) => Object.assign(new Error(message), { code });

    await applyWorkflowMetadataUpdates({
        workflow,
        updates: { name: 'Event Registration Automation' },
        errorWith
    });

    assert.equal(workflow.name, 'Event Registration Automation');
    await assert.rejects(
        () => applyWorkflowMetadataUpdates({ workflow, updates: { description: 'Unexpected' }, errorWith }),
        error => error.code === 'WORKFLOW_PROPOSAL_METADATA_INVALID'
    );
});
