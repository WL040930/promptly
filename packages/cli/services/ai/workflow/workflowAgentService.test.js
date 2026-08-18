import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeneratedResourceValues } from './workflowAgentService.js';
import { compileWorkflowEdits } from './domain/editCompiler/index.js';
import { compileWorkflowBindings, validateWorkflowExpressions } from '../../../../shared/workflowExpressions.js';

const registryFor = specs => ({
    getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    }
});

test('remove_node repairs downstream references and safely bypasses a deleted middle step', () => {
    const specs = [
        {
            nodeKey: 'trigger:webhook',
            type: 'trigger',
            subType: 'webhook',
            schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }
        },
        {
            nodeKey: 'ai:task',
            type: 'ai',
            subType: 'aiTask',
            schema: {
                inputs: [{ name: 'inputData', isConnection: true }],
                outputs: [{ name: 'outputData', isConnection: true }, { name: 'response' }]
            }
        },
        {
            nodeKey: 'action:email',
            type: 'action',
            subType: 'email',
            schema: {
                inputs: [
                    { name: 'event', isConnection: true },
                    { name: 'body', type: 'textarea', valueSyntax: 'workflow-expression', defaultValue: '' }
                ],
                outputs: []
            }
        }
    ];
    const workflow = {
        nodes: [
            { id: 'trigger', nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', title: 'Webhook', config: {} },
            { id: 'summary', nodeKey: 'ai:task', type: 'ai', subType: 'aiTask', title: 'Summarize', config: {} },
            {
                id: 'email', nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Email',
                config: { body: { $expr: 'reference', v: 1, nodeId: 'summary', path: ['response'] } }
            }
        ],
        edges: [
            { id: 'in', source: 'trigger', sourceHandle: 'event', target: 'summary', targetHandle: 'inputData' },
            { id: 'out', source: 'summary', sourceHandle: 'outputData', target: 'email', targetHandle: 'event' }
        ]
    };

    const result = compileWorkflowEdits({
        currentWorkflow: workflow,
        operations: [{ op: 'remove_node', nodeRef: 'n2' }],
        specs,
        registry: registryFor(specs)
    });

    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes.find(node => node.id === 'email').config.body, '');
    assert.deepEqual(result.edges.map(edge => [edge.source, edge.target]), [['trigger', 'email']]);
    assert.equal(result.deletionEffects[0].clearedReferences.length, 1);
    assert.equal(result.deletionEffects[0].bypassedEdges.length, 1);
});

test('insert_after_route replaces the real route without model-authored destination edges', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', title: 'Webhook', description: '', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Email', description: '', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'done', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:googleSheets', type: 'action', subType: 'googleSheets', title: 'Google Sheets', description: '', schema: { inputs: [{ name: 'event', isConnection: true }, { name: 'operation', type: 'text' }, { name: 'spreadsheetId', type: 'resource-select' }, { name: 'range', type: 'resource-select' }, { name: 'values', type: 'text' }], outputs: [{ name: 'done', isConnection: true }] }, ui: {} }
    ];
    const registry = {
        getDefinition: (type, subType) => {
            const spec = specs.find(item => item.type === type && item.subType === subType);
            return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
        }
    };
    const workflow = {
        nodes: [
            { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Webhook', config: {}, position: { x: 100, y: 150 } },
            { id: 'email', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Thank you', config: {}, position: { x: 450, y: 150 } }
        ],
        edges: [{ id: 'edge_1', source: 'trigger', sourceHandle: 'event', target: 'email', targetHandle: 'event' }]
    };
    const result = compileWorkflowEdits({
        currentWorkflow: workflow,
        specs,
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
                    values: [['submission']]
                }
            }
        }],
        registry
    });

    const inserted = result.nodes.find(node => node.title === 'Save response');
    assert.ok(inserted);
    assert.deepEqual(result.nodes.find(node => node.id === 'trigger').position, { x: 100, y: 150 });
    assert.deepEqual(result.nodes.find(node => node.id === 'email').position, { x: 450, y: 150 });
    assert.notDeepEqual(inserted.position, { x: 450, y: 150 });
    assert.equal(result.edges.some(edge => edge.source === 'trigger' && edge.target === 'email'), false);
    assert.equal(result.edges.some(edge => edge.source === 'trigger' && edge.target === inserted.id), true);
    assert.equal(result.edges.some(edge => edge.source === inserted.id && edge.target === 'email'), true);
});

