import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_DATABASE ||= 'test';
process.env.JWT_SECRET ||= '12345678901234567890123456789012';
process.env.GOOGLE_CLIENT_ID ||= 'test';
process.env.GOOGLE_CLIENT_SECRET ||= 'test';
process.env.GOOGLE_REDIRECT_URI ||= 'http://localhost';
process.env.SMTP_HOST ||= 'localhost';
process.env.SMTP_PORT ||= '25';
process.env.SMTP_USER ||= 'test';
process.env.SMTP_PASS ||= 'test';
process.env.SMTP_FROM ||= 'test@example.com';
process.env.SUPABASE_URL ||= 'http://localhost';
process.env.SUPABASE_ANON_KEY ||= 'test';

const { applyWorkflowPatches, compactWorkflowSnapshot } = await import('./workflowAgentService.js');

const loggerSpec = { subType: 'logger', type: 'action', title: 'Logger', description: 'Log values', schema: { inputs: [], outputs: [] }, ui: {} };

test('compactWorkflowSnapshot removes node configuration and keeps edge handles', () => {
    const result = compactWorkflowSnapshot({
        nodes: [{ id: 'n1', title: 'Trigger', type: 'trigger', subType: 'schedule', config: { cronExpression: '* * * * *' } }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'true', targetHandle: 'default' }]
    });
    assert.deepEqual(result.nodes[0], { id: 'n1', title: 'Trigger', type: 'trigger', subType: 'schedule' });
    assert.equal(result.edges[0].sourceHandle, 'true');
});

test('patch applier resolves placeholders and removes connected edges', () => {
    const result = applyWorkflowPatches({
        currentNodes: [
            { id: 'n1', type: 'trigger', subType: 'schedule', title: 'Schedule', position: { x: 100, y: 150 }, config: {} },
            { id: 'n2', type: 'action', subType: 'logger', title: 'Logger', position: { x: 450, y: 150 }, config: {} }
        ],
        currentEdges: [{ id: 'e1', source: 'n1', target: 'n2' }],
        patches: [
            { op: 'remove_edge', id: 'e1' },
            { op: 'add_node', id: 'node_new_1', type: 'action', subType: 'logger', title: 'Second logger', config: {}, afterNodeId: 'n1' },
            { op: 'add_edge', id: 'edge_new_1', source: 'n1', target: 'node_new_1' },
            { op: 'remove_node', id: 'n2' }
        ],
        specs: [loggerSpec]
    });
    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].source, 'n1');
    assert.equal(result.edges[0].target, result.nodes[1].id);
});

test('patch applier merges update configuration without dropping fields', () => {
    const result = applyWorkflowPatches({
        currentNodes: [{ id: 'n1', type: 'action', subType: 'logger', title: 'Logger', config: { level: 'info', message: 'old' } }],
        currentEdges: [],
        patches: [{ op: 'update_node', id: 'n1', updates: { config: { message: 'new' } } }],
        specs: [loggerSpec]
    });
    assert.deepEqual(result.nodes[0].config, { level: 'info', message: 'new' });
});
