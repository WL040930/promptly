import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleWorkflow, buildWorkflowEditView, classifyRequest, compileWorkflowDraft, compileWorkflowEdits, layoutWorkflowNodes, loadWorkflowResourceContext, patchWorkflow, readWorkflowInstruction, requiredCapabilitiesForRequest, resolveRespondentEmailField, validateGeneratedResourceValues, validateGeneratedWorkflowCapabilities } from './workflowAgentService.js';
import NodeRegistry from '../../../utils/NodeRegistry.js';

const spec = (nodeKey, type, subType) => ({
    nodeKey,
    type,
    subType,
    title: nodeKey,
    description: '',
    schema: { inputs: [], outputs: [] },
    ui: {}
});

test('workflow edit views expose semantic node refs and never expose edge IDs', () => {
    const view = buildWorkflowEditView({
        revision: 4,
        nodes: [
            { id: 'opaque-node-1', type: 'trigger', subType: 'webhook', title: 'Receive request', config: {} },
            { id: 'opaque-node-2', type: 'action', subType: 'email', title: 'Send email', config: {} }
        ],
        edges: [{ id: 'opaque-edge-1', source: 'opaque-node-1', target: 'opaque-node-2', sourceHandle: 'event' }]
    });

    assert.deepEqual(view.nodes[0].ref, 'n1');
    assert.equal('id' in view.nodes[0], false);
    assert.equal('id' in view.connections[0], false);
    assert.equal(view.connections[0].from.nodeRef, 'n1');
});

const editRegistry = specs => ({
    getDefinition: (type, subType) => specs.find(item => item.type === type && item.subType === subType)
        ? { implementationStatus: 'experimental', configSchema: specs.find(item => item.type === type && item.subType === subType).schema }
        : null
});

test('semantic workflow edits resolve node refs and generate internal connection IDs', () => {
    const specs = [
        { ...spec('trigger:webhook', 'trigger', 'webhook'), schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { ...spec('action:email', 'action', 'email'), schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [{ id: 'trigger_1', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Receive request', config: {}, schema: specs[0].schema, position: { x: 100, y: 150 } }],
            edges: []
        },
        specs,
        registry: editRegistry(specs),
        operations: [
            { op: 'create_node', node: { ref: 'email_step', nodeKey: 'action:email', title: 'Send email', config: {} } },
            { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'email_step', handle: 'inputData' } }
        ]
    });

    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].source, 'trigger_1');
    assert.equal(result.edges[0].targetHandle, 'inputData');
    assert.match(result.edges[0].id, /^edge_/);
});

test('workflow assembly layout follows graph depth and separates siblings', () => {
    const nodes = [
        { id: 'trigger', type: 'trigger' },
        { id: 'first', type: 'action' },
        { id: 'second', type: 'action' },
        { id: 'final', type: 'action' }
    ];
    const edges = [
        { source: 'trigger', target: 'first' },
        { source: 'trigger', target: 'second' },
        { source: 'first', target: 'final' }
    ];

    const positioned = layoutWorkflowNodes(nodes, edges);

    assert.deepEqual(positioned.map(node => node.position), [
        { x: 100, y: 150 },
        { x: 450, y: 150 },
        { x: 450, y: 350 },
        { x: 800, y: 150 }
    ]);
});

test('semantic workflow edits reject unknown refs and handles without mutating the source', () => {
    const currentNodes = [
        {
            id: 'trigger_1',
            type: 'trigger',
            subType: 'webhook',
            nodeKey: 'trigger:webhook',
            schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] },
            position: { x: 100, y: 150 }
        }
    ];
    const specs = [{ ...spec('action:email', 'action', 'email'), schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] } }, ...[{ ...spec('trigger:webhook', 'trigger', 'webhook'), schema: currentNodes[0].schema }]];
    const currentWorkflow = { nodes: currentNodes, edges: [] };

    assert.throws(
        () => compileWorkflowEdits({ currentWorkflow, specs, registry: editRegistry(specs), operations: [{ op: 'create_node', node: { ref: 'new_email', nodeKey: 'action:not-real' } }] }),
        error => error.code === 'WORKFLOW_NODE_KEY_INVALID'
    );

    assert.throws(
        () => compileWorkflowEdits({
            currentWorkflow,
            specs,
            registry: editRegistry(specs),
            operations: [
                { op: 'create_node', node: { ref: 'new_email', nodeKey: 'action:email' } },
                { op: 'connect', from: { nodeRef: 'n1', handle: 'missing' }, to: { nodeRef: 'new_email', handle: 'inputData' } }
            ]
        }),
        error => error.code === 'WORKFLOW_HANDLE_INVALID'
    );

    assert.deepEqual(currentWorkflow, { nodes: currentNodes, edges: [] });
});

