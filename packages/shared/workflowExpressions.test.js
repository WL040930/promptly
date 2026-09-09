import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildFormBindingCatalogue,
    collectWebhookBodyReferenceKeys,
    compileWorkflowBindings,
    normalizeWorkflowReferences,
    resolveWorkflowExpression,
    validateWorkflowExpressions
} from './workflowExpressions.js';

const form = { id: 'form_1', fields: [{ id: 'f_real_email', label: 'Email address', type: 'email', required: true }, { id: 'f_real_name', label: 'Full name', type: 'text' }] };
const trigger = { id: 'trigger_1', subType: 'form-submission', config: { formId: 'form_1' } };
const emailSchema = {
    inputs: [
        { name: 'to', valueSyntax: 'workflow-expression' },
        { name: 'body', valueSyntax: 'workflow-expression' },
        { name: 'prompt', valueSyntax: 'node-template' }
    ],
    outputs: []
};

const webhook = {
    id: 'webhook_1',
    subType: 'webhook',
    type: 'trigger',
    config: {
        webhookId: 'inbound_1',
        bodySchema: {
            type: 'object',
            properties: {
                amount: { type: 'number' },
                customer: { type: 'object', properties: { email: { type: 'string' } } }
            },
            required: ['amount']
        }
    }
};

const normalizeEmailWorkflow = ({ nodes, edges = [{ source: 'trigger_1', target: 'email_1' }], formSchema = form, rejectLegacy = false } = {}) => normalizeWorkflowReferences({
    nodes,
    edges,
    formSchema,
    rejectLegacy,
    schemaForNode: node => node.id === 'email_1' ? emailSchema : node.schema || {}
});

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

test('accepts declared webhook body references in canonical form', () => {
    const result = validateWorkflowExpressions({
        nodes: [webhook, { id: 'email_1', config: { body: { $expr: 'reference', v: 1, nodeId: 'webhook_1', path: ['body', 'amount'] } } }],
        edges: [{ source: 'webhook_1', target: 'email_1' }],
        requireWebhookContractForBodyPaths: true
    });
    assert.deepEqual(result, []);
});

test('rejects invented webhook body paths and uncontracted AI mappings', () => {
    const unknown = validateWorkflowExpressions({
        nodes: [webhook, { id: 'email_1', config: { body: { $expr: 'reference', v: 1, nodeId: 'webhook_1', path: ['body', 'purchaseAction'] } } }],
        edges: [{ source: 'webhook_1', target: 'email_1' }],
        requireWebhookContractForBodyPaths: true
    });
    assert.equal(unknown[0].code, 'WEBHOOK_BODY_FIELD_UNKNOWN');

    const missing = validateWorkflowExpressions({
        nodes: [{ ...webhook, config: { webhookId: 'inbound_1' } }, { id: 'email_1', config: { body: { $expr: 'reference', v: 1, nodeId: 'webhook_1', path: ['body', 'amount'] } } }],
        edges: [{ source: 'webhook_1', target: 'email_1' }],
        requireWebhookContractForBodyPaths: true
    });
    assert.equal(missing[0].code, 'WEBHOOK_BODY_SCHEMA_REQUIRED');
});

test('keeps an unchanged legacy webhook reference compatible while strict AI mappings require a contract', () => {
    const existing = {
        ...webhook,
        config: { webhookId: 'inbound_1' }
    };
    const unchanged = {
        id: 'email_1',
        config: { body: { $expr: 'reference', v: 1, nodeId: 'webhook_1', path: ['body', 'amount'] } }
    };
    const legacyKeys = collectWebhookBodyReferenceKeys([existing, unchanged]);
    assert.deepEqual(validateWorkflowExpressions({
        nodes: [existing, unchanged],
        edges: [{ source: 'webhook_1', target: 'email_1' }],
        requireWebhookContractForBodyPaths: true,
        strictWebhookReferenceTargets: new Set(['email_1']),
        legacyWebhookReferenceKeys: legacyKeys
    }), []);
});

test('resolves an omitted optional form field as an empty value', () => {
    const expression = { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_optional_comments'] };
    const result = resolveWorkflowExpression(expression, {
        trigger_1: {
            success: true,
            triggerData: { fields: { f_real_name: 'Sam' } },
            fields: { f_real_name: 'Sam' },
            responseId: 'response_1',
            submittedAt: '2026-08-12T15:22:41.280Z'
        }
    });

    assert.equal(result.value, '');
    assert.deepEqual(result.unresolved, []);

    const missingMetadata = resolveWorkflowExpression(
        { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['missing'] },
        { trigger_1: { success: true, triggerData: { fields: {} }, fields: {} } }
    );
    assert.deepEqual(missingMetadata.unresolved, [{ $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['missing'] }]);
});

test('normalizes an exact legacy reference into a canonical expression', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { to: '{{trigger_1.fields.f_real_email}}' } }]
    });

    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.nodes[1].config.to, {
        $expr: 'reference',
        v: 1,
        nodeId: 'trigger_1',
        path: ['fields', 'f_real_email']
    });
    assert.equal(result.repairs[0].code, 'WORKFLOW_REFERENCE_NORMALIZED');
});

