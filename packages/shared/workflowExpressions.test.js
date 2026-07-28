import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormBindingCatalogue, compileWorkflowBindings, resolveWorkflowExpression, validateWorkflowExpressions } from './workflowExpressions.js';

const form = { id: 'form_1', fields: [{ id: 'f_real_email', label: 'Email address', type: 'email', required: true }, { id: 'f_real_name', label: 'Full name', type: 'text' }] };
const trigger = { id: 'trigger_1', subType: 'form-submission', config: { formId: 'form_1' } };

test('compiles only server-issued binding keys into canonical field references', () => {
    const catalogue = buildFormBindingCatalogue(form);
    assert.deepEqual(catalogue.bindings.map(item => item.key), ['submission_submitted_at', 'submission_response_id', 'form_field_1', 'form_field_2']);
    const result = compileWorkflowBindings({ nodes: [trigger, { id: 'email_1', config: { to: { $binding: 'form_field_1' }, body: { $template: ['Hi ', { $binding: 'form_field_2' }] } } }], formSchema: form });
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.nodes[1].config.to, { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_real_email'] });
    assert.equal(result.nodes[1].config.body.$expr, 'template');
});

test('compiles submission metadata bindings for spreadsheet rows', () => {
    const result = compileWorkflowBindings({ nodes: [trigger, { id: 'sheet_1', config: { values: [[{ $binding: 'submission_submitted_at' }, { $binding: 'submission_response_id' }]] } }], formSchema: form });
    assert.deepEqual(result.nodes[1].config.values[0], [
        { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['submittedAt'] },
        { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['responseId'] }
    ]);
});

test('rejects invented binding keys instead of guessing a form field', () => {
    const result = compileWorkflowBindings({ nodes: [trigger, { id: 'email_1', config: { to: { $binding: 'f_email' } } }], formSchema: form });
    assert.equal(result.issues[0].code, 'WORKFLOW_BINDING_UNKNOWN');
});

test('resolves canonical expressions without exposing template syntax to nodes', () => {
    const expression = { $expr: 'template', v: 1, parts: [{ text: 'Hi ' }, { reference: { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_real_name'] } }] };
    assert.equal(resolveWorkflowExpression(expression, { trigger_1: { fields: { f_real_name: 'Sam' } } }).value, 'Hi Sam');
    assert.equal(validateWorkflowExpressions({ nodes: [trigger, { id: 'email_1', config: { body: expression } }], formSchema: form }).length, 0);
});
