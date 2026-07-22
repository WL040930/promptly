import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkflowPatches, assembleWorkflow, classifyRequest, layoutWorkflowNodes, loadWorkflowResourceContext, readWorkflowInstruction, validateGeneratedResourceValues } from './workflowAgentService.js';
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
