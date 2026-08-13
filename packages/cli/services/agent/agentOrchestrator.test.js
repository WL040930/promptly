import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildWorkflowProposalContent,
    deterministicIntent,
    ensureRespondentEmailField,
    proposedFormSchemaForWorkflow,
    shouldPauseForPlanReview,
    workflowTurnContextForAgent
} from './agentOrchestrator.js';
import { compileExecutionPlan, makeAdaptivePlan, makeFallbackOutcomePlan } from './agentPlanCompiler.js';
import { createAgentCapabilityRegistry } from './agentCapabilityRegistry.js';

const compoundIntent = {
    domains: ['form', 'workflow'],
    resourceReferences: [],
    requirements: ['Create a form and follow up after submission.']
};

const genericIntent = {
    domains: [],
    resourceReferences: [],
    requirements: ['Prepare the requested steps.']
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
    }, genericIntent);
    const result = compileExecutionPlan({ plan, registry });
    assert.equal(result.valid, true);
    assert.deepEqual(result.graph.order, ['form_step', 'email_step']);
    assert.equal(result.graph.steps[0].id, 'email_step');
    assert.deepEqual(result.graph.steps[0].dependsOn, ['form_step']);
});

test('compound requests proceed without plan review unless explicitly requested', () => {
    assert.equal(
        shouldPauseForPlanReview('Create a registration form and email the respondent after submission.', compoundIntent),
        false
    );
    assert.equal(shouldPauseForPlanReview('Create it, but show me the plan first.'), true);
});

test('adaptive plans restore omitted form and workflow outcomes and steps', () => {
    const plan = makeAdaptivePlan({
        summary: 'Create the application form.',
        outcomes: [{ id: 'form_solution', title: 'Create the form', artifactTypes: ['form_proposal'] }],
        steps: [{ id: 'design_form', type: 'design_form' }]
    }, compoundIntent);

    assert.deepEqual(plan.outcomes.map(outcome => outcome.artifactTypes[0]), ['form_proposal', 'workflow_proposal']);
    assert.deepEqual(plan.steps.map(step => step.type), ['design_form', 'design_workflow']);
    assert.deepEqual(plan.steps[1].dependsOn, ['design_form']);
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

test('form references used by a workflow are inputs, not form work', () => {
    const intent = deterministicIntent({
        message: 'Create a new workflow when the user submits the form, then send an email.'
    });
    assert.deepEqual(intent.requestedOperations.map(operation => operation.domain), ['workflow']);
    const plan = makeAdaptivePlan({}, intent);
    assert.deepEqual(plan.steps.map(step => step.type), ['design_workflow']);
    assert.deepEqual(plan.outcomes.map(outcome => outcome.artifactTypes[0]), ['workflow_proposal']);
});

test('compound form and workflow requests retain both requested operations', () => {
    const intent = deterministicIntent({
        message: 'Create a job application form, then approve submissions and email the applicant.'
    });
    assert.deepEqual(intent.requestedOperations.map(operation => operation.domain), ['form', 'workflow']);
});

test('Ask Promptly treats a natural form-then-save-responses request as an ordered compound solution', () => {
    const intent = deterministicIntent({
        message: 'Can u design the conference registration form, then when the form receive the responses, save the responses inside the sheet'
    });
    const plan = makeAdaptivePlan({}, intent);

    assert.deepEqual(intent.requestedOperations.map(operation => operation.domain), ['form', 'workflow']);
    assert.deepEqual(plan.steps.map(step => step.type), ['design_form', 'design_workflow']);
    assert.deepEqual(plan.steps[1].dependsOn, [plan.steps[0].id]);
});

test('Ask Promptly gives a proposed form a temporary workflow binding and preserves Sheet resources in the workflow artifact', () => {
    assert.equal(proposedFormSchemaForWorkflow({
        formSchema: { title: 'Conference Registration', fields: [] },
        formArtifactId: 'artifact_form_1'
    }).id, 'artifact:artifact_form_1');

    const content = buildWorkflowProposalContent({
        result: {
            message: 'Ready', nodes: [], edges: [], diff: {}, readiness: { canApply: true }, plan: [],
            resourceChanges: [{ type: 'create_google_spreadsheet', ref: 'responses', title: 'Conference Registration Responses' }],
            resourceIntent: { mode: 'unnamed', source: 'request' }
        },
        workflow: null,
        form: null,
        formArtifactId: 'artifact_form_1',
        formBinding: { source: { artifactKey: 'form_proposal', appliedResource: 'id' } }
    });

    assert.deepEqual(content.resourceChanges, [{ type: 'create_google_spreadsheet', ref: 'responses', title: 'Conference Registration Responses' }]);
    assert.deepEqual(content.resourceIntent, { mode: 'unnamed', source: 'request' });
});

test('Ask Promptly forwards structured clarification state to its workflow specialist', () => {
    assert.deepEqual(workflowTurnContextForAgent({
        message: 'Save Event Registration responses to the Event Registration Google Sheet.',
        context: {
            clarificationState: { createSpreadsheet: 'create' },
            clarificationText: 'Create a new Event Registration Sheet',
            clarificationMode: 'important_only'
        }
    }), {
        command: {
            type: 'submit_clarification',
            text: 'Create a new Event Registration Sheet',
            state: { createSpreadsheet: 'create' }
        },
        intent: {
            sourceText: 'Save Event Registration responses to the Event Registration Google Sheet.',
            latestText: 'Create a new Event Registration Sheet',
            relationToPending: 'none',
            authority: 'user',
            clarificationMode: 'important_only'
        }
    });
});

test('self dependencies are normalized before cycle validation', () => {
    const registry = createAgentCapabilityRegistry([
        { name: 'create_form', execute: async () => ({}) },
        { name: 'design_form', execute: async () => ({}) }
    ]);
    const plan = makeAdaptivePlan({
        outcomes: [{ id: 'form_solution', title: 'Create form', artifactTypes: ['form_proposal'], dependsOn: ['form_solution'] }],
        steps: [{ id: 'form_step', type: 'create_form', dependsOn: ['form_step'] }]
    }, { requestedOperations: [{ domain: 'form', action: 'create' }] });
    const result = compileExecutionPlan({ plan, registry });
    assert.equal(result.valid, true);
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
