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
            { name: 'values', type: 'data-grid' }
        ],
        outputs: [{ name: 'done', isConnection: true }]
    },
    ui: {}
};

const googleSheetsCreateSpec = {
    nodeKey: 'action:googleSheetsCreate', type: 'action', subType: 'googleSheetsCreate',
    title: 'Create Google Sheet', description: 'Creates a spreadsheet during a run', implementationStatus: 'experimental',
    schema: {
        inputs: [{ name: 'event', isConnection: true }, { name: 'title', type: 'text' }, { name: 'sheetTitle', type: 'text' }, { name: 'headers', type: 'string-list' }],
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

const conditionSpec = {
    nodeKey: 'logic:condition',
    type: 'logic',
    subType: 'condition',
    title: 'Condition',
    description: 'Routes a workflow through true or false outcomes',
    implementationStatus: 'experimental',
    schema: {
        inputs: [
            { name: 'input1', isConnection: true },
            { name: 'input2', isConnection: true },
            { name: 'valueA', type: 'text' },
            { name: 'operator', type: 'select' },
            { name: 'valueB', type: 'text' }
        ],
        outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }]
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

test('pipeline creates a direct metadata-only proposal for a workflow rename', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let providerCalls = 0;
    const result = await generateWorkflowTurn({
        request: 'rename this workflow to Event Registration Automation',
        currentWorkflow: { ...existingWorkflow, name: 'New Automation' },
        provider: { async generateContent() { providerCalls += 1; throw new Error('Rename should not call an AI provider.'); } },
        formLoader: async () => { throw new Error('Rename should not load a form.'); },
        resourceLookup: async () => { throw new Error('Rename should not inspect Google resources.'); },
        resourceLoader: async () => { throw new Error('Rename should not load account resources.'); },
        registry: makeRegistry()
    });

    assert.equal(providerCalls, 0);
    assert.equal(result.type, 'proposal');
    assert.deepEqual(result.workflowUpdates, { name: 'Event Registration Automation' });
    assert.deepEqual(result.operations, [{ op: 'update_workflow', updates: { name: 'Event Registration Automation' } }]);
    assert.deepEqual(result.diff.metadata, { name: { from: 'New Automation', to: 'Event Registration Automation' } });
    assert.equal(result.plan[0].title, 'Rename workflow to Event Registration Automation');
});

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

test('pipeline asks for a Google Form source through the adaptive resource picker', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const result = await generateWorkflowTurn({
        request: 'When my Google Form receives a new response, send me an approval.',
        currentWorkflow: { nodes: [], edges: [] },
        provider: makeProvider([{ type: 'resolve_resource', recipe: 'google_form_response_source' }]),
        registry: makeRegistry([triggerSpec, approvalSpec]),
        resourceLoader,
        resourceLookup: async ({ resource }) => {
            assert.equal(resource, 'google-forms');
            return { account: 'owner@example.com', options: [{ value: 'form_event', label: 'Event Registration' }] };
        }
    });

    assert.equal(result.type, 'message');
    assert.match(result.message, /Google Form/i);
    assert.deepEqual(result.inputs[0], {
        id: 'googleFormId',
        type: 'resource_picker',
        label: 'Google Form',
        resource: 'google-forms',
        account: 'owner@example.com',
        options: [{ id: 'form_event', name: 'Event Registration', description: null }],
        searchable: true,
        allowCustom: true,
        customLabel: 'Paste Google Form URL or ID'
    });
});

test('pipeline turns a Google Sheet new-row trigger into a searchable resource picker', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const result = await generateWorkflowTurn({
        request: 'when my google sheet receive new row, can u do like send a approval for me',
        currentWorkflow: { nodes: [], edges: [] },
        provider: makeProvider([{ type: 'resolve_resource', recipe: 'google_sheet_row_source' }]),
        registry: makeRegistry([triggerSpec, approvalSpec]),
        resourceLoader,
        resourceLookup: async ({ resource }) => {
            assert.equal(resource, 'google-spreadsheets');
            return {
                account: 'owner@example.com',
                options: [{ value: 'sheet_event', label: 'Event Registration responses' }]
            };
        }
    });

    assert.equal(result.type, 'message');
    assert.match(result.message, /Google Sheet to watch/i);
    assert.deepEqual(result.inputs[0], {
        id: 'googleSheetTriggerSpreadsheetId',
        type: 'resource_picker',
        label: 'Google Sheet',
        resource: 'google-spreadsheets',
        account: 'owner@example.com',
        options: [{ id: 'sheet_event', name: 'Event Registration responses', description: null }],
        searchable: true,
        allowCustom: true,
        customLabel: 'Paste Google Sheets URL or ID'
    });
});

test('pipeline reroutes a free-text Google Sheet clarification to the resource picker', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const result = await generateWorkflowTurn({
        request: 'when my google sheet receive new row, can u do like send a approval for me',
        currentWorkflow: { nodes: [], edges: [] },
        provider: makeProvider([
            {
                type: 'message',
                message: 'Which Google Sheet should trigger the approval when a new row is added?',
                inputs: [{ id: 'googleSheet', type: 'text', label: 'Google Sheet name (or URL)' }]
            },
            { type: 'resolve_resource', recipe: 'google_sheet_row_source' }
        ]),
        registry: makeRegistry([triggerSpec, approvalSpec]),
        resourceLoader,
        resourceLookup: async ({ resource }) => {
            assert.equal(resource, 'google-spreadsheets');
            return { options: [{ value: 'sheet_event', label: 'Event Registration responses' }] };
        }
    });

    assert.equal(result.type, 'message');
    assert.equal(result.inputs[0].type, 'resource_picker');
    assert.equal(result.inputs[0].id, 'googleSheetTriggerSpreadsheetId');
});

