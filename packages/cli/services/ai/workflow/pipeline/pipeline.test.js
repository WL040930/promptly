import test from 'node:test';
import assert from 'node:assert/strict';

// Keep these focused tests independent of the local .env completion overrides.
process.env.AI_WORKFLOW_UNLIMITED_COMPLETION_TOKENS = 'false';
process.env.AI_UNLIMITED_COMPLETION_TOKENS = 'false';
process.env.AI_TIMEOUT_MS = '50';

// ---------------------------------------------------------------------------
// Minimal registry helpers
// ---------------------------------------------------------------------------

const triggerSpec = {
    nodeKey: 'trigger:webhook',
    type: 'trigger',
    subType: 'webhook',
    title: 'Receive webhook',
    description: 'Starts when a webhook is received',
    implementationStatus: 'experimental',
    schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] },
    ui: {}
};

const emailSpec = {
    nodeKey: 'action:email',
    type: 'action',
    subType: 'email',
    title: 'Send email',
    description: 'Sends an email',
    implementationStatus: 'experimental',
    schema: {
        inputs: [{ name: 'event', isConnection: true }, { name: 'to', type: 'text' }, { name: 'subject', type: 'text' }],
        outputs: [{ name: 'done', isConnection: true }]
    },
    ui: {}
};

const formSubmissionSpec = {
    nodeKey: 'trigger:form-submission',
    type: 'trigger',
    subType: 'form-submission',
    title: 'Promptly Form',
    description: 'Starts when a Promptly form is submitted',
    implementationStatus: 'experimental',
    schema: {
        inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms' }],
        outputs: [{ name: 'event', isConnection: true }]
    },
    ui: {}
};

const googleSheetsSpec = {
    nodeKey: 'action:googleSheets',
    type: 'action',
    subType: 'googleSheets',
    title: 'Google Sheets',
    description: 'Appends a row to a spreadsheet',
    implementationStatus: 'experimental',
    schema: {
        inputs: [
            { name: 'event', isConnection: true },
            { name: 'operation', type: 'text' },
            { name: 'spreadsheetId', type: 'resource-select', resource: 'google-spreadsheets' },
            { name: 'range', type: 'resource-select', resource: 'google-sheet-ranges', resourceParams: { spreadsheetId: '$spreadsheetId' } },
            { name: 'values', type: 'text' }
        ],
        outputs: [{ name: 'done', isConnection: true }]
    },
    ui: {}
};

const googleSheetsCreateSpec = {
    nodeKey: 'action:googleSheetsCreate', type: 'action', subType: 'googleSheetsCreate',
    title: 'Create Google Sheet', description: 'Creates a spreadsheet during a run', implementationStatus: 'experimental',
    schema: {
        inputs: [{ name: 'event', isConnection: true }, { name: 'title', type: 'text' }, { name: 'sheetTitle', type: 'text' }, { name: 'headers', type: 'data-grid' }],
        outputs: [{ name: 'done', isConnection: true }]
    }, ui: {}
};

const approvalSpec = {
    nodeKey: 'logic:approval',
    type: 'logic',
    subType: 'approval',
    title: 'Approval',
    description: 'Waits for owner approval',
    implementationStatus: 'experimental',
    schema: {
        inputs: [{ name: 'event', isConnection: true }],
        outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }]
    },
    ui: {}
};

const makeRegistry = (specs = [triggerSpec, emailSpec]) => ({
    getCompactCatalogue: () => specs.map(spec => ({
        nodeKey: spec.nodeKey,
        type: spec.type,
        subType: spec.subType,
        title: spec.title,
        description: spec.description,
        implementationStatus: spec.implementationStatus,
        inputs: spec.schema.inputs,
        outputs: spec.schema.outputs
    })),
    getSchemasFor: keys => specs.filter(spec => keys.includes(spec.nodeKey)),
    getDefinition: (type, subType) => {
        const spec = specs.find(s => s.type === type && s.subType === subType);
        return spec ? { implementationStatus: spec.implementationStatus, configSchema: spec.schema } : null;
    }
});

const resourceLoader = async () => ({});

