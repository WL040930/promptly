import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkflowPatches, assembleWorkflow, classifyRequest, layoutWorkflowNodes, loadWorkflowResourceContext, readWorkflowInstruction, requiredCapabilitiesForRequest, validateGeneratedResourceValues, validateGeneratedWorkflowCapabilities } from './workflowAgentService.js';
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

test('workflow patches resolve colliding subtypes by canonical node key', () => {
    const result = applyWorkflowPatches({
        specs: [spec('action:email', 'action', 'email'), spec('trigger:email', 'trigger', 'email')],
        patches: [{ op: 'add_node', nodeKey: 'trigger:email', id: 'new_trigger' }]
    });

    assert.equal(result.nodes[0].type, 'trigger');
    assert.equal(result.nodes[0].subType, 'email');
    assert.equal(result.nodes[0].nodeKey, 'trigger:email');
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

test('workflow patches require canonical node keys and validate connection handles', () => {
    const currentNodes = [
        {
            id: 'trigger_1',
            type: 'trigger',
            subType: 'webhook',
            schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] },
            position: { x: 100, y: 150 }
        }
    ];
    const specs = [spec('action:email', 'action', 'email')];

    assert.throws(
        () => applyWorkflowPatches({ currentNodes, specs, patches: [{ op: 'add_node', subType: 'email', id: 'new_email' }] }),
        error => error.code === 'WORKFLOW_PATCH_INVALID'
    );

    assert.throws(
        () => applyWorkflowPatches({
            currentNodes,
            specs,
            patches: [
                { op: 'add_node', nodeKey: 'action:email', id: 'new_email' },
                { op: 'add_edge', source: 'trigger_1', target: 'new_email', sourceHandle: 'missing' }
            ]
        }),
        error => error.code === 'WORKFLOW_PATCH_INVALID'
    );
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

test('workflow assembly rejects a confirmation that does not use submitted contact data', async () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', title: 'Form submitted', description: '', schema: { inputs: [], outputs: [{ name: 'triggerData', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Send email', description: '', schema: { inputs: [{ name: 'triggerData', isConnection: true }, { name: 'to', type: 'text', required: true }], outputs: [], }, ui: {} }
    ];
    const registry = { getDefinition: () => ({ implementationStatus: 'experimental', configSchema: {} }) };

    await assert.rejects(
        () => assembleWorkflow({
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
        }),
        error => error.code === 'WORKFLOW_CAPABILITY_INVALID'
    );
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