test('pipeline opens a searchable Sheet picker when a named Google Sheet cannot be found', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let providerCalls = 0;
    const result = await generateWorkflowTurn({
        request: 'Save the response to the Event Registration Google Sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        provider: { async generateContent() { providerCalls += 1; throw new Error('The planner must not run before destination resolution.'); } },
        resourceLookup: async () => ({ options: [] }),
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(providerCalls, 0);
    assert.equal(result.type, 'message');
    assert.match(result.message, /could not find/i);
    assert.deepEqual(result.inputs.map(input => input.id), ['spreadsheetId']);
    assert.equal(result.inputs[0].type, 'resource_picker');
    assert.equal(result.inputs[0].allowCustom, true);
});

test('pipeline resumes the Create Sheet clarification using structured state and the original destination name', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') return {
                text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Save each Event Registration response.',
                    requirements: [{ id: 'req_1', description: 'Append each response to the Event Registration Sheet.' }],
                    selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                    linearSteps: [
                        { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Form submitted', requirementIds: ['req_1'], config: { formId: 'form_event' } },
                        { ref: 'save_response', nodeKey: 'action:googleSheets', title: 'Save response', requirementIds: ['req_1'], config: {} }
                    ],
                    capabilities: []
                })
            };
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Create a new Sheet: Create a new Event Registration Sheet',
        currentWorkflow: { nodes: [], edges: [] },
        formSchema: {
            id: 'form_event', title: 'Event Registration',
            fields: [{ id: 'name', label: 'Name', type: 'text', required: true }]
        },
        turnContext: {
            command: { type: 'submit_clarification', state: { createSpreadsheet: 'create' } },
            intent: {
                sourceText: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
                latestText: 'Create a new Sheet: Create a new Event Registration Sheet',
                authority: 'user'
            }
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLookup: async () => { throw new Error('Structured Create must not browse existing Sheets.'); },
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.resourceChanges.length, 1);
    assert.equal(result.resourceChanges[0].title, 'Event Registration');
    assert.deepEqual(result.resourceChanges[0].headers, ['Submitted At', 'Response ID', 'Name']);
    const append = result.nodes.find(node => node.nodeKey === 'action:googleSheets');
    assert.deepEqual(append.config.spreadsheetId, { $provision: result.resourceChanges[0].ref });
    assert.equal(Array.isArray(append.config.values[0]), true);
    assert.equal(append.config.values[0].length, 3);
});

test('pipeline reuses an applied Sheet for an approval follow-up instead of searching a legacy clarification receipt', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const workflow = {
        revision: 1,
        nodes: [
            { id: 'form_1', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', title: 'Event Registration submitted', config: { formId: 'form_event' }, position: { x: 100, y: 150 } },
            { id: 'sheet_1', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Save Event Registration response', config: { operation: 'append', spreadsheetId: 'sheet_event_registration', range: "'Responses'!A1", values: [] }, position: { x: 450, y: 150 } }
        ],
        edges: [{ id: 'edge_1', source: 'form_1', sourceHandle: 'event', target: 'sheet_1', targetHandle: 'event' }]
    };
    let sheetLookups = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') return {
                text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Require owner approval before saving each response.',
                    requirements: [{ id: 'req_approval', description: 'Ask the owner to approve each submitted response before it is saved.' }],
                    selectedNodeKeys: [],
                    capabilities: []
                })
            };
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') return {
                text: JSON.stringify({
                    operations: [{
                        op: 'add_approval_gate',
                        connection: { from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n2', handle: 'event' } },
                        approval: { ref: 'approval', title: 'Review Event Registration', config: {} }
                    }]
                })
            };
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Request my approval before saving the response.',
        currentWorkflow: workflow,
        history: [
            { sender: 'user', text: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.' },
            { sender: 'user', text: 'Create a new Sheet: Create a new “Event Registration” Sheet' }
        ],
        formSchema: { id: 'form_event', title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec, approvalSpec]),
        resourceLookup: async () => {
            sheetLookups += 1;
            throw new Error('A configured Sheet must not be searched again.');
        },
        resourceLoader: async ({ selections }) => {
            assert.equal(selections['google-spreadsheets'], 'sheet_event_registration');
            return {};
        }
    });

    assert.equal(result.type, 'proposal');
    assert.equal(sheetLookups, 0);
    assert.deepEqual(result.resourceChanges, []);
    assert.equal(result.capabilities.includes('owner_approval'), true);
    const sheet = result.nodes.find(node => node.id === 'sheet_1');
    const approval = result.nodes.find(node => node.subType === 'approval');
    assert.equal(sheet.config.spreadsheetId, 'sheet_event_registration');
    assert.equal(sheet.config.range, "'Responses'!A1");
    assert.equal(result.nodes.filter(node => node.subType === 'approval').length, 1);
    assert.ok(result.edges.some(edge => edge.source === 'form_1' && edge.target === approval.id && edge.sourceHandle === 'event'));
    assert.ok(result.edges.some(edge => edge.source === approval.id && edge.target === 'sheet_1' && edge.sourceHandle === 'approved'));
});