test('workflow complexity budgets reserve deeper recovery for forms, resources, and routing', async () => {
    const { workflowPipelineInternals } = await import('./pipeline.js');
    const { workflowComplexityFor } = workflowPipelineInternals;

    assert.equal(workflowComplexityFor({
        workflow: { nodes: [] },
        plan: { selectedNodeKeys: ['action:email'], requirements: [{ id: 'req_1' }] }
    }).id, 'simple');
    assert.equal(workflowComplexityFor({
        workflow: { nodes: Array.from({ length: 4 }, () => ({})) },
        plan: { selectedNodeKeys: ['action:email'], requirements: [{ id: 'req_1' }] }
    }).id, 'standard');
    assert.equal(workflowComplexityFor({
        workflow: existingWorkflow,
        plan: { selectedNodeKeys: ['trigger:webhook', 'action:email', 'logic:approval'], requirements: [{ id: 'req_1' }, { id: 'req_2' }, { id: 'req_3' }], capabilities: ['owner_approval'] }
    }).id, 'complex');
    const complex = workflowComplexityFor({
        workflow: { nodes: [] },
        formSchema: { id: 'form_1' },
        plan: { selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'], requirements: [{ id: 'req_1' }], resourceChanges: [{ type: 'create_google_spreadsheet' }] }
    });
    assert.deepEqual(complex, { id: 'complex', label: 'Complex workflow', providerAttempts: 3, buildAttempts: 4, maxProviderCalls: 16 });
});

/**
 * Build a provider object (with generateContent) that returns responses in
 * sequence, keyed by the `operation` option so tests can be precise.
 * `responses` is an array of { operation, value } entries OR plain objects
 * which are returned in order regardless of operation.
 */
const makeProvider = (responses) => {
    let callIndex = 0;
    return {
        async generateContent(_contents, _options) {
            const response = responses[callIndex] ?? responses[responses.length - 1];
            callIndex++;
            const value = response.value !== undefined ? response.value : response;
            return { text: JSON.stringify(value) };
        }
    };
};

// A minimal webhook → email workflow for edit tests.
const existingWorkflow = {
    revision: 1,
    nodes: [
        { id: 'trigger_1', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Receive webhook', config: {}, position: { x: 100, y: 150 } },
        { id: 'email_1', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send email', config: {}, position: { x: 450, y: 150 } }
    ],
    edges: [{ id: 'e1', source: 'trigger_1', target: 'email_1', sourceHandle: 'event', targetHandle: 'event' }]
};

// ---------------------------------------------------------------------------
// Planner reply — short-circuits without worker
// ---------------------------------------------------------------------------

test('pipeline returns a reply directly from the planner without calling the worker', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let callCount = 0;
    const provider = {
        async generateContent() {
            callCount++;
            return { text: JSON.stringify({ type: 'reply', message: 'This workflow triggers on every webhook event.' }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'What does this workflow do?',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.match(result.message, /webhook/i);
    assert.equal(callCount, 1);
});

test('pipeline resolves an exact existing Google Sheet before the second planner pass', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let lookupCount = 0;
    const provider = makeProvider([
        { type: 'inspect_resource', resource: 'google-spreadsheets', query: 'Approved Event Registrations' },
        { type: 'reply', message: 'I found Approved Event Registrations and can use it for the approved route.' }
    ]);
    const result = await generateWorkflowTurn({
        request: 'Append approved registrations to Approved Event Registrations.',
        currentWorkflow: existingWorkflow, provider, registry: makeRegistry(), resourceLoader,
        resourceLookup: async () => {
            lookupCount += 1;
            return { options: [{ value: 'sheet_approved', label: 'Approved Event Registrations' }] };
        }
    });
    assert.equal(result.type, 'reply');
    assert.equal(lookupCount, 1);
    assert.match(result.message, /found/i);
});

test('pipeline unwraps an exact form resource ID accidentally wrapped as provisioned', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let plannerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                plannerCalls++;
                return { text: JSON.stringify(plannerCalls === 1
                    ? { type: 'inspect_form', formId: 'form_1' }
                    : {
                        type: 'plan_complete',
                        summary: 'Send a thank-you email after owner approval.',
                        requirements: [{ id: 'req_1', description: 'Send a thank-you email to the respondent after approval.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'logic:approval', 'action:email'],
                        capabilities: ['owner_approval', 'respondent_confirmation']
                    }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', title: 'Form submitted', config: { formId: { $provision: 'form_1' } } } },
                    { op: 'create_node', node: { ref: 'approval', nodeKey: 'logic:approval', title: 'Owner approval', config: {}, afterNodeRef: 'form' } },
                    { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email', title: 'Thank you', config: { to: { $binding: 'form_field_1' }, subject: 'Thank you' }, afterNodeRef: 'approval' } },
                    { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'approval', handle: 'event' } },
                    { op: 'connect', from: { nodeRef: 'approval', handle: 'approved' }, to: { nodeRef: 'email', handle: 'event' } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When form submitted, send a thank you email to the user after I approve.',
        currentWorkflow: { nodes: [], edges: [] },
        userContext: { forms: [{ id: 'form_1', title: 'Contact form' }] },
        formLoader: async () => ({ id: 'form_1', title: 'Contact form', fields: [{ id: 'email', label: 'Email address', type: 'email', required: true }] }),
        provider,
        registry: makeRegistry([formSubmissionSpec, approvalSpec, emailSpec]),
        resourceLoader: async () => ({ forms: { resource: 'forms', options: [{ value: 'form_1', label: 'Contact form' }] } })
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.nodes.find(node => node.subType === 'form-submission')?.config?.formId, 'form_1');
    assert.ok(result.warnings.some(repair => repair.code === 'WORKFLOW_RESOURCE_REFERENCE_UNWRAPPED'));
    assert.equal(result.nodes.filter(node => node.subType === 'approval').length, 1);
});

test('pipeline gives the planner attached form fields without an extra lookup', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const prompts = [];
    const provider = {
        async generateContent(contents) {
            prompts.push(contents[0].parts[0].text);
            return { text: JSON.stringify({ type: 'reply', message: 'Yes. The selected form has an Email address field.' }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Can you see the fields in the selected form?',
        currentWorkflow: existingWorkflow,
        formSchema: {
            id: 'form_1',
            title: 'Customer Satisfaction Survey',
            settings: { respondentEmailFieldId: 'field_email' },
            fields: [{ id: 'field_email', label: 'Email address', type: 'email', required: true }]
        },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Attached Form Context:[\s\S]*Email address/);
});

test('pipeline performs one safe lookup for another owned form before replying', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const prompts = [];
    let loadCount = 0;
    const provider = {
        async generateContent(contents) {
            prompts.push(contents[0].parts[0].text);
            return { text: JSON.stringify(prompts.length === 1
                ? { type: 'inspect_form', formId: 'form_other' }
                : { type: 'reply', message: 'The other form collects a Work email field.' }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'What fields does the other form have?',
        currentWorkflow: existingWorkflow,
        userContext: { forms: [{ id: 'form_other', title: 'Contact form', updatedAt: '2026-07-28' }] },
        formLoader: async ({ formId }) => {
            loadCount++;
            assert.equal(formId, 'form_other');
            return {
                id: formId,
                title: 'Contact form',
                fields: [{ id: 'work_email', label: 'Work email', type: 'email', required: false }]
            };
        },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.equal(loadCount, 1);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /Inspected Form Context:[\s\S]*Work email/);
});

test('pipeline carries an inspected form into the worker that creates its trigger', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerPrompt = '';
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify(
                    contents[0].parts[0].text.includes('"label":"Email address"')
                        ? {
                            type: 'plan_complete',
                            summary: 'Send a thank-you email after form submission.',
                            requirements: [{ id: 'req_1', description: 'Send a thank-you email to the respondent.' }],
                            selectedNodeKeys: ['trigger:form-submission', 'action:email'],
                            capabilities: ['respondent_confirmation']
                        }
                        : { type: 'inspect_form', formId: 'form_1' }
                ) };
            }
            if (options.operation === 'workflow:worker') {
                workerPrompt = contents[0].parts[0].text;
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Promptly Form', config: { formId: 'form_1' } } },
                    { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email', title: 'Send thank-you email', config: { to: { $binding: 'form_field_1' }, subject: 'Thank you' }, afterNodeRef: 'form_trigger' } },
                    { op: 'connect', from: { nodeRef: 'form_trigger', handle: 'event' }, to: { nodeRef: 'email', handle: 'event' } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'After my form receives a response, send a thank-you email.',
        currentWorkflow: { nodes: [], edges: [] },
        userContext: { forms: [{ id: 'form_1', title: 'Contact form', updatedAt: '2026-07-28' }] },
        formLoader: async () => ({ id: 'form_1', title: 'Contact form', fields: [{ id: 'email', label: 'Email address', type: 'email', required: true }] }),
        provider,
        registry: makeRegistry([formSubmissionSpec, emailSpec]),
        resourceLoader: async () => ({ forms: { resource: 'forms', options: [{ value: 'form_1', label: 'Contact form' }] } })
    });

    assert.match(workerPrompt, /"key":"form_field_1"/);
    assert.equal(result.type, 'proposal');
    assert.deepEqual(result.nodes.find(node => node.subType === 'email')?.config?.to, {
        $expr: 'reference',
        v: 1,
        nodeId: result.nodes.find(node => node.subType === 'form-submission')?.id,
        path: ['fields', 'email']
    });
});

test('pipeline does not expose a form when the ownership-checked lookup fails', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = makeProvider([{ type: 'inspect_form', formId: 'form_not_owned' }]);

    const result = await generateWorkflowTurn({
        request: 'Inspect that form.',
        currentWorkflow: existingWorkflow,
        userContext: { forms: [{ id: 'form_not_owned', title: 'Unavailable form', updatedAt: '2026-07-28' }] },
        formLoader: async () => null,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.match(result.message, /could not access/i);
});

test('pipeline refuses a form lookup that was not listed for the user', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let loadCount = 0;
    const provider = makeProvider([{ type: 'inspect_form', formId: 'form_invented' }]);

    const result = await generateWorkflowTurn({
        request: 'Inspect that form.',
        currentWorkflow: existingWorkflow,
        userContext: { forms: [{ id: 'form_visible', title: 'Visible form', updatedAt: '2026-07-28' }] },
        formLoader: async () => {
            loadCount++;
            return null;
        },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.equal(loadCount, 0);
    assert.match(result.message, /available forms/i);
});

// ---------------------------------------------------------------------------
// Planner clarification — returns structured inputs
// ---------------------------------------------------------------------------

test('pipeline returns a clarification with structured inputs from the planner', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const progress = [];
    const provider = makeProvider([{
        type: 'message',
        message: 'Which email provider would you like to use?',
        inputs: [{ id: 'q1', type: 'single_choice', label: 'Email provider', options: ['Gmail', 'SendGrid'] }]
    }]);

    const result = await generateWorkflowTurn({
        request: 'Add an email step',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader,
        onProgress: event => progress.push(event)
    });

    assert.equal(result.type, 'message');
    assert.equal(result.inputs[0].id, 'q1');
    assert.deepEqual(result.inputs[0].options, ['Gmail', 'SendGrid']);
    assert.equal(progress.find(event => event.status === 'plan_ready')?.outcomeKind, 'clarification');
});

// ---------------------------------------------------------------------------
// Direct plan — compiled without a separate worker call
// ---------------------------------------------------------------------------

test('pipeline compiles a direct_plan using at most 2 AI calls (planner + verifier)', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let callCount = 0;
    const progress = [];
    const provider = {
        async generateContent(_contents, options) {
            callCount++;
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'direct_plan',
                    summary: 'Update the email subject.',
                    requirements: [{ id: 'req_1', description: 'Set the email subject to "Hello".' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: [],
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { subject: 'Hello' } } }]
                }) };
            }
            // verifier
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Set the email subject to Hello',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader,
        onProgress: event => progress.push(event)
    });

    assert.equal(result.type, 'proposal');
    // Only 2 AI calls: planner + verifier (no separate worker call)
    assert.ok(callCount <= 2, `Expected ≤2 AI calls for direct_plan, got ${callCount}`);
    assert.ok(result.nodes.find(n => n.subType === 'email')?.config?.subject === 'Hello');
    assert.equal(progress.find(event => event.status === 'plan_ready')?.outcomeKind, 'proposal');
});

test('pipeline turns a confirmed run diagnosis into a reviewable direct proposal', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const workflow = {
        revision: 1,
        nodes: [
            { id: 'trigger_1', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Receive webhook', config: {}, position: { x: 100, y: 150 } },
            { id: 'sheets_1', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Append registrations', config: { operation: 'append', spreadsheetId: 'sheet_1', range: "'Sheet1'!A1", values: '[]' }, position: { x: 450, y: 150 } }
        ], edges: [{ id: 'e1', source: 'trigger_1', target: 'sheets_1', sourceHandle: 'event', targetHandle: 'event' }]
    };
    const provider = makeProvider([
        { type: 'diagnose_run', selector: 'referenced', runId: 'run_123', goal: 'explain_and_propose' },
        { status: 'pass', issues: [] }
    ]);
    const diagnosis = {
        run: { id: 'run_123', status: 'failed' }, finding: { summary: 'The configured tab is missing.' },
        failedStep: { name: 'Append registrations' }, fix: { nodeId: 'sheets_1', range: "'Responses'!A1", summary: 'Use the Responses tab.' }
    };
    const result = await generateWorkflowTurn({
        request: 'Diagnose run_123 and propose a safe fix.', currentWorkflow: workflow, provider,
        registry: makeRegistry([triggerSpec, googleSheetsSpec]),
        resourceLoader: async () => ({
            'google-spreadsheets': { options: [{ value: 'sheet_1', label: 'Sheet' }] },
            'google-sheet-ranges': { variants: { '{"spreadsheetId":"sheet_1"}': { options: [{ value: "'Responses'!A1", label: 'Responses' }] } } }
        }),
        runLoader: async () => diagnosis
    });
    assert.equal(result.type, 'proposal');
    assert.equal(result.diagnosis, diagnosis);
    assert.equal(result.nodes.find(node => node.id === 'sheets_1').config.range, "'Responses'!A1");
});

// ---------------------------------------------------------------------------
// Plan complete — calls worker and verifier, produces a proposal
// ---------------------------------------------------------------------------

test('pipeline calls worker and verifier for a plan_complete and returns a proposal', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Set email recipient.',
                    requirements: [{ id: 'req_1', description: 'Set email to field to user@example.com.' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'user@example.com', subject: 'Hi' } } }]
                }) };
            }
            // verifier
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Set the email recipient to user@example.com',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
    assert.equal(result.verification?.status, 'pass');
});

