import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflowEdits } from './workflowAgentService.js';

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