test('pipeline treats an empty approval rejection route as stop and repairs malformed existing Sheet values', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const workflow = {
        revision: 1,
        nodes: [
            { id: 'form_1', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', title: 'Event Registration submitted', config: { formId: 'form_event' }, position: { x: 100, y: 150 } },
            { id: 'sheet_1', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Save Event Registration response', config: { operation: 'append', spreadsheetId: 'sheet_event_registration', range: "'Responses'!A1", values: ['wrong'] }, position: { x: 450, y: 150 } }
        ],
        edges: [{ id: 'edge_1', source: 'form_1', sourceHandle: 'event', target: 'sheet_1', targetHandle: 'event' }]
    };
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') return {
                text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Require owner approval before saving each response.',
                    requirements: [{ id: 'req_approval', description: 'Ask the owner to approve each submitted response before it is saved.' }],
                    selectedNodeKeys: [],
                    capabilities: []
                })
            };
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') return {
                text: JSON.stringify({
                    operations: [{
                        op: 'add_approval_gate',
                        connection: { from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n2', handle: 'event' } },
                        approval: { ref: 'approval', title: 'Review Event Registration', config: {} },
                        whenRejected: {}
                    }]
                })
            };
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Request my approval before saving the response.',
        currentWorkflow: workflow,
        formSchema: { id: 'form_event', title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec, approvalSpec]),
        resourceLookup: async () => { throw new Error('The configured Sheet must be reused.'); },
        resourceLoader: async () => ({})
    });

    assert.equal(result.type, 'proposal');
    assert.deepEqual(result.resourceChanges, []);
    const sheet = result.nodes.find(node => node.id === 'sheet_1');
    const approval = result.nodes.find(node => node.subType === 'approval');
    assert.equal(sheet.config.spreadsheetId, 'sheet_event_registration');
    assert.equal(sheet.config.range, "'Responses'!A1");
    assert.equal(sheet.config.values[0].length, 3);
    assert.ok(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'approved' && edge.target === 'sheet_1'));
    assert.equal(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'rejected'), false);
    assert.equal(result.operations[0].whenRejected, undefined);
});

test('pipeline resolves a named Google Sheet with case- and spacing-normalized matching', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let lookupCount = 0;
    const result = await generateWorkflowTurn({
        request: 'Save the response to the event   registration google sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        provider: { async generateContent() { return { text: JSON.stringify({ type: 'reply', message: 'The existing Sheet is selected.' }) }; } },
        resourceLookup: async () => {
            lookupCount += 1;
            return { options: [{ value: 'sheet_event', label: 'Event Registration' }] };
        },
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(lookupCount, 1);
    assert.equal(result.type, 'reply');
    assert.match(result.message, /selected/i);
});

test('pipeline asks the user to choose between ambiguous named Google Sheets', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const result = await generateWorkflowTurn({
        request: 'Save the response to the Event Registration Google Sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        provider: { async generateContent() { throw new Error('The planner must not run before destination resolution.'); } },
        resourceLookup: async () => ({ options: [
            { value: 'sheet_current', label: 'Event Registration 2026' },
            { value: 'sheet_archive', label: 'Event Registration Archive' }
        ] }),
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'message');
    assert.equal(result.inputs[0].type, 'resource_picker');
    assert.deepEqual(result.inputs[0].options.map(option => option.id), ['sheet_current', 'sheet_archive']);
});

test('pipeline surfaces Google connection errors for a named Sheet instead of proposing a new one', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const result = await generateWorkflowTurn({
        request: 'Save the response to the Event Registration Google Sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        provider: { async generateContent() { throw new Error('The planner must not run before destination resolution.'); } },
        resourceLookup: async () => ({ options: [], error: {
            code: 'GOOGLE_RECONNECT_REQUIRED',
            message: 'Reconnect Google.',
            action: { type: 'open_connections', label: 'Reconnect Google', href: '/app/settings/connections' }
        } }),
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'reply');
    assert.equal(result.message, 'Reconnect Google.');
    assert.equal(result.errorMetadata.code, 'GOOGLE_RECONNECT_REQUIRED');
    assert.deepEqual(result.errorMetadata.action, { type: 'open_connections', label: 'Reconnect Google', href: '/app/settings/connections' });
});

test('pipeline unwraps an exact form resource ID accidentally wrapped as provisioned', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let plannerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                plannerCalls++;
                return {
                    text: JSON.stringify(plannerCalls === 1
                        ? { type: 'inspect_form', formId: 'form_1' }
                        : {
                            type: 'plan_complete',
                            summary: 'Send a thank-you email after owner approval.',
                            requirements: [{ id: 'req_1', description: 'Send a thank-you email to the respondent after approval.' }],
                            selectedNodeKeys: ['trigger:form-submission', 'logic:approval', 'action:email'],
                            capabilities: ['owner_approval', 'respondent_confirmation']
                        })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', title: 'Form submitted', config: { formId: { $provision: 'form_1' } } } },
                            { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email', title: 'Thank you', config: { to: { $binding: 'form_field_1' }, subject: 'Thank you' }, afterNodeRef: 'form' } },
                            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'email', handle: 'event' } },
                            { op: 'add_approval_gate', connection: { from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'email', handle: 'event' } }, approval: { ref: 'approval', title: 'Owner approval', config: {} } }
                        ]
                    })
                };
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
            return {
                text: JSON.stringify(prompts.length === 1
                    ? { type: 'inspect_form', formId: 'form_other' }
                    : { type: 'reply', message: 'The other form collects a Work email field.' })
            };
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
                return {
                    text: JSON.stringify(
                        contents[0].parts[0].text.includes('"label":"Email address"')
                            ? {
                                type: 'plan_complete',
                                summary: 'Send a thank-you email after form submission.',
                                requirements: [{ id: 'req_1', description: 'Send a thank-you email to the respondent.' }],
                                selectedNodeKeys: ['trigger:form-submission', 'action:email'],
                                capabilities: ['respondent_confirmation']
                            }
                            : { type: 'inspect_form', formId: 'form_1' }
                    )
                };
            }
            if (options.operation === 'workflow:worker') {
                workerPrompt = contents[0].parts[0].text;
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Promptly Form', config: { formId: 'form_1' } } },
                            { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email', title: 'Send thank-you email', config: { to: { $binding: 'form_field_1' }, subject: 'Thank you' }, afterNodeRef: 'form_trigger' } },
                            { op: 'connect', from: { nodeRef: 'form_trigger', handle: 'event' }, to: { nodeRef: 'email', handle: 'event' } }
                        ]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'direct_plan',
                        summary: 'Update the email subject.',
                        requirements: [{ id: 'req_1', description: 'Set the email subject to "Hello".' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: [],
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { subject: 'Hello' } } }]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Set email recipient.',
                        requirements: [{ id: 'req_1', description: 'Set email to field to user@example.com.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'user@example.com', subject: 'Hi' } } }]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Record each response before emailing.',
                        requirements: [{ id: 'req_1', description: 'Record the response before the email.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [{
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
                        }]
                    })
                };
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
            if (options.operation === 'workflow:planner') return {
                text: JSON.stringify({
                    type: 'plan_complete', summary: 'Save approved responses.',
                    requirements: [{ id: 'req_approval', description: 'Ask the owner to approve every response.' }],
                    selectedNodeKeys: ['trigger:form-submission', 'logic:approval', 'action:googleSheets'], capabilities: ['owner_approval']
                })
            };
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') return {
                text: JSON.stringify({
                    operations: [
                        { op: 'create_node', node: { ref: 'create', nodeKey: 'action:googleSheetsCreate', title: 'Create response sheet', config: {} } },
                        { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', title: 'Append approved response', config: { operation: 'append', range: "'Responses'!A1", values: [['wrong']] } } },
                        { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'create', handle: 'event' } },
                        { op: 'add_approval_gate', connection: { from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'create', handle: 'event' } }, approval: { ref: 'approval', title: 'Review required', config: {} } },
                        { op: 'connect', from: { nodeRef: 'create', handle: 'done' }, to: { nodeRef: 'append', handle: 'event' } }
                    ]
                })
            };
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
    assert.deepEqual(creator.config.headers, ['Submitted At', 'Response ID', 'Name']);
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Update email.',
                        requirements: [{ id: 'req_1', description: 'Update email config.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerAttempt++;
                if (workerAttempt === 1) {
                    // First attempt: invalid (no operations array)
                    return { text: JSON.stringify({ invalid: true }) };
                }
                // Second attempt (repair): valid
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'test@example.com' } } }]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Set subject to Welcome.',
                        requirements: [{ id: 'req_1', description: 'Set subject to "Welcome".' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                buildAttempt++;
                const subject = buildAttempt >= 2 ? 'Welcome' : undefined;
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'user@example.com', ...(subject ? { subject } : {}) } } }]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Set the email recipient.',
                        requirements: [{ id: 'req_1', description: 'Set the email recipient.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'team@example.com' } } }]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Create a webhook → email workflow.',
                        requirements: [
                            { id: 'req_1', description: 'Add a webhook trigger.' },
                            { id: 'req_2', description: 'Add an email action connected to the trigger.' }
                        ],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'trigger_new', nodeKey: 'trigger:webhook', title: 'Receive webhook', config: {} } },
                            { op: 'create_node', node: { ref: 'email_new', nodeKey: 'action:email', title: 'Send email', config: { to: 'team@example.com', subject: 'New event' }, afterNodeRef: 'trigger_new' } },
                            { op: 'connect', from: { nodeRef: 'trigger_new', handle: 'event' }, to: { nodeRef: 'email_new', handle: 'event' } }
                        ]
                    })
                };
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
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Add email using default provider.',
                        requirements: [{ id: 'req_1', description: 'Add email step.' }],
                        selectedNodeKeys: ['trigger:webhook', 'action:email'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { to: 'default@example.com' } } }]
                    })
                };
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
                return {
                    text: JSON.stringify(plannerAttempt === 1
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
                        })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [{ op: 'update_node', nodeRef: 'n2', updates: { config: { subject: 'Thank you' } } }]
                    })
                };
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