test('pipeline proposes a new Google Sheet without browsing an unavailable Google connection', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Record each response before emailing.',
                    requirements: [{ id: 'req_1', description: 'Record the response before the email.' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({ operations: [{
                    op: 'insert_after_route',
                    from: { nodeRef: 'n1', handle: 'event' },
                    node: {
                        ref: 'response_sheet',
                        nodeKey: 'action:googleSheets',
                        title: 'Save response',
                        config: {
                            operation: 'append',
                            spreadsheetId: { $provision: 'response_spreadsheet' },
                            range: "'Responses'!A1",
                            values: [['saved']]
                        }
                    }
                }] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };
    const result = await generateWorkflowTurn({
        request: 'Save each response in Excel in Drive before sending the email.',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry([triggerSpec, emailSpec, googleSheetsSpec]),
        resourceLoader: async () => ({
            'google-spreadsheets': {
                resource: 'google-spreadsheets',
                options: [],
                error: { code: 'GOOGLE_RECONNECT_REQUIRED', message: 'Reconnect Google.' }
            }
        })
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.resourceChanges[0]?.type, 'create_google_spreadsheet');
    assert.equal(result.resourceChanges[0]?.title, 'Workflow Responses');
    assert.equal(result.readiness.status, 'setup_required');
    assert.equal(result.readiness.setupActions[0]?.type, 'open_connections');
    assert.ok(result.nodes.some(node => node.nodeKey === 'action:googleSheets'));
});

test('pipeline uses a runtime sheet for every approved form submission', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') return { text: JSON.stringify({
                type: 'plan_complete', summary: 'Save approved responses.',
                requirements: [{ id: 'req_approval', description: 'Ask the owner to approve every response.' }],
                selectedNodeKeys: ['trigger:form-submission', 'logic:approval', 'action:googleSheets'], capabilities: ['owner_approval']
            }) };
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') return { text: JSON.stringify({ operations: [
                { op: 'create_node', node: { ref: 'approval', nodeKey: 'logic:approval', title: 'Review required', config: {} } },
                { op: 'create_node', node: { ref: 'create', nodeKey: 'action:googleSheetsCreate', title: 'Create response sheet', config: {} } },
                { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', title: 'Append approved response', config: { operation: 'append', range: "'Responses'!A1", values: [['wrong']] } } },
                { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'approval', handle: 'event' } },
                { op: 'connect', from: { nodeRef: 'approval', handle: 'approved' }, to: { nodeRef: 'create', handle: 'event' } },
                { op: 'connect', from: { nodeRef: 'create', handle: 'done' }, to: { nodeRef: 'append', handle: 'event' } }
            ] }) };
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };
    const result = await generateWorkflowTurn({
        request: 'When the form receives a response, ask my approval and if approved append it into a new sheet for each submission.',
        currentWorkflow: { nodes: [{ id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', title: 'Form', config: {}, position: { x: 0, y: 0 } }], edges: [] },
        formSchema: { title: 'Event Registration', fields: [{ id: 'name', label: 'Name' }] },
        provider,
        registry: makeRegistry([formSubmissionSpec, approvalSpec, googleSheetsCreateSpec, googleSheetsSpec]), resourceLoader
    });
    const creator = result.nodes.find(node => node.subType === 'googleSheetsCreate');
    const append = result.nodes.find(node => node.subType === 'googleSheets');
    assert.equal(result.resourceChanges.length, 0);
    assert.equal(append.config.spreadsheetId.nodeId, creator.id);
    assert.deepEqual(creator.config.headers, [['Submitted At', 'Response ID', 'Name']]);
});

// ---------------------------------------------------------------------------
// Worker repair loop — bad first attempt, good second attempt
// ---------------------------------------------------------------------------

test('pipeline repairs a malformed worker response and produces a valid proposal on the second attempt', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerAttempt = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Update email.',
                    requirements: [{ id: 'req_1', description: 'Update email config.' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerAttempt++;
                if (workerAttempt === 1) {
                    // First attempt: invalid (no operations array)
                    return { text: JSON.stringify({ invalid: true }) };
                }
                // Second attempt (repair): valid
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'test@example.com' } } }]
                }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Update the email to test@example.com',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.ok(workerAttempt >= 2, `Expected worker repair attempt, got ${workerAttempt}`);
});

