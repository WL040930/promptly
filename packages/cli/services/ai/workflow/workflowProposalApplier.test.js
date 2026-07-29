import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvisionedGoogleSheetConfigs } from './workflowProposalApplier.js';

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