test('pipeline assembles a validated linear form-to-Sheets workflow without worker graph edits', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Save each submitted form response to a Google Sheet.',
                        requirements: [{ id: 'req_1', description: 'Append each submitted form response to a Google Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                        linearSteps: [
                            { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Form submitted', requirementIds: ['req_1'], config: { formId: 'form_1' } },
                            { ref: 'save_response', nodeKey: 'action:googleSheets', title: 'Save response', requirementIds: ['req_1'], config: { operation: 'append', spreadsheetId: { $provision: 'response_spreadsheet' }, range: "'Responses'!A1" } }
                        ],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerCalls++;
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'save_response', nodeKey: 'action:googleSheet', config: {} } },
                            { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'save_response', handle: 'event' } }
                        ]
                    })
                };
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
    assert.equal(workerCalls, 0);
    assert.deepEqual(result.nodes.map(node => node.nodeKey), ['trigger:form-submission', 'action:googleSheets']);
    assert.equal(result.edges.length, 1);
    assert.equal(result.nodes.find(node => node.nodeKey === 'action:googleSheets')?.config?.operation, 'append');
});

test('pipeline supports Ask Promptly compound wording with a proposed form schema and a new response Sheet', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') return {
                text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Save each conference registration response to a Sheet.',
                    requirements: [{ id: 'req_1', description: 'Append every submitted response to Google Sheets.' }],
                    selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                    linearSteps: [
                        { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Form submitted', requirementIds: ['req_1'], config: {} },
                        { ref: 'save_response', nodeKey: 'action:googleSheets', title: 'Save response', requirementIds: ['req_1'], config: {} }
                    ],
                    capabilities: []
                })
            };
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Can u design the conference registration form, then when the form receive the responses, save the responses inside the sheet',
        currentWorkflow: { nodes: [], edges: [] },
        formSchema: {
            id: 'pending_form_artifact',
            title: 'Conference Registration',
            fields: [
                { id: 'name', label: 'Name', type: 'text', required: true },
                { id: 'email', label: 'Email', type: 'email', required: true }
            ]
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.resourceChanges[0].title, 'Conference Registration Responses');
    assert.deepEqual(result.resourceChanges[0].headers, ['Submitted At', 'Response ID', 'Name', 'Email']);
    assert.equal(result.nodes.find(node => node.nodeKey === 'action:googleSheets').config.values[0].length, 4);
});