// ---------------------------------------------------------------------------
// Verifier repair — verifier requests a repair, second build passes
// ---------------------------------------------------------------------------

test('pipeline retries the worker when the verifier requests repair, then passes', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let buildAttempt = 0;
    let verifyAttempt = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Set subject to Welcome.',
                    requirements: [{ id: 'req_1', description: 'Set subject to "Welcome".' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                buildAttempt++;
                const subject = buildAttempt >= 2 ? 'Welcome' : undefined;
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'user@example.com', ...(subject ? { subject } : {}) } } }]
                }) };
            }
            if (options.operation === 'workflow:verifier' || options.operation === 'workflow:verifier repair') {
                verifyAttempt++;
                if (verifyAttempt === 1) {
                    return { text: JSON.stringify({ status: 'repair', issues: [{ requirementId: 'req_1', message: 'Subject was not set to "Welcome".' }] }) };
                }
                return { text: JSON.stringify({ status: 'pass', issues: [] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Set the email subject to Welcome',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.ok(buildAttempt >= 2, `Expected ≥2 build attempts for verifier repair, got ${buildAttempt}`);
});

test('pipeline returns a locally valid proposal as unverified when verifier output remains invalid', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Set the email recipient.',
                    requirements: [{ id: 'req_1', description: 'Set the email recipient.' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'team@example.com' } } }]
                }) };
            }
            return { text: 'null' };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Set the email recipient to team@example.com',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.verification?.status, 'unverified');
    assert.equal(result.verification?.skippedReason, 'VERIFIER_RESPONSE_INVALID');
    assert.equal(result.nodes.find(node => node.id === 'email_1')?.config?.to, 'team@example.com');
});

