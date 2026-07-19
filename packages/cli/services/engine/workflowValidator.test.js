import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflow } from './workflowValidator.js';

const registry = {
    getDefinition: (type, subType) => ({
        implementationStatus: type === 'action' && subType === 'stub' ? 'disabled' : 'experimental',
        configSchema: { inputs: [{ name: 'requiredValue', required: type === 'action' }], outputs: [] }
    })
};

const node = (id, type, subType) => ({ id, type, subType, config: type === 'action' ? { requiredValue: 'ok' } : {} });

test('validates an active workflow with one trigger and reachable nodes', () => {
    const result = validateWorkflow({
        registry,
        isActive: true,
        nodes: [node('trigger_1', 'trigger', 'webhook'), node('action_1', 'action', 'http')],
        edges: [{ id: 'edge_1', source: 'trigger_1', target: 'action_1' }]
    });
    assert.equal(result.valid, true);
});

test('rejects unsupported nodes, cycles, and missing required configuration', () => {
    const result = validateWorkflow({
        registry,
        isActive: true,
        nodes: [node('trigger_1', 'trigger', 'webhook'), { ...node('action_1', 'action', 'stub'), config: {} }],
        edges: [
            { id: 'edge_1', source: 'trigger_1', target: 'action_1' },
            { id: 'edge_2', source: 'action_1', target: 'trigger_1' }
        ]
    });
    assert.equal(result.valid, false);
    assert.deepEqual(new Set(result.issues.map(item => item.code)), new Set(['UNSUPPORTED_NODE', 'MISSING_NODE_CONFIG', 'CYCLIC_WORKFLOW']));
});

test('allows an inactive draft to retain a disabled node while it is being repaired', () => {
    const result = validateWorkflow({
        registry,
        isActive: false,
        nodes: [node('action_1', 'action', 'stub')],
        edges: []
    });

    assert.equal(result.valid, true);
});

test('allows an inactive draft to save a node before required configuration is filled in', () => {
    const result = validateWorkflow({
        registry,
        isActive: false,
        nodes: [{ id: 'action_1', type: 'action', subType: 'http', config: {} }],
        edges: []
    });

    assert.equal(result.valid, true);
});

test('rejects an active workflow without exactly one trigger', () => {
    const result = validateWorkflow({
        registry,
        isActive: true,
        nodes: [node('action_1', 'action', 'http')],
        edges: []
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some(item => item.code === 'TRIGGER_COUNT'));
});
