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

test('a logic route with no selected destination ends that branch', () => {
    const edges = [{ id: 'true_edge', sourceHandle: 'true' }];

    assert.deepEqual(selectOutgoingEdges({ type: 'logic' }, { targetHandle: 'false' }, edges), []);
});

test('a skipped logic node does not forward any of its routes', () => {
    const edges = [
        { id: 'approved_edge', sourceHandle: 'approved' },
        { id: 'rejected_edge', sourceHandle: 'rejected' }
    ];

    assert.deepEqual(selectOutgoingEdges({ type: 'logic' }, { success: true, skipped: true }, edges), []);
});

test('selectOutgoingEdges keeps every destination on the selected logic route', () => {
    const edges = [
        { id: 'save_approved_response', sourceHandle: 'approved' },
        { id: 'send_approved_response_to_condition', sourceHandle: 'approved' },
        { id: 'rejection_notice', sourceHandle: 'rejected' }
    ];

    assert.deepEqual(
        selectOutgoingEdges({ type: 'logic' }, { targetHandle: 'approved' }, edges),
        [edges[0], edges[1]]
    );
});

test('a failed action only continues into an explicit Catch Error step', () => {
    const edges = [
        { id: 'email', target: 'email_1' },
        { id: 'recovery', target: 'catch_1' }
    ];
    const nodes = new Map([
        ['email_1', { subType: 'email' }],
        ['catch_1', { subType: 'catchError' }]
    ]);

    assert.deepEqual(
        selectOutgoingEdges({ type: 'action' }, { success: false }, edges, nodes),
        [edges[1]]
    );
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