test('new workflows use deterministic graph layout and AI updates cannot move existing nodes', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', title: 'Webhook', description: '', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }, ui: {} },
        { nodeKey: 'action:email', type: 'action', subType: 'email', title: 'Email', description: '', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] }, ui: {} }
    ];
    const registry = { getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    } };
    const created = compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] },
        specs,
        registry,
        operations: [
            { op: 'create_node', node: { ref: 'trigger', nodeKey: 'trigger:webhook' } },
            { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email', afterNodeRef: 'trigger' } },
            { op: 'connect', from: { nodeRef: 'trigger', handle: 'event' }, to: { nodeRef: 'email', handle: 'event' } }
        ]
    });
    assert.deepEqual(created.nodes.map(node => node.position), [{ x: 50, y: 200 }, { x: 400, y: 200 }]);

    const updated = compileWorkflowEdits({
        currentWorkflow: { nodes: [{ ...created.nodes[0], position: { x: 712, y: 384 }, layoutPinned: true }, created.nodes[1]], edges: created.edges },
        specs,
        registry,
        operations: [{ op: 'update_node', nodeRef: 'n1', updates: { title: 'Renamed', position: { x: 0, y: 0 } } }]
    });
    assert.equal(updated.nodes[0].title, 'Renamed');
    assert.deepEqual(updated.nodes[0].position, { x: 712, y: 384 });
});

test('normalizes a generic payload handle to a node with one input handle', () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [] } }
    ];
    const registry = { getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    } };
    const result = compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] }, specs, registry,
        operations: [
            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission' } },
            { op: 'create_node', node: { ref: 'email', nodeKey: 'action:email' } },
            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'email', handle: 'triggerData' } }
        ]
    });
    assert.equal(result.edges[0].targetHandle, 'inputData');
});

test('normalizes generic output aliases to the production connection handles', () => {
    const specs = [
        {
            nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission',
            schema: { inputs: [], outputs: [{ name: 'triggerData', isConnection: true }] }
        },
        {
            nodeKey: 'action:googleSheets', type: 'action', subType: 'googleSheets',
            schema: { inputs: [{ name: 'triggerData', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] }
        },
        {
            nodeKey: 'action:email', type: 'action', subType: 'email',
            schema: { inputs: [{ name: 'triggerData', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] }
        },
        {
            nodeKey: 'logic:condition', type: 'logic', subType: 'condition',
            schema: {
                inputs: [{ name: 'input1', isConnection: true }, { name: 'valueA', type: 'number' }, { name: 'operator', type: 'select' }, { name: 'valueB', type: 'number' }],
                outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }]
            }
        }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'sheet', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', config: {} }
            ],
            edges: [{ id: 'form_to_sheet', source: 'form', sourceHandle: 'triggerData', target: 'sheet', targetHandle: 'triggerData' }]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2', handle: 'done' },
            condition: { ref: 'low_rating', config: { valueA: 3, operator: 'less_than_or_equal', valueB: 3 } },
            whenTrue: { ref: 'notify_support', nodeKey: 'action:email', config: {} },
            whenFalse: null
        }]
    });

    const condition = result.nodes.find(node => node.nodeKey === 'logic:condition');
    const notification = result.nodes.find(node => node.nodeKey === 'action:email');
    assert.ok(result.edges.some(edge => edge.source === 'sheet' && edge.sourceHandle === 'outputData' && edge.target === condition.id));
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'true' && edge.target === notification.id && edge.targetHandle === 'triggerData'));
});

