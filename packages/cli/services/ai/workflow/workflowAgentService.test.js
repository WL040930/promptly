import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeneratedResourceValues } from './workflowAgentService.js';
import { compileWorkflowEdits } from './domain/editCompiler/index.js';

const registryFor = specs => ({
    getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    }
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
