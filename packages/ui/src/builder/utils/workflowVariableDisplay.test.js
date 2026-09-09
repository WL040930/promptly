import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorkflowVariable, splitWorkflowVariableTokens } from './workflowVariableDisplay.js';
import { getUpstreamOutputs } from './getUpstreamOutputs.js';
import { descriptorFromVariable, normalizeEditorWorkflowValue } from './workflowReferenceInput.js';

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

test('webhook contracts expose typed body fields and reject arbitrary child paths', () => {
    const webhookNode = {
        id: 'webhook_1',
        title: 'Inbound Purchase',
        subType: 'webhook',
        type: 'trigger',
        config: {
            bodySchema: {
                type: 'object',
                properties: {
                    amount: { type: 'number' },
                    customer: { type: 'object', properties: { email: { type: 'string' } } }
                }
            }
        },
        schema: {
            outputs: [
                { name: 'triggerData', isConnection: true, type: 'object' },
                { name: 'body', type: 'object' },
                { name: 'headers', type: 'object' }
            ]
        }
    };
    const vars = getUpstreamOutputs('email_1', [webhookNode, { id: 'email_1', title: 'Notify' }], [{ source: 'webhook_1', target: 'email_1' }]);
    assert.deepEqual(vars.filter(variable => variable.path.startsWith('Inbound Purchase.body.')).map(variable => variable.path), [
        'Inbound Purchase.body.amount',
        'Inbound Purchase.body.customer',
        'Inbound Purchase.body.customer.email'
    ]);
    const amount = vars.find(variable => variable.runtimePath === 'webhook_1.body.amount');
    assert.equal(amount.type, 'number');
    assert.equal(amount.allowsCustomPath, false);

    const unknown = normalizeEditorWorkflowValue({
        value: '{{webhook_1.body.purchaseAction}}',
        availableVars: vars,
        path: 'config.body'
    });
    assert.equal(unknown.issues[0].code, 'WORKFLOW_REFERENCE_PATH_INVALID');
});

test('legacy webhooks retain generic body paths', () => {
    const vars = getUpstreamOutputs('email_1', [{
        id: 'webhook_legacy',
        title: 'Legacy Webhook',
        subType: 'webhook',
        type: 'trigger',
        config: {},
        schema: { outputs: [{ name: 'body', type: 'object' }] }
    }, { id: 'email_1', title: 'Notify' }], [{ source: 'webhook_legacy', target: 'email_1' }]);
    const result = normalizeEditorWorkflowValue({
        value: '{{webhook_legacy.body.anyFutureField}}',
        availableVars: vars
    });
    assert.deepEqual(result.issues, []);
});

test('editor picker descriptors become canonical references instead of raw tokens', () => {
    const availableVars = [{
        path: 'Promptly Form.fields.f_email',
        runtimePath: 'node_form_1.fields.f_email',
        nodeId: 'node_form_1',
        label: 'Email address'
    }];
    assert.deepEqual(descriptorFromVariable(availableVars[0]), {
        nodeId: 'node_form_1',
        path: ['fields', 'f_email'],
        runtimePath: 'node_form_1.fields.f_email'
    });
    const result = normalizeEditorWorkflowValue({
        value: 'Hi {{node_form_1.fields.f_email}}',
        availableVars,
        path: 'config.body'
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.value.$expr, 'template');
    assert.equal(result.value.parts[1].reference.nodeId, 'node_form_1');
});

test('editor keeps the last valid value when a manually typed reference is unknown', () => {
    const result = normalizeEditorWorkflowValue({
        value: 'Hi {{missing_step.email}}',
        availableVars: [],
        path: 'config.body'
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_SOURCE_UNKNOWN');
    assert.equal(result.value, 'Hi {{missing_step.email}}');
});

test('editor rejects an ambiguous manually typed step title', () => {
    const result = normalizeEditorWorkflowValue({
        value: '{{Notify.email}}',
        availableVars: [
            { nodeId: 'email_1', nodeTitle: 'Notify', path: 'Notify.email', runtimePath: 'email_1.email' },
            { nodeId: 'email_2', nodeTitle: 'Notify', path: 'Notify.email', runtimePath: 'email_2.email' }
        ]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_SOURCE_AMBIGUOUS');
});