test('a provisioned Google Sheet always uses its declared tab range in the proposal', () => {
    const specs = [{
        nodeKey: 'action:googleSheets',
        type: 'action',
        subType: 'googleSheets',
        schema: {
            inputs: [
                { name: 'spreadsheetId', type: 'resource-select', resource: 'google-spreadsheets' },
                { name: 'range', type: 'resource-select', resource: 'google-sheet-ranges', resourceParams: { spreadsheetId: '$spreadsheetId' } }
            ]
        }
    }];
    const result = normalizeGeneratedResourceValues({
        nodes: [{
            id: 'sheet', nodeKey: 'action:googleSheets', type: 'action', subType: 'googleSheets',
            config: { spreadsheetId: { $provision: 'registrations' }, range: "'Sheet1'!A1" }
        }],
        specs,
        resourceChanges: [{
            type: 'create_google_spreadsheet', ref: 'registrations',
            title: 'Approved Event Registrations', sheetTitle: 'Responses'
        }]
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.nodes[0].config.range, "'Responses'!A1");
    assert.ok(result.repairs.some(repair => repair.code === 'WORKFLOW_PROVISIONED_SHEET_RANGE_RESOLVED'));
});

test('compiler exposes safe invalid node keys and refs for a worker repair', () => {
    const specs = [{
        nodeKey: 'trigger:webhook',
        type: 'trigger',
        subType: 'webhook',
        schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] }
    }];
    const registry = {
        getDefinition: (type, subType) => {
            const spec = specs.find(item => item.type === type && item.subType === subType);
            return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
        }
    };

    assert.throws(() => compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] },
        specs,
        registry,
        operations: [{ op: 'create_node', node: { ref: 'trigger', nodeKey: 'trigger:webhooks' } }]
    }), error => {
        const issue = error.issues?.[0];
        return issue?.code === 'WORKFLOW_NODE_KEY_INVALID'
            && issue.value === 'trigger:webhooks'
            && issue.allowed?.includes('trigger:webhook');
    });

    assert.throws(() => compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] },
        specs,
        registry,
        operations: [{ op: 'connect', from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n2', handle: null } }]
    }), error => {
        const issue = error.issues?.[0];
        return issue?.code === 'WORKFLOW_NODE_REF_INVALID'
            && issue.value === 'n1'
            && Array.isArray(issue.allowed)
            && issue.allowed.length === 0;
    });
});

test('add_condition_branch owns Condition ports and preserves an approved Sheet route', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }] } },
        { nodeKey: 'action:googleSheets', type: 'action', subType: 'googleSheets', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'done', isConnection: true }] } },
        {
            nodeKey: 'logic:condition', type: 'logic', subType: 'condition', schema: {
                inputs: [{ name: 'input1', isConnection: true }, { name: 'input2', isConnection: true }, { name: 'valueA', type: 'text' }, { name: 'operator', type: 'select' }, { name: 'valueB', type: 'text' }],
                outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }]
            }
        },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }, { name: 'to', type: 'text' }, { name: 'subject', type: 'text' }], outputs: [{ name: 'done', isConnection: true }] } }
    ];
    const registry = { getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    } };
    const workflow = {
        nodes: [
            { id: 'form', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', title: 'Form submitted', config: {}, position: { x: 50, y: 200 } },
            { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Manager approval', config: {}, position: { x: 400, y: 200 } },
            { id: 'sheet', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets', title: 'Save response', config: {}, position: { x: 750, y: 200 } }
        ],
        edges: [
            { id: 'form_to_approval', source: 'form', sourceHandle: 'event', target: 'approval', targetHandle: 'inputData' },
            { id: 'approval_to_sheet', source: 'approval', sourceHandle: 'approved', target: 'sheet', targetHandle: 'event' }
        ]
    };

    const result = compileWorkflowEdits({
        currentWorkflow: workflow,
        specs,
        registry,
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2', handle: 'approved' },
            condition: {
                ref: 'attendance_is_online',
                title: 'Attendance is Online',
                config: { valueA: 'Online', operator: 'equals', valueB: 'Online' }
            },
            whenTrue: { ref: 'send_online', nodeKey: 'action:email', title: 'Send joining instructions', config: { to: 'online@example.com', subject: 'Joining instructions' } },
            whenFalse: { ref: 'send_venue', nodeKey: 'action:email', title: 'Send venue instructions', config: { to: 'venue@example.com', subject: 'Venue instructions' } }
        }]
    });

    const condition = result.nodes.find(node => node.nodeKey === 'logic:condition');
    const onlineEmail = result.nodes.find(node => node.title === 'Send joining instructions');
    const venueEmail = result.nodes.find(node => node.title === 'Send venue instructions');
    assert.ok(condition);
    assert.ok(onlineEmail);
    assert.ok(venueEmail);
    assert.ok(result.edges.some(edge => edge.id === 'approval_to_sheet'));
    assert.ok(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'approved' && edge.target === condition.id && edge.targetHandle === 'input1'));
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'true' && edge.target === onlineEmail.id && edge.targetHandle === 'event'));
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'false' && edge.target === venueEmail.id && edge.targetHandle === 'event'));
});