// ---------------------------------------------------------------------------
// Empty workflow — builds a complete connected graph
// ---------------------------------------------------------------------------

test('pipeline produces a complete connected workflow from an empty start', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Create a webhook → email workflow.',
                    requirements: [
                        { id: 'req_1', description: 'Add a webhook trigger.' },
                        { id: 'req_2', description: 'Add an email action connected to the trigger.' }
                    ],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'trigger_new', nodeKey: 'trigger:webhook', title: 'Receive webhook', config: {} } },
                    { op: 'create_node', node: { ref: 'email_new', nodeKey: 'action:email', title: 'Send email', config: { to: 'team@example.com', subject: 'New event' }, afterNodeRef: 'trigger_new' } },
                    { op: 'connect', from: { nodeRef: 'trigger_new', handle: 'event' }, to: { nodeRef: 'email_new', handle: 'event' } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Create a workflow that receives a webhook and sends an email',
        currentWorkflow: { nodes: [], edges: [] },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.ok(result.nodes.length >= 2);
    assert.ok(result.nodes.some(n => n.type === 'trigger'));
    assert.ok(result.edges.length >= 1);
});

// ---------------------------------------------------------------------------
// Decide-for-me (authority = assistant) forces the planner to pick defaults
// ---------------------------------------------------------------------------

