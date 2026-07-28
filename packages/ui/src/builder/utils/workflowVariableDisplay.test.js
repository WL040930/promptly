import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorkflowVariable, splitWorkflowVariableTokens } from './workflowVariableDisplay.js';
import { getUpstreamOutputs } from './getUpstreamOutputs.js';

const formNode = {
    id: 'node_form_1',
    title: 'Promptly Form',
    subType: 'form-submission',
    config: { formId: 'form_1' }
};
const formsById = {
    form_1: { id: 'form_1', fields: [{ id: 'f_email', label: 'Email address', type: 'email' }] }
};

test('describes canonical form runtime references with user-facing labels', () => {
    const variable = describeWorkflowVariable('node_form_1.fields.f_email', [formNode], formsById);
    assert.equal(variable.displayLabel, 'Promptly Form › Email address');
    assert.equal(variable.isResolved, true);
});

test('keeps older title-based references readable', () => {
    const variable = describeWorkflowVariable('Promptly Form.fields.f_email', [formNode], formsById);
    assert.equal(variable.displayLabel, 'Promptly Form › Email address');
    assert.equal(variable.isResolved, true);
});

test('identifies an unknown form field without exposing it as a valid value', () => {
    const variable = describeWorkflowVariable('node_form_1.fields.f_missing', [formNode], formsById);
    assert.equal(variable.displayLabel, 'Promptly Form › Unknown field (f_missing)');
    assert.equal(variable.isResolved, false);
});

test('splits text with multiple workflow variables for rich rendering', () => {
    assert.deepEqual(splitWorkflowVariableTokens('Hi {{node_form_1.fields.f_email}}, thanks'), [
        'Hi ', '{{node_form_1.fields.f_email}}', ', thanks'
    ]);
});

test('variable picker keeps a readable path but inserts an unambiguous runtime path', () => {
    const target = { id: 'email_1', title: 'Thank you email' };
    const [field] = getUpstreamOutputs('email_1', [
        { ...formNode, schema: { outputs: [{ name: 'fields', expandable: true, type: 'object' }] } },
        target
    ], [{ source: 'node_form_1', target: 'email_1' }], {
        node_form_1: { form: formsById.form_1, fields: formsById.form_1.fields }
    }).filter(variable => variable.isFormField);

    assert.equal(field.path, 'Promptly Form.fields.f_email');
    assert.equal(field.runtimePath, 'node_form_1.fields.f_email');
});