test('add_condition_branch can end the false route without creating a placeholder node', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        {
            nodeKey: 'logic:condition', type: 'logic', subType: 'condition', schema: {
                inputs: [{ name: 'input1', isConnection: true }, { name: 'valueA', type: 'text' }, { name: 'operator', type: 'select' }, { name: 'valueB', type: 'text' }],
                outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }]
            }
        },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [{ id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} }],
            edges: []
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n1', handle: 'event' },
            condition: { ref: 'low_rating', config: { valueA: { $binding: 'form_field_rating' }, operator: 'less_than_or_equal', valueB: 3 } },
            whenTrue: { ref: 'notify_support', nodeKey: 'action:email', config: { to: 'support@example.com' } },
            whenFalse: null
        }]
    });

    const condition = result.nodes.find(node => node.nodeKey === 'logic:condition');
    const supportEmail = result.nodes.find(node => node.nodeKey === 'action:email');
    assert.ok(condition);
    assert.ok(supportEmail);
    assert.equal(result.nodes.length, 3);
    assert.ok(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'true' && edge.target === supportEmail.id));
    assert.equal(result.edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'false'), false);
});

test('low-rating branches can carry an AI summary into the support email body', () => {
    const specs = [
        {
            nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission',
            schema: {
                inputs: [{ name: 'formId', type: 'resource-select', resource: 'forms' }],
                outputs: [
                    { name: 'triggerData', isConnection: true },
                    { name: 'fields', type: 'object' },
                    { name: 'responseId', type: 'string' }
                ]
            }
        },
        {
            nodeKey: 'logic:condition', type: 'logic', subType: 'condition',
            schema: {
                inputs: [
                    { name: 'input1', isConnection: true },
                    { name: 'valueA', type: 'text', valueSyntax: 'workflow-expression' },
                    { name: 'operator', type: 'select' },
                    { name: 'valueB', type: 'text', valueSyntax: 'workflow-expression' }
                ],
                outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }]
            }
        },
        {
            nodeKey: 'ai:aiTask', type: 'ai', subType: 'aiTask',
            schema: {
                inputs: [
                    { name: 'inputData', isConnection: true },
                    { name: 'taskType', type: 'select' },
                    { name: 'prompt', type: 'textarea', valueSyntax: 'node-template' }
                ],
                outputs: [
                    { name: 'outputData', isConnection: true },
                    { name: 'response', type: 'string' }
                ]
            }
        },
        {
            nodeKey: 'action:email', type: 'action', subType: 'email',
            schema: {
                inputs: [
                    { name: 'triggerData', isConnection: true },
                    { name: 'to', type: 'text', valueSyntax: 'workflow-expression' },
                    { name: 'subject', type: 'text', valueSyntax: 'workflow-expression' },
                    { name: 'body', type: 'textarea', valueSyntax: 'workflow-expression' }
                ],
                outputs: [{ name: 'outputData', isConnection: true }]
            }
        }
    ];
    const formSchema = {
        id: 'feedback_form',
        fields: [
            { id: 'email', label: 'Email', type: 'email', required: true },
            { id: 'rating', label: 'Overall Rating', type: 'number', required: true },
            { id: 'comment', label: 'What did you think?', type: 'textarea' }
        ]
    };
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [{
                id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission',
                title: 'Feedback submitted', config: { formId: 'feedback_form' }, position: { x: 50, y: 200 }
            }],
            edges: []
        },
        specs,
        registry: registryFor(specs),
        deferConfigValidation: true,
        operations: [
            {
                op: 'add_condition_branch',
                from: { nodeRef: 'n1', handle: 'triggerData' },
                condition: {
                    ref: 'low_rating',
                    config: { valueA: { $binding: 'form_field_2' }, operator: 'less_than_or_equal', valueB: 3 }
                },
                whenTrue: {
                    ref: 'summarize_feedback',
                    nodeKey: 'ai:aiTask',
                    title: 'Summarize feedback',
                    config: { taskType: 'summarize', prompt: 'Summarize the respondent\'s feedback.' }
                },
                whenFalse: null
            },
            {
                op: 'create_node',
                node: {
                    ref: 'support_email',
                    nodeKey: 'action:email',
                    title: 'Alert support',
                    config: {
                        to: 'limweilun3838@gmail.com',
                        subject: 'Low rating feedback',
                        body: { $expr: 'reference', v: 1, nodeId: 'summarize_feedback', path: ['response'] }
                    }
                }
            },
            {
                op: 'connect',
                from: { nodeRef: 'summarize_feedback', handle: 'outputData' },
                to: { nodeRef: 'support_email', handle: 'triggerData' }
            }
        ]
    });

    const compiledBindings = compileWorkflowBindings({ nodes: result.nodes, formSchema });
    assert.deepEqual(compiledBindings.issues, []);
    assert.deepEqual(validateWorkflowExpressions({
        nodes: compiledBindings.nodes,
        edges: result.edges,
        formSchema
    }), []);
    const email = compiledBindings.nodes.find(node => node.title === 'Alert support');
    const summary = compiledBindings.nodes.find(node => node.title === 'Summarize feedback');
    assert.equal(email.config.body.nodeId, summary.id);
});

