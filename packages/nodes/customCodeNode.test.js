import assert from 'node:assert/strict';
import test from 'node:test';
import CustomNodeJSNode from './core-logic/data-manipulation/custom-code/index.js';
import PromptlyFormNode from './triggers/system-triggers/form-submission/index.js';

test('custom JavaScript receives the previous step output as input', async () => {
    const node = new CustomNodeJSNode('custom_1', 'logic', 'customCode', {
        code: 'return { total: input.amount * 2 };'
    });

    const result = await node.execute({
        __runtime: { incomingNodeIds: ['previous_step'] },
        previous_step: { success: true, outputData: { amount: 4 } }
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.outputData, { total: 8 });
});

test('form submissions expose their fields as the standard output payload', async () => {
    const node = new PromptlyFormNode('form_1', 'trigger', 'form-submission', { formId: 'form_feedback' });
    const result = await node.execute({
        initialPayload: { responseId: 'response_1', fields: { rating: 5 } }
    });

    assert.deepEqual(result.outputData, { rating: 5 });
});
