import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkflowPatches } from './workflowAgentService.js';

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