test('add_switch_routes owns fixed switch handles and every outcome connection', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'logic:switch', type: 'logic', subType: 'switch', schema: { inputs: [{ name: 'input1', isConnection: true }, { name: 'valueToTest', type: 'text' }, { name: 'cases', type: 'json' }], outputs: [{ name: 'branchA', isConnection: true }, { name: 'branchB', isConnection: true }, { name: 'default', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'done', isConnection: true }] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [{ id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} }],
            edges: []
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_switch_routes',
            from: { nodeRef: 'n1', handle: 'event' },
            switch: { ref: 'route_mode', title: 'Route attendance mode', config: { valueToTest: 'Online' } },
            cases: [
                { value: 'Online', action: { ref: 'online', nodeKey: 'action:email', config: {} } },
                { value: 'Physical', action: { ref: 'physical', nodeKey: 'action:email', config: {} } }
            ],
            otherwise: { ref: 'fallback', nodeKey: 'action:email', config: {} }
        }]
    });

    const router = result.nodes.find(node => node.nodeKey === 'logic:switch');
    const actions = result.nodes.filter(node => node.nodeKey === 'action:email');
    assert.ok(router);
    assert.equal(actions.length, 3);
    assert.deepEqual(router.config.cases, [
        { value: 'Online', handle: 'branchA' },
        { value: 'Physical', handle: 'branchB' }
    ]);
    assert.ok(result.edges.some(edge => edge.source === 'trigger' && edge.target === router.id && edge.targetHandle === 'input1'));
    assert.equal(result.edges.filter(edge => edge.source === router.id && edge.sourceHandle === 'branchA').length, 1);
    assert.equal(result.edges.filter(edge => edge.source === router.id && edge.sourceHandle === 'branchB').length, 1);
    assert.equal(result.edges.filter(edge => edge.source === router.id && edge.sourceHandle === 'default').length, 1);
});

