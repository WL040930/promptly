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

const formTrigger = {
    nodeKey: 'trigger:form-submission',
    type: 'trigger',
    title: 'Promptly Form',
    schema: {
        inputs: [{ name: 'formId', required: true }],
        outputs: [{ name: 'triggerData', isConnection: true }]
    }
};

const googleSheetsAction = {
    nodeKey: 'action:googleSheets',
    type: 'action',
    title: 'Google Sheets',
    schema: {
        inputs: [{ name: 'inputData', isConnection: true }],
        outputs: [{ name: 'outputData', isConnection: true }]
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

test('linear assembler emits a semantic approval gate before a following action', () => {
    const result = assembleLinearWorkflow({
        workflow: { nodes: [], edges: [] },
        specs: [formTrigger, approval, googleSheetsAction],
        formSchema: { id: 'form_feedback' },
        plan: {
            selectedNodeKeys: ['trigger:form-submission', 'logic:approval', 'action:googleSheets'],
            linearSteps: [
                { ref: 'feedback_form', nodeKey: 'trigger:form-submission', requirementIds: ['req_1'], config: {} },
                { ref: 'review_feedback', nodeKey: 'logic:approval', requirementIds: ['req_1'], config: {} },
                { ref: 'append_feedback', nodeKey: 'action:googleSheets', requirementIds: ['req_1'], config: {} }
            ]
        }
    });

    assert.equal(result.reason, null);
    assert.deepEqual(result.operations.map(operation => operation.op), ['create_node', 'add_approval_gate']);
    assert.equal(result.operations.some(operation => operation.op === 'create_node' && operation.node?.nodeKey === 'logic:approval'), false);
    assert.deepEqual(result.operations[1], {
        op: 'add_approval_gate',
        from: { nodeRef: 'feedback_form', handle: 'triggerData' },
        approval: { ref: 'review_feedback', title: 'Review new row', config: {} },
        whenApproved: { ref: 'append_feedback', nodeKey: 'action:googleSheets', title: 'Google Sheets', config: {} }
    });
});