test('pipeline asks the planner to choose defaults on its first call when authority is assistant', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let plannerAttempt = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner' || options.operation === 'workflow:planner repair') {
                plannerAttempt++;
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Add email using default provider.',
                    requirements: [{ id: 'req_1', description: 'Add email step.' }],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'default@example.com' } } }]
                }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Use sensible defaults.',
        currentWorkflow: existingWorkflow,
        turnContext: { authority: 'assistant', sourceText: 'Add an email step', latestText: '' },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(plannerAttempt, 1, `Expected one planner call for decide_for_me, got ${plannerAttempt}`);
});

test('pipeline resolves a planner clarification when clarification mode is decide_everything', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let plannerAttempt = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                plannerAttempt++;
                return { text: JSON.stringify(plannerAttempt === 1
                    ? {
                        type: 'message',
                        message: 'Which subject should the email use?',
                        inputs: [{ id: 'subject', type: 'text', label: 'Email subject' }]
                    }
                    : {
                        type: 'plan_complete',
                        summary: 'Use a default thank-you subject.',
                        requirements: [{ id: 'req_1', description: 'Update the thank-you email subject.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({
                    operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { subject: 'Thank you' } } }]
                }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Send a thank-you email.',
        currentWorkflow: existingWorkflow,
        clarificationMode: 'decide_everything',
        turnContext: { authority: 'user', sourceText: 'Send a thank-you email.', latestText: 'Send a thank-you email.' },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(plannerAttempt, 2);
    assert.equal(result.nodes.find(node => node.id === 'email_1')?.config?.subject, 'Thank you');
});