test('add_error_handler replaces a route with explicit success and recovery paths', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'action:http', type: 'action', subType: 'http', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] } },
        { nodeKey: 'action:store', type: 'action', subType: 'store', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } },
        { nodeKey: 'logic:catchError', type: 'logic', subType: 'catchError', schema: { inputs: [{ name: 'inputData', isConnection: true }, { name: 'errorSource', type: 'text' }, { name: 'fallbackValue', type: 'text' }], outputs: [{ name: 'errorPath', isConnection: true }, { name: 'successPath', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} },
                { id: 'request', type: 'action', subType: 'http', nodeKey: 'action:http', config: {} },
                { id: 'store', type: 'action', subType: 'store', nodeKey: 'action:store', config: {} }
            ],
            edges: [
                { id: 'trigger_request', source: 'trigger', sourceHandle: 'event', target: 'request', targetHandle: 'event' },
                { id: 'request_store', source: 'request', sourceHandle: 'outputData', target: 'store', targetHandle: 'event' }
            ]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_error_handler',
            connection: { from: { nodeRef: 'n2', handle: 'outputData' }, to: { nodeRef: 'n3', handle: 'event' } },
            handler: { ref: 'handle_request_error', title: 'Handle request error', config: { fallbackValue: 'Unavailable' } },
            whenError: { ref: 'alert_team', nodeKey: 'action:email', config: {} }
        }]
    });

    const handler = result.nodes.find(node => node.nodeKey === 'logic:catchError');
    const alert = result.nodes.find(node => node.nodeKey === 'action:email');
    assert.ok(handler);
    assert.equal(handler.config.errorSource, 'request');
    assert.equal(result.edges.some(edge => edge.id === 'request_store'), false);
    assert.ok(result.edges.some(edge => edge.source === 'request' && edge.target === handler.id && edge.targetHandle === 'inputData'));
    assert.ok(result.edges.some(edge => edge.source === handler.id && edge.sourceHandle === 'successPath' && edge.target === 'store'));
    assert.ok(result.edges.some(edge => edge.source === handler.id && edge.sourceHandle === 'errorPath' && edge.target === alert.id));
});

test('add_approval_gate preserves the approved connection and can add a rejected outcome', () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'action:store', type: 'action', subType: 'store', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } },
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'inputData', isConnection: true }, { name: 'title', type: 'text' }], outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'store', type: 'action', subType: 'store', nodeKey: 'action:store', config: {} }
            ],
            edges: [{ id: 'form_store', source: 'form', sourceHandle: 'event', target: 'store', targetHandle: 'event' }]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_approval_gate',
            connection: { from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n2', handle: 'event' } },
            approval: { ref: 'review_response', title: 'Review response', config: { title: 'Review response' } },
            whenRejected: { ref: 'notify_rejected', nodeKey: 'action:email', config: {} }
        }]
    });

    const approval = result.nodes.find(node => node.nodeKey === 'logic:approval');
    const rejected = result.nodes.find(node => node.nodeKey === 'action:email');
    assert.ok(approval);
    assert.equal(result.edges.some(edge => edge.id === 'form_store'), false);
    assert.ok(result.edges.some(edge => edge.source === 'form' && edge.target === approval.id && edge.targetHandle === 'inputData'));
    assert.ok(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'approved' && edge.target === 'store'));
    assert.ok(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'rejected' && edge.target === rejected.id));
});

test('add_approval_gate can create the approved route from a new source connection', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }, { name: 'to', valueSyntax: 'workflow-expression' }], outputs: [{ name: 'outputData', isConnection: true }] } },
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} },
                { id: 'support', type: 'action', subType: 'email', nodeKey: 'action:email', config: {} }
            ],
            edges: [{ id: 'trigger_support', source: 'trigger', sourceHandle: 'event', target: 'support', targetHandle: 'event' }]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'add_approval_gate',
            from: { nodeRef: 'n2', handle: 'outputData' },
            approval: { ref: 'review_compensation', title: 'Review compensation', config: { title: 'Review compensation' } },
            whenApproved: { ref: 'send_compensation', nodeKey: 'action:email', config: { to: 'customer@example.com' } },
            whenRejected: null
        }]
    });

    const approval = result.nodes.find(node => node.nodeKey === 'logic:approval');
    const compensation = result.nodes.find(node => node.config?.to === 'customer@example.com');
    assert.ok(approval);
    assert.ok(compensation);
    assert.ok(result.edges.some(edge => edge.source === 'support' && edge.sourceHandle === 'outputData' && edge.target === approval.id));
    assert.ok(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'approved' && edge.target === compensation.id));
    assert.equal(result.edges.some(edge => edge.source === approval.id && edge.sourceHandle === 'rejected'), false);
});