test('pipeline resolves a named owned form and assembles a connected form-to-Sheets proposal', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerCalls = 0;
    let spreadsheetLookups = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Save each Event Registration response to a Google Sheet.',
                        requirements: [{ id: 'req_1', description: 'Append each submitted Event Registration response to a Google Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                        linearSteps: [
                            { ref: 'form_trigger', nodeKey: 'trigger:form-submission', title: 'Form submitted', requirementIds: ['req_1'], config: {} },
                            { ref: 'save_response', nodeKey: 'action:googleSheets', title: 'Save response', requirementIds: ['req_1'], config: {} }
                        ],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerCalls += 1;
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form_trigger', nodeKey: 'trigger:form-submission', config: { formId: 'form_event' } } },
                            { op: 'create_node', node: { ref: 'save_response', nodeKey: 'action:googleSheets', config: { operation: 'append', spreadsheetId: { $provision: 'response_spreadsheet' }, range: "'Responses'!A1" } } }
                        ]
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        userContext: {
            forms: [
                { id: 'form_event', title: 'Event Registration', updatedAt: '2026-08-12T00:00:00.000Z' },
                { id: 'form_contact', title: 'Contact Us', updatedAt: '2026-08-11T00:00:00.000Z' }
            ]
        },
        formLoader: async ({ formId }) => formId === 'form_event'
            ? { id: formId, title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }] }
            : null,
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLookup: async () => {
            spreadsheetLookups += 1;
            return { options: [{ value: 'sheet_event_registration', label: 'Event Registration' }] };
        },
        resourceLoader: async ({ selections = {} }) => ({
            'google-spreadsheets': {
                resource: 'google-spreadsheets',
                options: [{ value: 'sheet_event_registration', label: 'Event Registration' }]
            },
            'google-sheet-ranges': {
                resource: 'google-sheet-ranges',
                variants: {
                    [JSON.stringify({ spreadsheetId: selections['google-spreadsheets'] })]: {
                        resource: 'google-sheet-ranges',
                        options: [{ value: "'Registrations'!A1", label: 'Registrations' }]
                    }
                }
            }
        })
    });

    assert.equal(result.type, 'proposal');
    assert.equal(spreadsheetLookups, 1);
    assert.equal(workerCalls, 0);
    assert.deepEqual(result.resourceChanges, []);
    assert.equal(result.nodes.find(node => node.nodeKey === 'trigger:form-submission')?.config?.formId, 'form_event');
    const sheets = result.nodes.find(node => node.nodeKey === 'action:googleSheets');
    assert.equal(sheets?.config?.operation, 'append');
    assert.equal(sheets?.config?.spreadsheetId, 'sheet_event_registration');
    assert.equal(sheets?.config?.range, "'Registrations'!A1");
    assert.equal(result.nodes.some(node => node.nodeKey === 'action:googleSheetsCreate'), false);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].source, result.nodes.find(node => node.nodeKey === 'trigger:form-submission')?.id);
    assert.equal(result.edges[0].target, result.nodes.find(node => node.nodeKey === 'action:googleSheets')?.id);
});

test('pipeline rejects a contradictory runtime Sheet creator from a direct plan for a selected destination', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let repairCalls = 0;
    const repairContexts = [];
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'direct_plan',
                        summary: 'Save registrations.',
                        requirements: [{ id: 'req_save', description: 'Append each registration response to the selected Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheetsCreate', 'action:googleSheets'],
                        capabilities: [],
                        operations: [
                            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', config: { formId: 'form_event' } } },
                            { op: 'create_node', node: { ref: 'create', nodeKey: 'action:googleSheetsCreate', afterNodeRef: 'form', config: {} } },
                            { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', afterNodeRef: 'create', config: { operation: 'append', spreadsheetId: { $provision: 'response_spreadsheet' }, range: "'Responses'!A1" } } },
                            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'create', handle: 'event' } },
                            { op: 'connect', from: { nodeRef: 'create', handle: 'done' }, to: { nodeRef: 'append', handle: 'event' } }
                        ]
                    })
                };
            }
            if (options.operation === 'workflow:worker repair') {
                repairCalls += 1;
                repairContexts.push(contents?.[0]?.parts?.[0]?.text || '');
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', config: { formId: 'form_event' } } },
                            { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', afterNodeRef: 'form', config: { operation: 'append' } } },
                            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'append', handle: 'event' } }
                        ]
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
        currentWorkflow: { nodes: [], edges: [] },
        formSchema: { id: 'form_event', title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsCreateSpec, googleSheetsSpec]),
        resourceLookup: async () => ({ options: [{ value: 'sheet_event_registration', label: 'Event Registration' }] }),
        resourceLoader: async ({ selections = {} }) => ({
            'google-spreadsheets': { options: [{ value: 'sheet_event_registration', label: 'Event Registration' }] },
            'google-sheet-ranges': {
                variants: {
                    [JSON.stringify({ spreadsheetId: selections['google-spreadsheets'] })]: {
                        options: [{ value: "'Registrations'!A1", label: 'Registrations' }]
                    }
                }
            }
        })
    });

    assert.equal(result.type, 'proposal');
    assert.equal(repairCalls, 1);
    assert.match(repairContexts[0], /WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN/);
    assert.equal(result.nodes.some(node => node.nodeKey === 'action:googleSheetsCreate'), false);
    assert.deepEqual(result.resourceChanges, []);
    assert.equal(result.nodes.find(node => node.nodeKey === 'action:googleSheets')?.config?.spreadsheetId, 'sheet_event_registration');
    assert.equal(result.edges.length, 1);
});