test('disconnecting a missing semantic connection returns a stable error, not an edge ID', () => {
    const workflow = {
        nodes: [{ id: 'trigger_1', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }, config: {} }],
        edges: []
    };
    assert.throws(
        () => compileWorkflowEdits({
            currentWorkflow: workflow,
            specs: [{ ...spec('trigger:webhook', 'trigger', 'webhook'), schema: workflow.nodes[0].schema }],
            registry: editRegistry([{ ...spec('trigger:webhook', 'trigger', 'webhook'), schema: workflow.nodes[0].schema }]),
            operations: [{ op: 'disconnect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n1', handle: null } }]
        }),
        error => error.code === 'WORKFLOW_CONNECTION_NOT_FOUND' && !/edge/i.test(error.message)
    );
});

test('patch workflow performs one bounded semantic repair without exposing edge IDs', async () => {
    const specs = [
        { ...spec('trigger:webhook', 'trigger', 'webhook'), schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { ...spec('action:email', 'action', 'email'), schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] } }
    ];
    const currentWorkflow = {
        revision: 7,
        nodes: [
            { id: 'trigger_1', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Receive request', config: {}, schema: specs[0].schema, position: { x: 100, y: 150 } },
            { id: 'email_existing', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Existing email', config: {}, schema: specs[1].schema, position: { x: 450, y: 150 } }
        ],
        edges: [{ id: 'opaque-edge-1', source: 'trigger_1', target: 'email_existing', sourceHandle: 'event', targetHandle: 'inputData' }]
    };
    const prompts = [];
    let attempt = 0;
    const result = await patchWorkflow({
        message: 'Add an email step after the trigger.',
        currentWorkflow,
        classification: {},
        specs,
        registry: editRegistry(specs),
        provider: async prompt => {
            prompts.push(prompt);
            attempt += 1;
            return attempt === 1
                ? { value: { operations: [{ op: 'disconnect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n1', handle: null } }] }, tokenUsage: { totalTokens: 2 } }
                : { value: { operations: [
                    { op: 'create_node', node: { ref: 'email_step', nodeKey: 'action:email', title: 'Send email', config: {} } },
                    { op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'email_step', handle: 'inputData' } }
                ] }, tokenUsage: { totalTokens: 3 } };
        },
        instructionReader: async () => 'Return JSON only'
    });

    assert.equal(attempt, 2);
    assert.equal(result.nodes.length, 3);
    assert.equal(result.edges.length, 2);
    assert.equal(result.tokenUsage.totalTokens, 5);
    assert.match(prompts[0], /"ref":"n1"/);
    assert.doesNotMatch(prompts[0], /opaque-edge|"id":"edge/);
    assert.match(prompts[1], /WORKFLOW_CONNECTION_NOT_FOUND/);
});

test('workflow stages load instructions from their actual instruction directory', async () => {
    for (const name of ['classifier.md', 'assembler.md', 'patcher.md']) {
        const content = await readWorkflowInstruction(name);
        assert.match(content, /Return JSON only/);
    }
});