test('move_approval_gate relocates a shared approval onto the AI-selected venue route', () => {
    const specs = [
        { nodeKey: 'trigger:form-submission', type: 'trigger', subType: 'form-submission', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'inputData', isConnection: true }, { name: 'title', type: 'text' }], outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }] } },
        { nodeKey: 'logic:condition', type: 'logic', subType: 'condition', schema: { inputs: [{ name: 'input1', isConnection: true }], outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } },
        { nodeKey: 'action:logger', type: 'action', subType: 'logger', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', config: {} },
                { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Review before both email routes', config: { title: 'Review before both email routes' } },
                { id: 'condition', type: 'logic', subType: 'condition', nodeKey: 'logic:condition', config: {} },
                { id: 'online', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Online Joining Instructions', config: {} },
                { id: 'venue', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Venue Instructions', config: {} },
                { id: 'rejected', type: 'action', subType: 'logger', nodeKey: 'action:logger', config: {} }
            ],
            edges: [
                { id: 'form_approval', source: 'form', sourceHandle: 'event', target: 'approval', targetHandle: 'inputData' },
                { id: 'approval_condition', source: 'approval', sourceHandle: 'approved', target: 'condition', targetHandle: 'input1' },
                { id: 'approval_rejected', source: 'approval', sourceHandle: 'rejected', target: 'rejected', targetHandle: 'event' },
                { id: 'condition_online', source: 'condition', sourceHandle: 'true', target: 'online', targetHandle: 'event' },
                { id: 'condition_venue', source: 'condition', sourceHandle: 'false', target: 'venue', targetHandle: 'event' }
            ]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'move_approval_gate',
            approvalNodeRef: 'n2',
            connection: { from: { nodeRef: 'n3', handle: 'false' }, to: { nodeRef: 'n5', handle: 'event' } },
            approvalUpdates: { title: 'Review before venue instructions', config: { title: 'Review before venue instructions' } }
        }]
    });

    assert.equal(result.nodes.filter(node => node.nodeKey === 'logic:approval').length, 1);
    assert.equal(result.nodes.find(node => node.id === 'approval')?.title, 'Review before venue instructions');
    assert.equal(result.edges.some(edge => edge.source === 'form' && edge.target === 'approval'), false);
    assert.equal(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'approved' && edge.target === 'condition'), false);
    assert.ok(result.edges.some(edge => edge.source === 'form' && edge.sourceHandle === 'event' && edge.target === 'condition' && edge.targetHandle === 'input1'));
    assert.ok(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'true' && edge.target === 'online'));
    assert.equal(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'false' && edge.target === 'venue'), false);
    assert.ok(result.edges.some(edge => edge.source === 'condition' && edge.sourceHandle === 'false' && edge.target === 'approval' && edge.targetHandle === 'inputData'));
    assert.ok(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'approved' && edge.target === 'venue' && edge.targetHandle === 'event'));
    assert.ok(result.edges.some(edge => edge.source === 'approval' && edge.sourceHandle === 'rejected' && edge.target === 'rejected'));
});

test('join_branches connects each route to one Merge input and one continuation', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'action:branch', type: 'action', subType: 'branch', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [{ name: 'outputData', isConnection: true }] } },
        { nodeKey: 'logic:merge', type: 'logic', subType: 'merge', schema: { inputs: [{ name: 'input1', isConnection: true }, { name: 'mergeMode', type: 'select' }], outputs: [{ name: 'outputData', isConnection: true }] } },
        { nodeKey: 'action:logger', type: 'action', subType: 'logger', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const result = compileWorkflowEdits({
        currentWorkflow: {
            nodes: [
                { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} },
                { id: 'left', type: 'action', subType: 'branch', nodeKey: 'action:branch', config: {} },
                { id: 'right', type: 'action', subType: 'branch', nodeKey: 'action:branch', config: {} }
            ],
            edges: [
                { id: 'trigger_left', source: 'trigger', sourceHandle: 'event', target: 'left', targetHandle: 'event' },
                { id: 'trigger_right', source: 'trigger', sourceHandle: 'event', target: 'right', targetHandle: 'event' }
            ]
        },
        specs,
        registry: registryFor(specs),
        operations: [{
            op: 'join_branches',
            branches: [
                { from: { nodeRef: 'n2', handle: 'outputData' } },
                { from: { nodeRef: 'n3', handle: 'outputData' } }
            ],
            merge: { ref: 'join_routes', title: 'Join routes', config: { mergeMode: 'array' } },
            continueWith: { ref: 'log_join', nodeKey: 'action:logger', config: {} }
        }]
    });

    const merge = result.nodes.find(node => node.nodeKey === 'logic:merge');
    const logger = result.nodes.find(node => node.nodeKey === 'action:logger');
    assert.ok(merge);
    assert.equal(result.edges.filter(edge => edge.target === merge.id && edge.targetHandle === 'input1').length, 2);
    assert.ok(result.edges.some(edge => edge.source === merge.id && edge.sourceHandle === 'outputData' && edge.target === logger.id));
});

