import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutionGraph, mergeExecutionResult, selectOutgoingEdges } from './executionGraph.js';

test('buildExecutionGraph preserves incoming and outgoing edge relationships', () => {
    const graph = buildExecutionGraph(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' }]
    );

    assert.deepEqual(graph.outgoing.get('a').map(edge => edge.id), ['ab']);
    assert.deepEqual(graph.incoming.get('c').map(edge => edge.id), ['bc']);
});

test('selectOutgoingEdges follows a logic routing handle', () => {
    const edges = [
        { id: 'true_edge', sourceHandle: 'true' },
        { id: 'false_edge', sourceHandle: 'false' }
    ];

    assert.deepEqual(selectOutgoingEdges({ type: 'logic' }, { targetHandle: 'false' }, edges), [edges[1]]);
    assert.deepEqual(selectOutgoingEdges({ type: 'action' }, {}, edges), edges);
});

test('mergeExecutionResult exposes canonical node output and persisted variables', () => {
    const context = {};
    mergeExecutionResult(context, { id: 'set_1', title: 'Set Value', type: 'logic', subType: 'setVariable' }, {
        success: true,
        value: 42,
        variables: { customerScore: 42 }
    });

    assert.equal(context.set_1.value, 42);
    assert.equal(context['logic:setVariable'].value, 42);
    assert.equal(context.customerScore, 42);
});