test('generated workflow resources must come from the account context', () => {
    const specs = [{
        nodeKey: 'trigger:form-submission',
        type: 'trigger',
        subType: 'form-submission',
        schema: { inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', label: 'Form' }] }
    }];
    const issues = validateGeneratedResourceValues({
        specs,
        nodes: [{ nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', config: { formId: 'invented-form' } }],
        resourceContext: { forms: { options: [{ value: 'form_real', label: 'Real form' }] } }
    });
    assert.equal(issues[0].code, 'WORKFLOW_RESOURCE_NOT_FOUND');
});

test('generated workflow resources are rejected when the account has no matching options', () => {
    const specs = [{
        nodeKey: 'trigger:form-submission',
        type: 'trigger',
        subType: 'form-submission',
        schema: { inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', label: 'Form' }] }
    }];
    const issues = validateGeneratedResourceValues({
        specs,
        nodes: [{ nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', config: { formId: 'invented-form' } }],
        resourceContext: { forms: { options: [], emptyMessage: 'Create a form first.' } }
    });
    assert.equal(issues[0].code, 'WORKFLOW_RESOURCE_NOT_FOUND');
});

test('confirmation capability accepts different contact field and node identifiers', () => {
    const variants = [
        { fieldId: 'candidate_contact', nodeId: 'form_entry', provider: 'system-default' },
        { fieldId: 'respondentEmail', nodeId: 'submission_source', provider: 'user-gmail' }
    ];

    for (const variant of variants) {
        const issues = validateGeneratedWorkflowCapabilities({
            requiredCapabilities: ['respondent_confirmation'],
            formSchema: {
                fields: [{ id: variant.fieldId, label: 'Contact address', type: 'email', required: true }]
            },
            nodes: [
                { id: variant.nodeId, type: 'trigger', subType: 'form-submission', config: { formId: 'form_approved' } },
                {
                    id: 'email_action',
                    type: 'action',
                    subType: 'email',
                    config: {
                        emailProvider: variant.provider,
                        to: `{{${variant.nodeId}.fields.${variant.fieldId}}}`,
                        subject: 'Thanks for your submission',
                        body: 'We received your response.'
                    }
                }
            ],
            edges: [{ source: variant.nodeId, target: 'email_action' }]
        });

        assert.deepEqual(issues, []);
    }
});

test('request capability detection recognises equivalent confirmation language', () => {
    for (const message of [
        'Email the applicant after the submission.',
        'Send a thank-you message to the respondent.',
        'Confirm the user received the registration.',
        'Create a job application form and then send a confirmation / thank you email to the user once the user has submit the form.'
    ]) {
        assert.deepEqual(requiredCapabilitiesForRequest(message), ['respondent_confirmation']);
    }
    assert.deepEqual(requiredCapabilitiesForRequest('Store the response in a spreadsheet.'), []);
});

test('request capability detection requires explicit approval branches for review requests', () => {
    const capabilities = requiredCapabilitiesForRequest('When the job application is submitted, approve or reject it and email the applicant.');
    assert.deepEqual(capabilities, ['respondent_confirmation', 'owner_approval']);
});

test('application review capability validates both approval output branches', () => {
    const nodes = [
        { id: 'trigger', type: 'trigger', subType: 'form-submission' },
        { id: 'approval', type: 'logic', subType: 'approval', config: {} },
        { id: 'approved_mail', type: 'action', subType: 'email', config: {} },
        { id: 'rejected_mail', type: 'action', subType: 'email', config: {} }
    ];
    const edges = [
        { source: 'trigger', target: 'approval' },
        { source: 'approval', target: 'approved_mail', sourceHandle: 'approved' },
        { source: 'approval', target: 'rejected_mail', sourceHandle: 'rejected' }
    ];
    assert.deepEqual(validateGeneratedWorkflowCapabilities({
        requiredCapabilities: ['application_review_decision'],
        nodes,
        edges
    }), []);
});

test('application review binds both branch emails to the required applicant field', () => {
    const result = compileWorkflowDraft({
        requiredCapabilities: ['respondent_confirmation', 'application_review_decision'],
        formSchema: { fields: [{ id: 'email', type: 'email', label: 'Email', required: true }] },
        nodes: [
            { id: 'trigger', type: 'trigger', subType: 'form-submission', config: {} },
            { id: 'approval', type: 'logic', subType: 'approval', config: { assigneeEmail: 'invented@example.com', assigneeType: 'external', expiresAfterHours: 24 } },
            { id: 'approved_mail', type: 'action', subType: 'email', config: { to: 'invented@example.com' } },
            { id: 'rejected_mail', type: 'action', subType: 'email', config: { to: 'invented@example.com' } }
        ],
        edges: []
    });
    assert.deepEqual(result.nodes.find(node => node.id === 'approval').config, {});
    assert.equal(result.nodes.find(node => node.id === 'approved_mail').config.to, '{{trigger.fields.email}}');
    assert.equal(result.nodes.find(node => node.id === 'rejected_mail').config.to, '{{trigger.fields.email}}');
});

test('confirmation capability rejects a literal or unknown respondent recipient', () => {
    const issues = validateGeneratedWorkflowCapabilities({
        requiredCapabilities: ['respondent_confirmation'],
        formSchema: { fields: [{ id: 'contact', label: 'Contact address', type: 'email', required: true }] },
        nodes: [
            { id: 'source', type: 'trigger', subType: 'form-submission', config: { formId: 'form_approved' } },
            {
                id: 'mailer',
                type: 'action',
                subType: 'email',
                config: { to: 'owner@example.com', subject: 'Thanks', body: 'Received.' }
            }
        ],
        edges: [{ source: 'source', target: 'mailer' }]
    });

    assert.ok(issues.some(issue => issue.code === 'RESPONDENT_RECIPIENT_NOT_DYNAMIC'));
});

test('workflow assembly enforces requested capabilities against supplied form data', async () => {
    const triggerSchema = {
        inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', required: true }],
        outputs: [{ name: 'triggerData', isConnection: true }, { name: 'fields', isConnection: true }]
    };
    const emailSchema = {
        inputs: [
            { name: 'triggerData', isConnection: true },
            { name: 'emailProvider', type: 'resource-select', resource: 'email-providers' },
            { name: 'to', type: 'text', required: true },
            { name: 'subject', type: 'text', required: true },
            { name: 'body', type: 'textarea', required: true }
        ],
        outputs: [{ name: 'outputData', isConnection: true }]
    };
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: 'Start from a form', schema: triggerSchema, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Send confirmation', description: 'Send a message', schema: emailSchema, ui: {} }
    ];
    const registry = {
        getDefinition: (type, subType) => ({ implementationStatus: 'experimental', configSchema: type === 'trigger' ? triggerSchema : emailSchema })
    };

    const result = await assembleWorkflow({
        message: 'Create a job application form and then send a confirmation / thank you email to the user once the user has submit the form.',
        specs,
        formId: 'form_approved',
        formSchema: { fields: [{ id: 'candidate_contact', type: 'email', required: true, label: 'Contact address' }] },
        requiredCapabilities: ['respondent_confirmation'],
        resourceContext: {
            forms: { options: [{ value: 'form_approved', label: 'Application form' }] },
            'email-providers': { options: [{ value: 'system-default', label: 'Promptly email' }] }
        },
        registry,
        provider: async () => ({ value: {
            nodes: [
                { id: 'submission_source', nodeKey: 'trigger:form-submission', config: {} },
                {
                    id: 'confirmation_step',
                    nodeKey: 'action:email',
                    config: {
                        emailProvider: 'system-default',
                        to: '{{submission_source.fields.candidate_contact}}',
                        subject: 'Thanks for applying',
                        body: 'We received your application.'
                    }
                }
            ],
            edges: [{ id: 'connect', source: 'submission_source', target: 'confirmation_step', sourceHandle: 'triggerData', targetHandle: 'triggerData' }]
        }, tokenUsage: { totalTokens: 1 } }),
        instructionReader: async () => 'Return JSON only'
    });

    assert.equal(result.readiness.ready, true);
    assert.equal(result.nodes.find(node => node.subType === 'form-submission').config.formId, 'form_approved');
});

test('workflow assembly repairs a literal confirmation recipient when the binding is unambiguous', async () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: '', schema: { inputs: [], outputs: [{ name: 'triggerData', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Send email', description: '', schema: { inputs: [{ name: 'triggerData', isConnection: true }, { name: 'to', type: 'text', required: true }], outputs: [], }, ui: {} }
    ];
    const registry = { getDefinition: () => ({ implementationStatus: 'experimental', configSchema: {} }) };

    const result = await assembleWorkflow({
            message: 'Send a thank-you email to the form respondent.',
            specs,
            formId: 'form_approved',
            formSchema: { fields: [{ id: 'contact', type: 'email', required: true }] },
            requiredCapabilities: ['respondent_confirmation'],
            registry,
            provider: async () => ({ value: {
                nodes: [
                    { id: 'source', nodeKey: 'trigger:form-submission', config: {} },
                    { id: 'mailer', nodeKey: 'action:email', config: { to: 'owner@example.com' } }
                ],
                edges: [{ source: 'source', target: 'mailer' }]
            }, tokenUsage: {} }),
            instructionReader: async () => 'Return JSON only'
        });

    assert.equal(result.nodes.find(node => node.subType === 'email').config.to, '{{source.fields.contact}}');
    assert.equal(result.repairs[0].code, 'RESPONDENT_RECIPIENT_BOUND');
});

test('respondent email resolution prefers the primary email over a confirmation field', () => {
    const result = resolveRespondentEmailField({ formSchema: {
        fields: [
            { id: 'f_email', type: 'email', label: 'Email', required: true },
            { id: 'f_confirm_email', type: 'email', label: 'Confirmation Email Address', required: true }
        ]
    } });

    assert.equal(result.field.id, 'f_email');
    assert.equal(result.ambiguous, false);
});

test('respondent email resolution reports genuinely tied email fields as ambiguous', () => {
    const result = resolveRespondentEmailField({ formSchema: {
        fields: [
            { id: 'work_email', type: 'email', label: 'Work Email', required: true },
            { id: 'personal_email', type: 'email', label: 'Personal Email', required: true }
        ]
    } });

    assert.equal(result.field, null);
    assert.equal(result.ambiguous, true);
});

test('respondent email resolution honors an explicit field selection', () => {
    const result = resolveRespondentEmailField({
        preferredFieldId: 'personal_email',
        formSchema: {
            fields: [
                { id: 'work_email', type: 'email', label: 'Work Email', required: true },
                { id: 'personal_email', type: 'email', label: 'Personal Email', required: true }
            ]
        }
    });

    assert.equal(result.field.id, 'personal_email');
    assert.equal(result.reason, 'explicit');
});

test('ambiguous respondent recipients expose candidate fields for clarification', () => {
    const issues = validateGeneratedWorkflowCapabilities({
        requiredCapabilities: ['respondent_confirmation'],
        formSchema: { fields: [
            { id: 'work_email', type: 'email', label: 'Work Email', required: true },
            { id: 'personal_email', type: 'email', label: 'Personal Email', required: true }
        ] },
        nodes: [
            { id: 'source', type: 'trigger', subType: 'form-submission' },
            { id: 'mailer', type: 'action', subType: 'email', config: { to: 'owner@example.com' } }
        ],
        edges: [{ source: 'source', target: 'mailer' }]
    });

    assert.equal(issues[0].code, 'RESPONDENT_RECIPIENT_FIELD_AMBIGUOUS');
    assert.deepEqual(issues[0].candidates.map(candidate => candidate.id), ['work_email', 'personal_email']);
});

test('workflow assembly repairs a literal recipient with a primary and confirmation email field', async () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: '', schema: { inputs: [], outputs: [{ name: 'triggerData', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Send email', description: '', schema: { inputs: [{ name: 'triggerData', isConnection: true }, { name: 'to', type: 'text', required: true }], outputs: [] }, ui: {} }
    ];
    const registry = { getDefinition: () => ({ implementationStatus: 'experimental', configSchema: {} }) };

    const result = await assembleWorkflow({
        message: 'Create a job application form and send a confirmation email after submission.',
        specs,
        formSchema: { fields: [
            { id: 'f_email', type: 'email', label: 'Email', required: true },
            { id: 'f_confirm_email', type: 'email', label: 'Confirmation Email Address', required: true }
        ] },
        requiredCapabilities: ['respondent_confirmation'],
        registry,
        provider: async () => ({ value: {
            nodes: [
                { id: 'source', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'mailer', nodeKey: 'action:email', config: { to: 'owner@example.com' } }
            ],
            edges: [{ source: 'source', target: 'mailer' }]
        }, tokenUsage: {} }),
        instructionReader: async () => 'Return JSON only'
    });

    assert.equal(result.nodes.find(node => node.subType === 'email').config.to, '{{source.fields.f_email}}');
    assert.equal(result.repairs[0].fieldId, 'f_email');
});

test('workflow assembly repairs an unambiguous respondent field reference without changing topology', async () => {
    const triggerSchema = {
        inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', required: true }],
        outputs: [{ name: 'triggerData', isConnection: true }, { name: 'fields', isConnection: true }]
    };
    const emailSchema = {
        inputs: [
            { name: 'triggerData', isConnection: true },
            { name: 'emailProvider', type: 'resource-select', resource: 'email-providers' },
            { name: 'to', type: 'text', required: true },
            { name: 'subject', type: 'text', required: true },
            { name: 'body', type: 'textarea', required: true }
        ],
        outputs: [{ name: 'outputData', isConnection: true }]
    };
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: 'Start from a form', schema: triggerSchema, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Send confirmation', description: 'Send a message', schema: emailSchema, ui: {} }
    ];
    const registry = {
        getDefinition: (type, subType) => ({ implementationStatus: 'experimental', configSchema: type === 'trigger' ? triggerSchema : emailSchema }),
        getDefinitionByNodeKey: () => null
    };

    const result = await assembleWorkflow({
        message: 'Create a job application form and send a confirmation email after submission.',
        specs,
        workflowName: 'Application confirmation',
        formSchema: { fields: [{ id: 'f_email_1', type: 'email', required: true, label: 'Email' }] },
        requiredCapabilities: ['respondent_confirmation'],
        resourceContext: { 'email-providers': { options: [{ value: 'system-default', label: 'Promptly email' }] } },
        registry,
        provider: async () => ({ value: {
            nodes: [
                { id: 'submission', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'mailer', nodeKey: 'action:email', config: {
                    emailProvider: 'system-default',
                    to: '{{submission.fields.email}}',
                    subject: 'Thanks',
                    body: 'Received.'
                } }
            ],
            edges: [{ source: 'submission', target: 'mailer', sourceHandle: 'triggerData', targetHandle: 'triggerData' }]
        }, tokenUsage: { totalTokens: 1 } }),
        instructionReader: async () => 'Return JSON only'
    });

    assert.equal(result.nodes.find(node => node.subType === 'email').config.to, '{{submission.fields.f_email_1}}');
    assert.deepEqual(result.repairs, [{
        code: 'RESPONDENT_RECIPIENT_BOUND',
        nodeId: 'mailer',
        fieldId: 'f_email_1'
    }]);
});

test('confirmation validation accepts an intermediate node and a separate non-respondent email', () => {
    const issues = validateGeneratedWorkflowCapabilities({
        requiredCapabilities: ['respondent_confirmation'],
        formSchema: { fields: [{ id: 'contact', type: 'email', required: true }] },
        nodes: [
            { id: 'source', type: 'trigger', subType: 'form-submission' },
            { id: 'approval', type: 'logic', subType: 'approval' },
            { id: 'respondent_mailer', type: 'action', subType: 'email', config: { to: '{{source.fields.contact}}' } },
            { id: 'owner_mailer', type: 'action', subType: 'email', config: { to: 'owner@example.com' } }
        ],
        edges: [
            { source: 'source', target: 'approval' },
            { source: 'approval', target: 'respondent_mailer' },
            { source: 'source', target: 'owner_mailer' }
        ]
    });

    assert.deepEqual(issues, []);
});

test('resource context loads dependent records for every selectable resource variant', async () => {
    const calls = [];
    const resourceService = {
        list: async ({ resource, params }) => {
            calls.push({ resource, params });
            return { resource, options: [{ value: `${params.resource}_1`, label: `${params.resource} record` }] };
        }
    };
    const specs = [{
        nodeKey: 'action:database',
        type: 'action',
        subType: 'database',
        schema: {
            inputs: [
                { name: 'resource', type: 'select', options: ['forms', 'workflows', 'executionLogs'] },
                { name: 'recordId', type: 'resource-select', resource: 'promptly-records', resourceParams: { resource: '$resource' } }
            ]
        }
    }];
    const context = await loadWorkflowResourceContext({ userId: 'user_1', specs, resourceService });
    assert.deepEqual(calls.map(call => call.params.resource), ['forms', 'workflows', 'executionLogs']);
    assert.deepEqual(Object.keys(context['promptly-records'].variants).sort(), ['{"resource":"executionLogs"}', '{"resource":"forms"}', '{"resource":"workflows"}']);

    const issues = validateGeneratedResourceValues({
        specs,
        nodes: [{ nodeKey: 'action:database', type: 'action', subType: 'database', config: { resource: 'workflows', recordId: 'forms_1' } }],
        resourceContext: context
    });
    assert.equal(issues[0].code, 'WORKFLOW_RESOURCE_NOT_FOUND');
});

test('classifier resolves a natural-language request to canonical node contracts', async () => {
    const registry = {
        getCompactCatalogue: () => [
            { nodeKey: 'trigger:form-submission', subType: 'form-submission', type: 'trigger', title: 'Form submitted', description: 'Starts when a form is submitted', implementationStatus: 'experimental', inputs: [], outputs: [] },
            { nodeKey: 'action:google-sheets', subType: 'google-sheets', type: 'action', title: 'Google Sheets', description: 'Read or write a spreadsheet', implementationStatus: 'experimental', inputs: [{ name: 'spreadsheetId', type: 'resource-select', resource: 'google-spreadsheets' }], outputs: [] }
        ],
        getDefinitionByNodeKey: nodeKey => ({ metadata: { subType: nodeKey.split(':')[1] } })
    };
    const result = await classifyRequest({
        message: 'When someone submits the form, add the response to Google Sheets.',
        snapshot: null,
        registry,
        instructionReader: async name => `Return JSON only for ${name}`,
        provider: async (prompt, instruction, operation) => {
            assert.match(prompt, /google-sheets/);
            assert.match(prompt, /resource-select/);
            assert.equal(operation, 'classifier');
            return { value: {
                action: 'create_workflow',
                selectedNodeKeys: ['trigger:form-submission', 'action:google-sheets'],
                workflowName: 'Form to Sheets',
                needsForm: true,
                affectedNodeIds: [],
                intent: 'unknown'
            }, tokenUsage: { totalTokens: 8 } };
        }
    });
    assert.deepEqual(result.selectedNodeKeys, ['trigger:form-submission', 'action:google-sheets']);
    assert.equal(result.needsForm, true);
    assert.equal(result.workflowName, 'Form to Sheets');
});

test('classifier restores required confirmation nodes when the model omits node selection', async () => {
    const registry = {
        getCompactCatalogue: () => [
            { nodeKey: 'trigger:form-submission', subType: 'form-submission', type: 'trigger', title: 'Form submitted', description: 'Starts when a form is submitted', implementationStatus: 'experimental', inputs: [], outputs: [] },
            { nodeKey: 'action:email', subType: 'email', type: 'action', title: 'Send email', description: 'Sends an email', implementationStatus: 'experimental', inputs: [], outputs: [] }
        ],
        getDefinitionByNodeKey: nodeKey => ({ metadata: { subType: nodeKey.split(':')[1] } })
    };
    const result = await classifyRequest({
        message: 'Create a job application form and send a confirmation email after submission.',
        snapshot: null,
        requiredCapabilities: ['respondent_confirmation'],
        registry,
        instructionReader: async () => 'Return JSON only',
        provider: async () => ({ value: {
            action: 'create_workflow',
            selectedNodeKeys: [],
            workflowName: 'Application Confirmation',
            needsForm: true,
            affectedNodeIds: [],
            intent: 'unknown'
        }, tokenUsage: {} })
    });

    assert.deepEqual(result.selectedNodeKeys, ['trigger:form-submission', 'action:email']);
});

test('workflow classifier normalizes legacy form actions without exposing them downstream', async () => {
    const registry = {
        getCompactCatalogue: () => [
            { nodeKey: 'trigger:form-submission', subType: 'form-submission', type: 'trigger', title: 'Form submitted', description: 'Starts when a form is submitted', implementationStatus: 'experimental', inputs: [], outputs: [] }
        ],
        getDefinitionByNodeKey: nodeKey => ({ metadata: { subType: nodeKey.split(':')[1] } })
    };
    const result = await classifyRequest({
        message: 'Create a workflow that starts from a form.',
        snapshot: null,
        registry,
        instructionReader: async () => 'Return JSON only',
        provider: async () => ({ value: {
            action: 'create_form',
            selectedNodeKeys: ['trigger:form-submission'],
            workflowName: 'Form Intake',
            needsForm: true,
            affectedNodeIds: [],
            intent: 'unknown'
        }, tokenUsage: {} })
    });

    assert.equal(result.action, 'create_workflow');
    assert.equal(result.workflowName, 'Form Intake');
});

test('assembler returns a setup-needed proposal when required account input is missing', async () => {
    const specs = [{
        nodeKey: 'trigger:form-submission',
        type: 'trigger',
        subType: 'form-submission',
        title: 'Form submitted',
        description: 'Starts when a form is submitted',
        schema: {
            inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', label: 'Form', required: true }],
            outputs: [{ name: 'triggerData', isConnection: true }]
        },
        ui: {}
    }];
    const registry = { getDefinition: () => ({ implementationStatus: 'experimental', configSchema: specs[0].schema }) };
    const result = await assembleWorkflow({
        message: 'Start when a form is submitted.',
        specs,
        workflowName: 'Form intake',
        resourceContext: { forms: { options: [], emptyMessage: 'Create a form first.' } },
        registry,
        provider: async () => ({ value: { nodes: [{ id: 'trigger_1', nodeKey: 'trigger:form-submission', config: {} }], edges: [] }, tokenUsage: {} }),
        instructionReader: async () => 'Return JSON only'
    });
    assert.equal(result.readiness.ready, false);
    assert.equal(result.readiness.issues[0].code, 'MISSING_NODE_CONFIG');
    assert.match(result.readiness.issues[0].message, /Form is required/);
});

test('assembler produces a runnable graph from the supplied node contracts', async () => {
    const triggerSchema = {
        inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', required: true }],
        outputs: [{ name: 'triggerData', isConnection: true }]
    };
    const actionSchema = {
        inputs: [{ name: 'triggerData', isConnection: true }],
        outputs: [{ name: 'outputData', isConnection: true }]
    };
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: 'Start from a form', schema: triggerSchema, ui: {} },
        { nodeKey: 'action:logger', type: 'action', subType: 'logger', title: 'Log a message', description: 'Write a log entry', schema: actionSchema, ui: {} }
    ];
    const registry = {
        getDefinition: (type, subType) => ({ implementationStatus: 'experimental', configSchema: type === 'trigger' ? triggerSchema : actionSchema })
    };
    const result = await (await import('./workflowAgentService.js')).assembleWorkflow({
        message: 'When the form is submitted, log the response.',
        specs,
        workflowName: 'Log Form Response',
        formId: 'form_real',
        resourceContext: { forms: { options: [{ value: 'form_real', label: 'Registration' }] } },
        registry,
        provider: async () => ({ value: {
            nodes: [
                { id: 'trigger_1', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'logger_1', nodeKey: 'action:logger', config: {} }
            ],
            edges: [{ id: 'edge_1', source: 'trigger_1', target: 'logger_1' }]
        }, tokenUsage: { totalTokens: 12 } }),
        instructionReader: async () => 'Return JSON only'
    });
    assert.deepEqual(result.nodes.map(node => node.nodeKey), ['trigger:form-submission', 'action:logger']);
    assert.deepEqual(result.nodes.map(node => node.position), [{ x: 100, y: 150 }, { x: 450, y: 150 }]);
    assert.equal(result.readiness.ready, true);
});

test('assembler preserves an unsaved form as a resolvable resource binding', async () => {
    const triggerSchema = {
        inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms', required: true }],
        outputs: [{ name: 'triggerData', isConnection: true }]
    };
    const specs = [{ nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: 'Start from a form', schema: triggerSchema, ui: {} }];
    const result = await assembleWorkflow({
        message: 'Start from the proposed form.',
        specs,
        workflowName: 'Proposed Form Workflow',
        formSchema: { fields: [{ id: 'email', type: 'email', required: true }] },
        formBinding: { source: { artifactKey: 'form_proposal', appliedResource: 'id' } },
        resourceContext: { forms: { options: [] } },
        registry: { getDefinition: () => ({ implementationStatus: 'experimental', configSchema: triggerSchema }) },
        provider: async () => ({ value: { nodes: [{ id: 'trigger_1', nodeKey: 'trigger:form-submission', config: {} }], edges: [] }, tokenUsage: {} }),
        instructionReader: async () => 'Return JSON only'
    });
    assert.equal(result.nodes[0].config.formId, undefined);
    assert.deepEqual(result.resourceBindings, [{
        target: { nodeId: 'trigger_1', path: 'config.formId' },
        source: { artifactKey: 'form_proposal', appliedResource: 'id' }
    }]);
});

test('real node catalogue can assemble a form-to-sheets workflow from user intent', async () => {
    await NodeRegistry.init({ nodesDir: path.resolve(process.cwd(), 'packages/nodes') });
    const classification = await classifyRequest({
        message: 'When someone submits the registration form, append the response to Google Sheets.',
        snapshot: null,
        registry: NodeRegistry,
        instructionReader: async () => 'Return JSON only',
        provider: async () => ({ value: {
            action: 'create_workflow',
            selectedNodeKeys: ['trigger:form-submission', 'action:googleSheets'],
            workflowName: 'Registration to Sheets',
            needsForm: true,
            affectedNodeIds: [],
            intent: 'unknown'
        }, tokenUsage: {} })
    });
    const specs = NodeRegistry.getSchemasFor(classification.selectedNodeKeys);
    const formSpec = specs.find(spec => spec.nodeKey === 'trigger:form-submission');
    const sheetsSpec = specs.find(spec => spec.nodeKey === 'action:googleSheets');
    const sourceHandle = formSpec.schema.outputs.find(item => item.isConnection).name;
    const targetHandle = sheetsSpec.schema.inputs.find(item => item.isConnection).name;
    const result = await assembleWorkflow({
        message: 'When someone submits the registration form, append the response to Google Sheets.',
        specs,
        workflowName: classification.workflowName,
        formId: 'form_registration',
        resourceContext: {
            forms: { options: [{ value: 'form_registration', label: 'Registration form' }] },
            'google-spreadsheets': { options: [{ value: 'sheet_registration', label: 'Registration sheet' }] },
            'google-sheet-ranges': { options: [{ value: "'Responses'!A1:Z1000", label: 'Responses' }] }
        },
        registry: NodeRegistry,
        provider: async () => ({ value: {
            nodes: [
                { id: 'trigger_1', nodeKey: 'trigger:form-submission', config: {} },
                {
                    id: 'sheets_1',
                    nodeKey: 'action:googleSheets',
                    config: {
                        spreadsheetId: 'sheet_registration',
                        range: "'Responses'!A1:Z1000",
                        operation: 'append',
                        values: [['{{trigger_1.response}}']]
                    }
                }
            ],
            edges: [{ id: 'edge_1', source: 'trigger_1', target: 'sheets_1', sourceHandle, targetHandle }]
        }, tokenUsage: { totalTokens: 24 } }),
        instructionReader: async () => 'Return JSON only'
    });
    assert.deepEqual(result.nodes.map(node => node.nodeKey), ['trigger:form-submission', 'action:googleSheets']);
    assert.equal(result.nodes[0].config.formId, 'form_registration');
    assert.equal(result.nodes[1].config.operation, 'append');
    assert.equal(result.readiness.ready, true);
});