test('compiler retires raw creation for every semantic control-flow node', () => {
    const retired = [
        ['logic:condition', 'WORKFLOW_CONDITION_BRANCH_OPERATION_REQUIRED'],
        ['logic:switch', 'WORKFLOW_SWITCH_ROUTES_OPERATION_REQUIRED'],
        ['logic:catchError', 'WORKFLOW_ERROR_HANDLER_OPERATION_REQUIRED'],
        ['logic:merge', 'WORKFLOW_MERGE_OPERATION_REQUIRED'],
        ['logic:approval', 'WORKFLOW_APPROVAL_GATE_OPERATION_REQUIRED']
    ];
    for (const [nodeKey, code] of retired) {
        assert.throws(() => compileWorkflowEdits({
            currentWorkflow: { nodes: [], edges: [] },
            operations: [{ op: 'create_node', node: { ref: 'control', nodeKey, config: {} } }]
        }), error => error.issues?.[0]?.code === code);
    }
});

test('condition branch rejects a source route that belongs to the Condition itself', () => {
    const specs = [
        { nodeKey: 'trigger:webhook', type: 'trigger', subType: 'webhook', schema: { inputs: [], outputs: [{ name: 'event', isConnection: true }] } },
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'approved', isConnection: true }, { name: 'rejected', isConnection: true }] } },
        { nodeKey: 'logic:condition', type: 'logic', subType: 'condition', schema: { inputs: [{ name: 'input1', isConnection: true }], outputs: [{ name: 'true', isConnection: true }, { name: 'false', isConnection: true }] } },
        { nodeKey: 'action:email', type: 'action', subType: 'email', schema: { inputs: [{ name: 'event', isConnection: true }], outputs: [] } }
    ];
    const registry = { getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    } };
    const workflow = {
        nodes: [
            { id: 'trigger', type: 'trigger', subType: 'webhook', nodeKey: 'trigger:webhook', config: {} },
            { id: 'approval', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', config: {} }
        ],
        edges: [{ id: 'edge', source: 'trigger', sourceHandle: 'event', target: 'approval', targetHandle: 'inputData' }]
    };
    const operation = {
        op: 'add_condition_branch', from: { nodeRef: 'n2', handle: 'true' },
        condition: { ref: 'check', config: { valueA: 'Online', operator: 'equals', valueB: 'Online' } },
        whenTrue: { ref: 'online', nodeKey: 'action:email', config: {} },
        whenFalse: { ref: 'venue', nodeKey: 'action:email', config: {} }
    };

    assert.throws(() => compileWorkflowEdits({ currentWorkflow: workflow, operations: [operation], specs, registry }), error => {
        const issue = error.issues?.[0];
        return issue?.code === 'WORKFLOW_HANDLE_INVALID'
            && issue.value === 'true'
            && issue.allowed?.includes('approved')
            && issue.allowed?.includes('rejected');
    });
});

test('condition branch rejects retired raw Condition creation', () => {
    const specs = [{ nodeKey: 'logic:condition', type: 'logic', subType: 'condition', schema: { inputs: [], outputs: [] } }];
    assert.throws(() => compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] },
        specs,
        operations: [{ op: 'create_node', node: { ref: 'condition', nodeKey: 'logic:condition', config: {} } }]
    }), error => error.issues?.[0]?.code === 'WORKFLOW_CONDITION_BRANCH_OPERATION_REQUIRED');
});
