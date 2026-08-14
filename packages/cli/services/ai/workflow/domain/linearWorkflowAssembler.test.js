import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleLinearWorkflow } from './linearWorkflowAssembler.js';

const googleSheetsTrigger = {
    nodeKey: 'trigger:googleSheets',
    type: 'trigger',
    title: 'Google Sheets trigger',
    schema: {
        inputs: [],
        outputs: [{ name: 'triggerData', isConnection: true }]
    }
};

const approval = {
    nodeKey: 'logic:approval',
    type: 'logic',
    title: 'Review new row',
    schema: {
        inputs: [{ name: 'inputData', isConnection: true }],
        outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }]
    }
};

test('linear assembler permits a terminal approval without inventing an approval route', () => {
    const result = assembleLinearWorkflow({
        workflow: { nodes: [], edges: [] },
        specs: [googleSheetsTrigger, approval],
        plan: {
            selectedNodeKeys: ['trigger:googleSheets', 'logic:approval'],
            linearSteps: [
                { ref: 'sheet_row', nodeKey: 'trigger:googleSheets', requirementIds: ['req_1'], config: {} },
                { ref: 'review_row', nodeKey: 'logic:approval', requirementIds: ['req_1'], config: {} }
            ]
        }
    });

    assert.equal(result.reason, null);
    assert.deepEqual(result.operations.map(operation => operation.op), ['create_node', 'add_terminal_approval']);
    assert.deepEqual(result.operations[1], {
        op: 'add_terminal_approval',
        from: { nodeRef: 'sheet_row', handle: 'triggerData' },
        approval: { ref: 'review_row', title: 'Review new row', config: {} }
    });
});
