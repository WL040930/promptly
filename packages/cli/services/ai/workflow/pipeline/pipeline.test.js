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
        resourceLoader
    });

    assert.equal(result.type, 'message');
    assert.equal(result.inputs[0].id, 'q1');
    assert.deepEqual(result.inputs[0].options, ['Gmail', 'SendGrid']);
});

// ---------------------------------------------------------------------------
// Direct plan — compiled without a separate worker call
// ---------------------------------------------------------------------------

test('pipeline compiles a direct_plan using at most 2 AI calls (planner + verifier)', async () => {
    const { generateWorkflowTurn } = await import('./pipeline.js');
    let callCount = 0;
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
        resourceLoader
    });

    assert.equal(result.type, 'proposal');
    // Only 2 AI calls: planner + verifier (no separate worker call)
    assert.ok(callCount <= 2, `Expected ≤2 AI calls for direct_plan, got ${callCount}`);
    assert.ok(result.nodes.find(n => n.subType === 'email')?.config?.subject === 'Hello');
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
