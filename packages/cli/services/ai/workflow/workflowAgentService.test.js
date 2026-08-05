import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflowEdits, normalizeGeneratedResourceValues } from './workflowAgentService.js';

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
        { nodeKey: 'logic:approval', type: 'logic', subType: 'approval', schema: { inputs: [{ name: 'inputData', isConnection: true }], outputs: [{ name: 'approved', isConnection: true }] } }
    ];
    const registry = { getDefinition: (type, subType) => {
        const spec = specs.find(item => item.type === type && item.subType === subType);
        return spec ? { implementationStatus: 'experimental', configSchema: spec.schema } : null;
    } };
    const result = compileWorkflowEdits({
        currentWorkflow: { nodes: [], edges: [] }, specs, registry,
        operations: [
            { op: 'create_node', node: { ref: 'form', nodeKey: 'trigger:form-submission' } },
            { op: 'create_node', node: { ref: 'approval', nodeKey: 'logic:approval' } },
            { op: 'connect', from: { nodeRef: 'form', handle: 'event' }, to: { nodeRef: 'approval', handle: 'triggerData' } }
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