test('pipeline repairs a runtime Sheet creator when the user chose one Sheet to provision on Apply', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let repairCalls = 0;
    const repairContexts = [];
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Save registrations in a new Event Registration Sheet.',
                        requirements: [{ id: 'req_save', description: 'Append every registration response to the new Event Registration Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheetsCreate', 'action:googleSheets'],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', config: { formId: 'form_event' } } },
                            { op: 'create_node', node: { ref: 'create', nodeKey: 'action:googleSheetsCreate', afterNodeRef: 'form', config: {} } },
                            { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', afterNodeRef: 'create', config: { operation: 'append', spreadsheetId: { $provision: 'response_spreadsheet' }, range: "'Responses'!A1" } } },
                            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'create', handle: 'event' } },
                            { op: 'connect', from: { nodeRef: 'create', handle: 'done' }, to: { nodeRef: 'append', handle: 'event' } }
                        ]
                    })
                };
            }
            if (options.operation === 'workflow:worker repair') {
                repairCalls += 1;
                repairContexts.push(contents?.[0]?.parts?.[0]?.text || '');
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission', config: { formId: 'form_event' } } },
                            { op: 'create_node', node: { ref: 'append', nodeKey: 'action:googleSheets', afterNodeRef: 'form', config: { operation: 'append' } } },
                            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'append', handle: 'event' } }
                        ]
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'Create a new Event Registration Sheet and save every submitted response there.',
        currentWorkflow: { nodes: [], edges: [] },
        formSchema: { id: 'form_event', title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text' }] },
        turnContext: {
            command: { type: 'submit_clarification', state: { createSpreadsheet: 'create' } },
            intent: {
                sourceText: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
                latestText: 'Create a new Event Registration Sheet and save every submitted response there.',
                authority: 'user'
            }
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsCreateSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(repairCalls, 1);
    assert.match(repairContexts[0], /WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN/);
    assert.equal(result.nodes.some(node => node.nodeKey === 'action:googleSheetsCreate'), false);
    assert.equal(result.resourceChanges.length, 1);
    assert.equal(result.nodes.find(node => node.nodeKey === 'action:googleSheets')?.config?.spreadsheetId?.$provision, 'response_spreadsheet');
    assert.equal(result.edges.length, 1);
});

test('pipeline returns a form choice when named-form matching is ambiguous', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Save the registration response.',
                        requirements: [{ id: 'req_1', description: 'Append the submitted registration response to a Google Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                        linearSteps: [
                            { ref: 'form_trigger', nodeKey: 'trigger:form-submission', requirementIds: ['req_1'], config: {} },
                            { ref: 'save_response', nodeKey: 'action:googleSheets', requirementIds: ['req_1'], config: {} }
                        ],
                        capabilities: []
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When the registration form is submitted, save the response.',
        currentWorkflow: { nodes: [], edges: [] },
        userContext: {
            forms: [
                { id: 'form_event', title: 'Event Registration' },
                { id: 'form_member', title: 'Member Registration' }
            ]
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'message');
    assert.match(result.message, /more than one form/i);
    assert.deepEqual(result.inputs, [{
        id: 'formId',
        type: 'resource_choice',
        label: 'Form',
        options: [
            { id: 'form_event', name: 'Event Registration', description: null },
            { id: 'form_member', name: 'Member Registration', description: null }
        ]
    }]);
});

test('pipeline resumes a form choice clarification with the selected owned form', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Save the Event Registration response.',
                        requirements: [{ id: 'req_1', description: 'Append the submitted Event Registration response to a Google Sheet.' }],
                        selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
                        linearSteps: [
                            { ref: 'form_trigger', nodeKey: 'trigger:form-submission', requirementIds: ['req_1'], config: {} },
                            { ref: 'save_response', nodeKey: 'action:googleSheets', requirementIds: ['req_1'], config: {} }
                        ],
                        capabilities: []
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When the Event Registration form is submitted, save the response.',
        currentWorkflow: { nodes: [], edges: [] },
        turnContext: { command: { type: 'submit_clarification', state: { formId: 'form_event' } } },
        userContext: { forms: [{ id: 'form_event', title: 'Event Registration' }] },
        formLoader: async ({ formId }) => ({ id: formId, title: 'Event Registration', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }] }),
        provider,
        registry: makeRegistry([formSubmissionSpec, googleSheetsSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(result.nodes.find(node => node.nodeKey === 'trigger:form-submission')?.config?.formId, 'form_event');
    assert.equal(result.edges.length, 1);
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
                return {
                    text: JSON.stringify(plannerCalls === 1
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
                        })
                };
            }
            if (options.operation === 'workflow:worker') {
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', config: {} } },
                            { op: 'create_node', node: { ref: 'send_email', nodeKey: 'action:email', afterNodeRef: 'webhook_trigger', config: { to: 'team@example.com' } } },
                            { op: 'connect', from: { nodeRef: 'webhook_trigger', handle: 'event' }, to: { nodeRef: 'send_email', handle: 'event' } }
                        ]
                    })
                };
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

test('pipeline assembles repeated actions in a generic linear workflow', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
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
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'notify_team', nodeKey: 'action:emails', config: {} } }
                        ]
                    })
                };
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
    assert.equal(result.warnings.some(warning => warning.code === 'WORKFLOW_DETERMINISTIC_FALLBACK_USED'), false);
});