test('normalizes mixed legacy text into a canonical template', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { body: 'Hi {{trigger_1.fields.f_real_name}}, thanks!' } }]
    });

    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.nodes[1].config.body, {
        $expr: 'template',
        v: 1,
        parts: [
            { text: 'Hi ' },
            { reference: { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_real_name'] } },
            { text: ', thanks!' }
        ]
    });
});

test('resolves a unique upstream node title while keeping the real node ID', () => {
    const titledTrigger = { ...trigger, title: 'Promptly Form' };
    const result = normalizeEmailWorkflow({
        nodes: [titledTrigger, { id: 'email_1', title: 'Thank-you email', config: { to: '{{Promptly Form.fields.f_real_email}}' } }]
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.nodes[1].config.to.nodeId, 'trigger_1');
});

test('rejects an unknown legacy source without persisting a partial conversion', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { body: 'Hi {{missing_step.name}}!' } }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_SOURCE_UNKNOWN');
    assert.equal(result.nodes[1].config.body, 'Hi {{missing_step.name}}!');
});

test('rejects an ambiguous title instead of guessing a source node', () => {
    const first = { ...trigger, id: 'trigger_1', title: 'Promptly Form' };
    const second = { ...trigger, id: 'trigger_2', title: 'Promptly Form', config: { formId: 'form_1' } };
    const result = normalizeEmailWorkflow({
        nodes: [first, second, { id: 'email_1', title: 'Thank-you email', config: { to: '{{Promptly Form.fields.f_real_email}}' } }],
        edges: [{ source: 'trigger_1', target: 'email_1' }, { source: 'trigger_2', target: 'email_1' }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_SOURCE_AMBIGUOUS');
});

test('rejects a syntactically valid source that is not upstream', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'other_1', title: 'Other step', config: {} }, { id: 'email_1', title: 'Thank-you email', config: { to: '{{other_1.email}}' } }],
        edges: [{ source: 'trigger_1', target: 'email_1' }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM');
});

test('rejects a deleted form field', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { to: '{{trigger_1.fields.f_deleted}}' } }],
        formSchema: { ...form, fields: [...form.fields, { id: 'f_deleted', label: 'Old field', deleted: true }] }
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_FIELD_MISSING');
});

test('rejects nested paths beneath a form field reference', () => {
    const result = validateWorkflowExpressions({
        nodes: [trigger, {
            id: 'email_1',
            title: 'Thank-you email',
            config: {
                to: { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_real_email', 'value'] }
            }
        }],
        edges: [{ source: 'trigger_1', target: 'email_1' }],
        formSchema: form
    });

    assert.equal(result[0].code, 'WORKFLOW_REFERENCE_PATH_INVALID');
});

test('rejects connection handles as workflow reference roots', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { to: '{{triggerData.fields.f_real_email}}' } }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_ROOT_HANDLE');
    assert.match(result.issues[0].message, /connection handle/);
});

test('rejects unsupported workflow interpolation syntax without changing the value', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { to: '${steps.form_trigger.triggerData.f_real_email}' } }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_UNSUPPORTED_SYNTAX');
    assert.equal(result.nodes[1].config.to, '${steps.form_trigger.triggerData.f_real_email}');
});

test('rejects unsupported interpolation inside a canonical template literal', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, {
            id: 'email_1',
            title: 'Thank-you email',
            config: {
                body: { $expr: 'template', v: 1, parts: [{ text: 'Hi ${steps.form_trigger.triggerData.f_real_name}' }] }
            }
        }]
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_UNSUPPORTED_SYNTAX');
});

test('node-template inputs retain unsupported interpolation text unchanged', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { prompt: '${inputData}' } }]
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.nodes[1].config.prompt, '${inputData}');
});

test('AI mode rejects legacy references while save mode can normalize them', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { to: '{{trigger_1.fields.f_real_email}}' } }],
        rejectLegacy: true
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_LEGACY_FORBIDDEN');
    assert.equal(result.nodes[1].config.to, '{{trigger_1.fields.f_real_email}}');
});

test('AI mode also rejects legacy references hidden inside a structured template', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { body: { $template: ['Hi {{trigger_1.fields.f_real_name}}'] } } }],
        rejectLegacy: true
    });

    assert.equal(result.issues[0].code, 'WORKFLOW_REFERENCE_LEGACY_FORBIDDEN');
});

test('node-template inputs retain their existing raw template behavior', () => {
    const result = normalizeEmailWorkflow({
        nodes: [trigger, { id: 'email_1', title: 'Thank-you email', config: { prompt: '{{inputData}}' } }]
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.nodes[1].config.prompt, '{{inputData}}');
});

test('rejects malformed canonical template parts', () => {
    const result = validateWorkflowExpressions({
        nodes: [trigger, {
            id: 'email_1',
            title: 'Thank-you email',
            config: {
                body: {
                    $expr: 'template',
                    v: 1,
                    parts: [{
                        text: 'Hi',
                        reference: { $expr: 'reference', v: 1, nodeId: 'trigger_1', path: ['fields', 'f_real_email'] }
                    }]
                }
            }
        }],
        edges: [{ source: 'trigger_1', target: 'email_1' }],
        formSchema: form
    });

    assert.equal(result[0].code, 'WORKFLOW_TEMPLATE_INVALID');
});
