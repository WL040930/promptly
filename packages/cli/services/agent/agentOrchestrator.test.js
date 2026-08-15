import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildWorkflowProposalContent,
    ensureRespondentEmailField,
    formTurnContextForAgent,
    applyIntentFormTitleFallback,
    proposedFormSchemaForWorkflow,
    research,
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

test('adaptive plans ignore model capability placeholders and compile a canonical compound graph', () => {
    const registry = createAgentCapabilityRegistry([
        { name: 'design_form', inputSchema: { type: 'object', additionalProperties: false }, execute: async () => ({}) },
        { name: 'design_workflow', inputSchema: { type: 'object', additionalProperties: false }, execute: async () => ({}) }
    ]);
    const plan = makeAdaptivePlan({
        summary: 'Create and notify.',
        outcomes: [
            { id: 'form_modify', title: 'Create the form', artifactTypes: ['form_proposal'], dependsOn: ['design_form'] },
            { id: 'workflow_modify', title: 'Create the workflow', artifactTypes: ['workflow_proposal'], dependsOn: ['design_workflow'] }
        ],
        steps: [
            { id: 'registered_form', type: 'registered_capability' },
            { id: 'registered_workflow', type: 'registered_capability' }
        ]
    }, compoundIntent);
    const result = compileExecutionPlan({ plan, registry });
    assert.equal(result.valid, true);
    assert.deepEqual(result.graph.order, ['design_form', 'design_workflow']);
    assert.deepEqual(result.graph.steps.map(step => step.type), ['design_form', 'design_workflow']);
    assert.deepEqual(plan.outcomes.map(outcome => outcome.id), ['form_solution', 'workflow_solution']);
    assert.deepEqual(plan.outcomes[1].dependsOn, ['form_solution']);
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

test('Ask Promptly replaces an unnamed new-form fallback with the AI-selected form target', () => {
    const proposal = applyIntentFormTitleFallback({
        schema: { title: 'Untitled Form', description: '', fields: [] },
        patches: [{ op: 'update_meta', patchId: 'metadata', updates: { title: 'Untitled Form' } }],
        intent: {
            goal: 'create',
            requestedOperations: [{ domain: 'form', action: 'create', target: 'job application form' }]
        },
        isNewForm: true
    });

    assert.equal(proposal.schema.title, 'Job Application Form');
    assert.equal(proposal.patches[0].updates.title, 'Job Application Form');
});

test('research uses the active form when a conversational reference matches several forms', async () => {
    const resource = { id: 'form_recent', title: 'Untitled Form', fields: [], updatedAt: new Date() };
    const result = await research({
        userId: 'user_1',
        intent: {
            goal: 'modify',
            resourceReferences: [{ type: 'form', query: 'the form just now' }],
            resourceInputs: []
        },
        context: { formId: 'form_recent' },
        resolve: async ({ reference }) => reference === 'the form just now'
            ? { status: 'ambiguous', candidates: [{ id: 'form_recent', name: 'Untitled Form' }, { id: 'form_other', name: 'Contact Form' }] }
            : { status: 'resolved', resource: { id: 'form_recent' } },
        models: { Form: { findOne: async () => resource } }
    });

    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.resources.map(item => item.id), ['form_recent']);
});

test('fallback plans describe supported outcomes without adding a verification capability', () => {
    const result = makeFallbackOutcomePlan({ domains: ['form', 'workflow'], risk: 'medium' });

    assert.deepEqual(result.outcomes.map(outcome => outcome.id), ['form_solution', 'workflow_solution']);
    assert.deepEqual(result.steps.map(step => step.type), ['design_form', 'design_workflow']);
    assert.equal(result.steps.some(step => step.type === 'verify'), false);
});

test('form references used by a workflow are inputs, not form work', () => {
    const intent = {
        goal: 'create',
        domains: ['workflow'],
        requestedOperations: [{ domain: 'workflow', action: 'create', target: 'submission workflow' }]
    };
    const plan = makeAdaptivePlan({}, intent);
    assert.deepEqual(plan.steps.map(step => step.type), ['design_workflow']);
    assert.deepEqual(plan.outcomes.map(outcome => outcome.artifactTypes[0]), ['workflow_proposal']);
});

test('compound form and workflow requests retain both requested operations', () => {
    const intent = {
        goal: 'create',
        domains: ['form', 'workflow'],
        requestedOperations: [
            { domain: 'form', action: 'create', target: 'job application form' },
            { domain: 'workflow', action: 'create', target: 'submission notification' }
        ]
    };
    assert.deepEqual(intent.requestedOperations.map(operation => operation.domain), ['form', 'workflow']);
});

test('Ask Promptly treats a natural form-then-save-responses request as an ordered compound solution', () => {
    const intent = {
        goal: 'create',
        domains: ['form', 'workflow'],
        requestedOperations: [
            { domain: 'form', action: 'create', target: 'conference registration form' },
            { domain: 'workflow', action: 'create', target: 'response storage' }
        ]
    };
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

test('Ask Promptly marks an AI-referenced active form as the workflow trigger source', () => {
    const context = workflowTurnContextForAgent({
        message: 'When this form receives a response, request approval.',
        context: {},
        intent: { resourceReferences: [{ type: 'form', query: 'this form' }] },
        form: { id: 'form_job_application', title: 'Job Application' }
    });

    assert.deepEqual(context, {
        intent: {
            sourceText: 'When this form receives a response, request approval.',
            latestText: '',
            relationToPending: 'none',
            authority: 'user',
            clarificationMode: 'important_only',
            activeFormSource: { id: 'form_job_application', title: 'Job Application' }
        }
    });
});

test('Ask Promptly forwards structured clarification state to its form specialist', () => {
    assert.deepEqual(formTurnContextForAgent({
        message: 'Design a job application form for Software Engineer applicants.',
        context: {
            clarificationState: {
                jobTitle: 'Software Engineer',
                sections: ['Personal Information', 'Work Experience', 'Resume/File Upload']
            },
            clarificationText: 'Target job title(s): Software Engineer\nCore sections: Personal Information, Work Experience, Resume/File Upload',
            clarificationMode: 'important_only'
        }
    }), {
        sourceText: 'Design a job application form for Software Engineer applicants.',
        scope: 'general_form_change',
        relationToPending: 'none',
        authority: 'user',
        clarificationMode: 'important_only',
        expectsMutation: true,
        clarificationState: {
            jobTitle: 'Software Engineer',
            sections: ['Personal Information', 'Work Experience', 'Resume/File Upload']
        }
    });
});

test('Ask Promptly can delegate unanswered form choices to the assistant', () => {
    const context = formTurnContextForAgent({
        message: 'Design a job application form.',
        context: {
            clarificationDecision: 'decide_for_me',
            clarificationId: 'clarification-1',
            clarificationMode: 'important_only'
        }
    });

    assert.equal(context.authority, 'assistant');
    assert.equal(context.expectsMutation, true);
    assert.equal(context.clarificationDecision, 'decide_for_me');
    assert.equal(context.clarificationState, undefined);
});

test('Ask Promptly can delegate unanswered workflow choices to the assistant', () => {
    const context = workflowTurnContextForAgent({
        message: 'Send a confirmation email after a form submission.',
        context: {
            clarificationDecision: 'decide_for_me',
            clarificationId: 'clarification-2',
            clarificationState: { provider: ['Gmail'] },
            clarificationMode: 'important_only'
        }
    });

    assert.equal(context.command.type, 'decide_for_me');
    assert.equal(context.command.clarificationId, 'clarification-2');
    assert.deepEqual(context.command.state, { provider: ['Gmail'] });
    assert.equal(context.intent.authority, 'assistant');
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
