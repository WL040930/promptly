import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRespondentEmailField, shouldPauseForPlanReview } from './agentOrchestrator.js';
import { compileExecutionPlan, makeAdaptivePlan, makeFallbackOutcomePlan } from './agentPlanCompiler.js';
import { createAgentCapabilityRegistry } from './agentCapabilityRegistry.js';

const compoundIntent = {
    domains: ['form', 'workflow'],
    resourceReferences: [],
    requirements: ['Create a form and follow up after submission.']
};

test('adaptive plans preserve model step IDs, order, and dependencies', () => {
    const registry = createAgentCapabilityRegistry([
        { name: 'prepare_data', inputSchema: { type: 'object', additionalProperties: false }, execute: async () => ({}) },
        { name: 'create_form', inputSchema: { type: 'object', additionalProperties: false }, execute: async () => ({}) },
        { name: 'send_email', inputSchema: { type: 'object', properties: { source: { type: 'string' } }, additionalProperties: false }, execute: async () => ({}) }
    ]);
    const plan = makeAdaptivePlan({
        summary: 'Create and notify.',
        outcomes: [{ id: 'notify', title: 'Notify the respondent' }],
        steps: [
            { id: 'email_step', type: 'send_email', args: { source: '$step.form_step' } },
            { id: 'form_step', type: 'create_form' }
        ]
    }, compoundIntent);
    const result = compileExecutionPlan({ plan, registry });
    assert.equal(result.valid, true);
    assert.deepEqual(result.graph.order, ['form_step', 'email_step']);
    assert.equal(result.graph.steps[0].id, 'email_step');
    assert.deepEqual(result.graph.steps[0].dependsOn, ['form_step']);
});

test('compound requests require a plan review even without plan wording', () => {
    assert.equal(
        shouldPauseForPlanReview('Create a registration form and email the respondent after submission.', compoundIntent),
        true
    );
});

test('respondent confirmation forms have one required email field without replacing valid form content', () => {
    const schema = ensureRespondentEmailField({
        title: 'Application',
        fields: [
            { id: 'full_name', type: 'text', label: 'Full name' },
            { id: 'contact_address', type: 'email', label: 'Contact address', required: false }
        ]
    });

    assert.equal(schema.fields.find(field => field.id === 'contact_address').required, true);
    assert.equal(schema.fields.some(field => field.id === 'full_name'), true);
    assert.equal(schema.fields.filter(field => field.type === 'email').length, 1);
});

test('respondent confirmation forms add a non-colliding email field when none exists', () => {
    const schema = ensureRespondentEmailField({
        title: 'Application',
        fields: [{ id: 'email', type: 'text', label: 'Internal email note' }]
    });

    assert.equal(schema.fields.at(-1).type, 'email');
    assert.equal(schema.fields.at(-1).required, true);
    assert.notEqual(schema.fields.at(-1).id, 'email');
});

test('fallback plans describe supported outcomes without adding a verification capability', () => {
    const result = makeFallbackOutcomePlan({ domains: ['form', 'workflow'], risk: 'medium' });

    assert.deepEqual(result.outcomes.map(outcome => outcome.id), ['form_solution', 'workflow_solution']);
    assert.deepEqual(result.steps.map(step => step.type), ['design_form', 'design_workflow']);
    assert.equal(result.steps.some(step => step.type === 'verify'), false);
});

test('adaptive compiler rejects unavailable capabilities with repairable issues', () => {
    const registry = createAgentCapabilityRegistry([{ name: 'create_form', execute: async () => ({}) }]);
    const result = compileExecutionPlan({
        plan: { outcomes: [], steps: [{ id: 'sheet', type: 'update_excel' }] },
        registry
    });
    assert.equal(result.valid, false);
    assert.equal(result.issues[0].code, 'CAPABILITY_UNAVAILABLE');
    assert.equal(result.issues[0].capability, 'update_excel');
});

test('adaptive compiler rejects invalid arguments and dependency cycles', () => {
    const registry = createAgentCapabilityRegistry([{
        name: 'create_form',
        inputSchema: { type: 'object', required: ['title'], additionalProperties: false },
        execute: async () => ({})
    }]);
    const result = compileExecutionPlan({
        plan: {
            outcomes: [],
            steps: [
                { id: 'a', type: 'create_form', args: {}, dependsOn: ['b'] },
                { id: 'b', type: 'create_form', args: { title: 'B' }, dependsOn: ['a'] }
            ]
        },
        registry
    });
    assert.equal(result.valid, false);
    assert.equal(result.issues.some(issue => issue.code === 'CAPABILITY_ARGUMENT_INVALID'), true);
    assert.equal(result.issues.some(issue => issue.code === 'PLAN_CYCLE'), true);
});
