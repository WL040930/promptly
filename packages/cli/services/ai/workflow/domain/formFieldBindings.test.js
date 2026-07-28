import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formFieldBindingsForWorker,
    normalizeFormFieldBindings
} from './formFieldBindings.js';
import { compileWorkflowDraft } from '../workflowAgentService.js';

const fieldId = 'f_1785162183392_7owf';
const formSchema = { fields: [{ id: fieldId, label: 'Email address', type: 'email', required: true }] };
const formTrigger = { id: 'form_trigger_1', type: 'trigger', subType: 'form-submission', config: { formId: 'form_1' } };

test('normalizes semantic and legacy form field tokens after the form trigger ID is known', () => {
    const result = normalizeFormFieldBindings({
        formSchema,
        nodes: [
            formTrigger,
            { id: 'email_1', type: 'action', subType: 'email', config: {
                to: `{{formField:${fieldId}}}`,
                body: `Thanks — we will reply to {{fields.${fieldId}}}.`
            } }
        ]
    });

    assert.equal(result.issues.length, 0);
    assert.equal(result.nodes[1].config.to, `{{form_trigger_1.fields.${fieldId}}}`);
    assert.equal(result.nodes[1].config.body, `Thanks — we will reply to {{form_trigger_1.fields.${fieldId}}}.`);
    assert.equal(result.repairs.length, 2);
});

test('rejects unknown and unbound form field tokens instead of guessing', () => {
    const unknown = normalizeFormFieldBindings({
        formSchema,
        nodes: [formTrigger, { id: 'email_1', config: { to: '{{fields.missing_field}}' } }]
    });
    const unbound = normalizeFormFieldBindings({
        formSchema,
        nodes: [{ id: 'email_1', config: { to: `{{fields.${fieldId}}}` } }]
    });

    assert.ok(unknown.issues.some(issue => issue.code === 'FORM_FIELD_REFERENCE_UNKNOWN'));
    assert.ok(unbound.issues.some(issue => issue.code === 'FORM_FIELD_REFERENCE_SOURCE_AMBIGUOUS'));
});

test('worker form context exposes a model-safe semantic token and current runtime token', () => {
    const [binding] = formFieldBindingsForWorker({ workflow: { nodes: [formTrigger] }, formSchema });
    assert.equal(binding.semanticToken, `{{formField:${fieldId}}}`);
    assert.equal(binding.runtimeToken, `{{form_trigger_1.fields.${fieldId}}}`);
});

test('workflow compilation converts an AI legacy token before a proposal is stored', () => {
    const compiled = compileWorkflowDraft({
        formSchema,
        nodes: [
            formTrigger,
            { id: 'email_1', type: 'action', subType: 'email', config: { to: `{{fields.${fieldId}}}` } }
        ]
    });

    assert.equal(compiled.bindingIssues.length, 0);
    assert.equal(compiled.nodes[1].config.to, `{{form_trigger_1.fields.${fieldId}}}`);
});