test('pipeline falls back to a validated linear form-to-Sheets workflow after repeated invalid worker refs', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Save each submitted form response to a Google Sheet.',
                    requirements: [{ id: 'req_1', description: 'Append each submitted form response to a Google Sheet.' }],
                    selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                    linearSteps: [
                        { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Form submitted', requirementIds: ['req_1'], config: { formId: 'form_1' } },
                        { ref: 'save_response', nodeKey: 'action:googleSheets', title: 'Save response', requirementIds: ['req_1'], config: { operation: 'append', spreadsheetId: { $provision: 'response_spreadsheet' }, range: "'Responses'!A1" } }
                    ],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerCalls++;
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'save_response', nodeKey: 'action:googleSheet', config: {} } },
                    { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'save_response', handle: 'event' } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When a form is submitted, save the response to Google Sheets.',
        currentWorkflow: { nodes: [], edges: [] },
        formSchema: {
            id: 'form_1',
            title: 'Event Registration',
            fields: [{ id: 'name', label: 'Name', type: 'text', required: true }]
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader: async () => ({
            forms: { error: { message: 'Form list is temporarily unavailable.' }, options: [] }
        })
    });

    assert.equal(result.type, 'proposal');
    assert.ok(workerCalls > 0);
    assert.deepEqual(result.nodes.map(node => node.nodeKey), ['trigger:form-submission', 'action:googleSheets']);
    assert.equal(result.edges.length, 1);
    assert.equal(result.nodes.find(node => node.nodeKey === 'action:googleSheets')?.config?.operation, 'append');
});