test('pipeline assembles a terminal approval without asking the worker to invent an outcome route', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Ask for approval after a webhook.',
                        requirements: [{ id: 'req_1', description: 'Route the webhook through approval.' }],
                        selectedNodeKeys: ['trigger:webhook', 'logic:approval'],
                        linearSteps: [
                            { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_1'], config: {} },
                            { ref: 'approval_step', nodeKey: 'logic:approval', requirementIds: ['req_1'], config: {} }
                        ],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker' || options.operation === 'workflow:worker repair') {
                workerCalls += 1;
                return {
                    text: JSON.stringify({
                        operations: [
                            { op: 'create_node', node: { ref: 'approval_step', nodeKey: 'logic:approvals', config: {} } }
                        ]
                    })
                };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };

    const result = await generateWorkflowTurn({
        request: 'When a webhook arrives, ask me to approve it.',
        currentWorkflow: { nodes: [], edges: [] },
        provider,
        registry: makeRegistry([triggerSpec, approvalSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(workerCalls, 0);
    assert.equal(result.nodes.filter(node => node.nodeKey === 'logic:approval').length, 1);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].sourceHandle, 'event');
    assert.equal(result.edges[0].targetHandle, 'event');
});

test('pipeline compiles an if/otherwise notification branch when the worker repeats refs and aliases an action node', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let workerCalls = 0;
    let workerPrompt = '';
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Send the right event instructions after manager approval.',
                        requirements: [{ id: 'req_branch', description: 'After approval, send online instructions when attendance is Online; otherwise send venue instructions.' }],
                        // The pipeline must add the semantic Condition and Email specs even when the planner omits them.
                        selectedNodeKeys: [],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker') {
                workerCalls += 1;
                workerPrompt = contents[0].parts[0].text;
                return {
                    text: JSON.stringify({
                        operations: [{
                            op: 'add_condition_branch',
                            from: { nodeRef: 'n2', handle: 'approved' },
                            condition: {
                                ref: 'online_email',
                                title: 'Attendance is Online',
                                config: { valueA: { $binding: 'form_field_2' }, operator: 'equals', valueB: 'Online' }
                            },
                            whenTrue: {
                                ref: 'online_email',
                                nodeKey: 'action:send_email',
                                title: 'Send joining instructions',
                                config: { to: { $binding: 'form_field_1' }, subject: 'Joining instructions' }
                            },
                            whenFalse: {
                                ref: 'online_email',
                                nodeKey: 'action:send_email',
                                title: 'Send venue instructions',
                                config: { to: { $binding: 'form_field_1' }, subject: 'Venue instructions' }
                            }
                        }]
                    })
                };
            }
            assert.notEqual(options.operation, 'workflow:worker repair');
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };
    const currentWorkflow = {
        revision: 7,
        nodes: [
            { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', title: 'Event Registration submitted', config: { formId: 'form_event' }, position: { x: 100, y: 200 } },
            { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Manager approval', config: {}, position: { x: 450, y: 200 } },
            { id: 'sheet', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Save Event Registration response', config: {}, position: { x: 800, y: 200 } }
        ],
        edges: [
            { id: 'form_to_approval', source: 'form', sourceHandle: 'event', target: 'approval', targetHandle: 'event' },
            { id: 'approval_to_sheet', source: 'approval', sourceHandle: 'approved', target: 'sheet', targetHandle: 'event' }
        ]
    };

    const result = await generateWorkflowTurn({
        request: 'If attendance mode is Online, send joining instructions; otherwise send venue instructions.',
        currentWorkflow,
        formSchema: {
            id: 'form_event',
            title: 'Event Registration',
            fields: [
                { id: 'email', label: 'Email', type: 'email', required: true },
                { id: 'attendance_mode', label: 'Attendance mode', type: 'select', required: true }
            ]
        },
        provider,
        registry: makeRegistry([formSubmissionSpec, approvalSpec, googleSheetsSpec, conditionSpec, emailSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.equal(workerCalls, 1);
    assert.match(workerPrompt, /"logic:condition"/);
    assert.match(workerPrompt, /"action:email"/);
    const condition = result.nodes.find(node => node.nodeKey === 'logic:condition');
    const onlineEmail = result.nodes.find(node => node.title === 'Send joining instructions');
    const venueEmail = result.nodes.find(node => node.title === 'Send venue instructions');
    assert.ok(condition);
    assert.ok(onlineEmail);
    assert.ok(venueEmail);
    assert.ok(result.edges.some(edge => edge.id === 'approval_to_sheet'));
    assert.ok(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'approved' && edge.target === condition.id && edge.targetHandle === 'input1'));
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'true' && edge.target === onlineEmail.id));
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'false' && edge.target === venueEmail.id));
    assert.equal(result.operations[0].op, 'add_condition_branch');
    assert.equal(result.operations[0].condition.ref, 'cf_1_condition');
    assert.equal(result.operations[0].whenTrue.ref, 'cf_1_true');
    assert.equal(result.operations[0].whenFalse.ref, 'cf_1_false');
    assert.equal(result.operations[0].whenTrue.nodeKey, 'action:email');
    assert.equal(result.diff.edges.length, 1);
});

test('pipeline lets AI narrow a shared approval to the venue route and lets the compiler preserve the graph', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const currentWorkflow = {
        revision: 8,
        nodes: [
            { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Receive registration', config: {}, position: { x: 100, y: 200 } },
            { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Review before both email routes', config: { title: 'Review before both email routes' }, position: { x: 450, y: 200 } },
            { id: 'condition', type: 'logic', subType: 'condition', nodeKey: 'logic:condition', title: 'Check Attendance Mode', config: { valueA: 'Online', operator: 'equals', valueB: 'Online' }, position: { x: 800, y: 200 } },
            { id: 'online', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Joining Instructions', config: { to: 'online@example.com', subject: 'Joining instructions' }, position: { x: 1150, y: 100 } },
            { id: 'venue', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Venue Instructions', config: { to: 'venue@example.com', subject: 'Venue instructions' }, position: { x: 1150, y: 300 } }
        ],
        edges: [
            { id: 'trigger_approval', source: 'trigger', sourceHandle: 'event', target: 'approval', targetHandle: 'event' },
            { id: 'approval_condition', source: 'approval', sourceHandle: 'approved', target: 'condition', targetHandle: 'input1' },
            { id: 'condition_online', source: 'condition', sourceHandle: 'true', target: 'online', targetHandle: 'event' },
            { id: 'condition_venue', source: 'condition', sourceHandle: 'false', target: 'venue', targetHandle: 'event' }
        ]
    };
    let providerCalls = 0;
    const provider = {
        async generateContent(_contents, options) {
            providerCalls += 1;
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Only require the existing approval before venue instructions.',
                    requirements: [{ id: 'req_venue_approval', description: 'Keep Online instructions unapproved and require the existing approval before Venue instructions.' }],
                    selectedNodeKeys: ['logic:approval'],
                    capabilities: ['owner_approval']
                }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({
                    operations: [{
                        op: 'move_approval_gate',
                        approvalNodeRef: 'n2',
                        connection: { from: { nodeRef: 'n3', handle: 'false' }, to: { nodeRef: 'n5', handle: 'event' } },
                        approvalUpdates: { title: 'Review before Venue Instructions', config: { title: 'Review before Venue Instructions' } }
                    }]
                }) };
            }
            if (options.operation === 'workflow:verifier') return { text: JSON.stringify({ status: 'pass', issues: [] }) };
            throw new Error(`Unexpected workflow operation: ${options.operation}`);
        }
    };
    const request = 'approval only for venue, means after checking the attendance mode, I only need to approve for the physical one (venue) online no need';
    const registry = makeRegistry([triggerSpec, approvalSpec, conditionSpec, emailSpec]);

    const result = await generateWorkflowTurn({ request, currentWorkflow, provider, registry, resourceLoader });

    assert.equal(result.type, 'proposal');
    assert.equal(providerCalls, 3);
    assert.equal(result.operations[0].op, 'move_approval_gate');
    assert.equal(result.nodes.find(node => node.id === 'approval')?.title, 'Review before Venue Instructions');
    assert.equal(result.edges.some(edge => edge.source === 'trigger' && edge.target === 'approval'), false);
    assert.ok(result.edges.some(edge => edge.source === 'trigger' && edge.target === 'condition'));
    assert.ok(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'true' && edge.target === 'online'));
    assert.equal(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'false' && edge.target === 'venue'), false);
    assert.ok(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'false' && edge.target === 'approval'));
    assert.ok(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'approved' && edge.target === 'venue'));
});

