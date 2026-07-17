import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkflowPatches, layoutWorkflowNodes } from './workflowAgentService.js';

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