test('pipeline repairs an unknown planner node key before the worker is called', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const plannerPrompts = [];
    let plannerCalls = 0;
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner' || options.operation === 'workflow:planner repair') {
                plannerCalls++;
                plannerPrompts.push(contents[0].parts[0].text);
                return { text: JSON.stringify(plannerCalls === 1
                    ? {
                        type: 'plan_complete',
                        summary: 'Create a webhook email workflow.',
                        requirements: [{ id: 'req_1', description: 'Send an email after a webhook.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:emails'],
                        capabilities: []
                    }
                    : {
                        type: 'plan_complete',
                        summary: 'Create a webhook email workflow.',
                        requirements: [{ id: 'req_1', description: 'Send an email after a webhook.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', config: {} } },
                    { op: 'create_node', node: { ref: 'send_email', nodeKey: 'action:email', afterNodeRef: 'webhook_trigger', config: { to: 'team@example.com' } } },
                    { op: 'connect', from: { nodeRef: 'webhook_trigger', handle: 'event' }, to: { nodeRef: 'send_email', handle: 'event' } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Create a webhook that emails the team.',
        currentWorkflow: { nodes: [], edges: [] },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(plannerCalls, 2);
    assert.match(plannerPrompts[1], /Unknown nodeKey 'action:emails'/);
    assert.match(plannerPrompts[1], /action:email/);
});

test('pipeline fallback supports repeated actions in a generic linear workflow', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Send two notifications after a webhook.',
                    requirements: [
                        { id: 'req_1', description: 'Receive a webhook.' },
                        { id: 'req_2', description: 'Send two notification emails.' }
                    ],
                    selectedNodeKeys: ['trigger:webhook', 'action:email'],
                    linearSteps: [
                        { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_1'], config: {} },
                        { ref: 'notify_team', nodeKey: 'action:email', requirementIds: ['req_2'], config: { to: 'team@example.com', subject: 'New webhook' } },
                        { ref: 'notify_owner', nodeKey: 'action:email', requirementIds: ['req_2'], config: { to: 'owner@example.com', subject: 'New webhook' } }
                    ],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'notify_team', nodeKey: 'action:emails', config: {} } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When a webhook arrives, email the team and then the owner.',
        currentWorkflow: { nodes: [], edges: [] },
        provider,
        registry: makeRegistry(),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.nodes.filter(node => node.nodeKey === 'action:email').length, 2);
    assert.equal(result.edges.length, 2);
    assert.ok(result.warnings.some(warning => warning.code === 'WORKFLOW_DETERMINISTIC_FALLBACK_USED'));
});

test('pipeline does not use the linear fallback for a branching workflow', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Ask for approval after a webhook.',
                    requirements: [{ id: 'req_1', description: 'Route the webhook through approval.' }],
                    selectedNodeKeys: ['trigger:webhook', 'logic:approval'],
                    linearSteps: [
                        { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_1'], config: {} },
                        { ref: 'approval_step', nodeKey: 'logic:approval', requirementIds: ['req_1'], config: {} }
                    ],
                    capabilities: []
                }) };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return { text: JSON.stringify({ operations: [
                    { op: 'create_node', node: { ref: 'approval_step', nodeKey: 'logic:approvals', config: {} } }
                ] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    await assert.rejects(() => generateWorkflowTurn({
        request: 'When a webhook arrives, ask me to approve it.',
        currentWorkflow: { nodes: [], edges: [] },
        provider,
        registry: makeRegistry([triggerSpec, approvalSpec]),
        resourceLoader
    }), error => error.code === 'WORKFLOW_AI_UNSAFE_PROPOSAL');
});