test('pipeline keeps the original invalid reference when a repair returns no operations', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    const provider = {
        async generateContent(_contents, options) {
            if (options.operation === 'workflow:planner') {
                return { text: JSON.stringify({
                    type: 'plan_complete',
                    summary: 'Add approval before the existing email.',
                    requirements: [{ id: 'req_approval', description: 'Wait for owner approval before sending the existing email.' }],
                    selectedNodeKeys: ['logic:approval'],
                    capabilities: ['owner_approval']
                }) };
            }
            if (options.operation === 'workflow:worker') {
                return { text: JSON.stringify({
                    operations: [{
                        op: 'add_approval_gate',
                        connection: { from: { nodeRef: 'n99', handle: 'event' }, to: { nodeRef: 'n2', handle: 'event' } },
                        approval: { ref: 'review', title: 'Review', config: {} }
                    }]
                }) };
            }
            return { text: JSON.stringify({ operations: [] }) };
        }
    };

    await assert.rejects(() => generateWorkflowTurn({
        request: 'Request approval before saving the workflow response.',
        currentWorkflow: existingWorkflow,
        provider,
        registry: makeRegistry([triggerSpec, emailSpec, approvalSpec]),
        resourceLoader
    }), error => {
        assert.equal(error.code, 'WORKFLOW_AI_UNSAFE_PROPOSAL');
        assert.equal(error.issues[0].code, 'WORKFLOW_NODE_REF_INVALID');
        assert.ok(error.issues.some(issue => issue.code === 'EMPTY_OPERATIONS'));
        return true;
    });
});

test('pipeline repairs the historical true source-handle mistake as a semantic branch', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let repairPrompt = '';
    const branch = handle => ({
        op: 'add_condition_branch',
        from: { nodeRef: 'n2', handle },
        condition: { ref: 'attendance_is_online', config: { valueA: 'Online', operator: 'equals', valueB: 'Online' } },
        whenTrue: { ref: 'send_online', nodeKey: 'action:email', config: { to: 'online@example.com', subject: 'Joining instructions' } },
        whenFalse: { ref: 'send_venue', nodeKey: 'action:email', config: { to: 'venue@example.com', subject: 'Venue instructions' } }
    });
    const provider = {
        async generateContent(contents, options) {
            if (options.operation === 'workflow:planner') {
                return {
                    text: JSON.stringify({
                        type: 'plan_complete',
                        summary: 'Send online or venue instructions after approval.',
                        requirements: [{ id: 'req_branch', description: 'Send online instructions for Online attendance and venue instructions otherwise.' }],
                        selectedNodeKeys: [],
                        capabilities: []
                    })
                };
            }
            if (options.operation === 'workflow:worker') return { text: JSON.stringify({ operations: [branch('true')] }) };
            if (options.operation === 'workflow:worker repair') {
                repairPrompt = contents[0].parts[0].text;
                return { text: JSON.stringify({ operations: [branch('approved')] }) };
            }
            return { text: JSON.stringify({ status: 'pass', issues: [] }) };
        }
    };
    const currentWorkflow = {
        nodes: [
            { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Event registration submitted', config: {} },
            { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Manager approval', config: {} },
            { id: 'sheet', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Save registration', config: {} }
        ],
        edges: [
            { id: 'trigger_to_approval', source: 'trigger', sourceHandle: 'event', target: 'approval', targetHandle: 'event' },
            { id: 'approval_to_sheet', source: 'approval', sourceHandle: 'approved', target: 'sheet', targetHandle: 'event' }
        ]
    };

    const result = await generateWorkflowTurn({
        request: 'If attendance mode is Online, send joining instructions; otherwise send venue instructions.',
        currentWorkflow,
        provider,
        registry: makeRegistry([triggerSpec, approvalSpec, googleSheetsSpec, conditionSpec, emailSpec]),
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    assert.match(repairPrompt, /WORKFLOW_HANDLE_INVALID/);
    assert.match(repairPrompt, /Provided value: "true"/);
    assert.match(repairPrompt, /Allowed values: approved, rejected/);
    assert.equal(result.operations[0].from.handle, 'approved');
    assert.ok(result.edges.some(edge => edge.id === 'approval_to_sheet'));
});
