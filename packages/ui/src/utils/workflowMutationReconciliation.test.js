import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyWorkflowNodeChanges,
    reconcileWorkflowMutationFailure,
    reconcileWorkflowMutationSuccess,
    workflowMutationFields
} from './workflowMutationReconciliation.js';
import { createDebouncedSaveQueue } from './formAutosave.js';

const first = [{ id: 'email_1', config: { subject: 'First' } }];
const second = [{ id: 'email_1', config: { subject: 'First second' } }];

test('an older workflow save response cannot replace newer node text', () => {
    const result = reconcileWorkflowMutationSuccess({
        current: { id: 'workflow_1', nodes: second, revision: 1 },
        submitted: { nodes: first },
        server: { id: 'workflow_1', nodes: first, revision: 2, updatedAt: '2026-07-28T00:00:00.000Z' }
    });

    assert.deepEqual(result.nodes, second);
    assert.equal(result.revision, 2);
});

test('the latest save response remains authoritative for its matching value', () => {
    const result = reconcileWorkflowMutationSuccess({
        current: { id: 'workflow_1', nodes: second, revision: 1 },
        submitted: { nodes: second },
        server: { id: 'workflow_1', nodes: second, revision: 2, updatedAt: '2026-07-28T00:00:00.000Z' }
    });

    assert.deepEqual(result.nodes, second);
    assert.equal(result.updatedAt, '2026-07-28T00:00:00.000Z');
});

test('a failed older workflow save does not roll back newer node text', () => {
    const result = reconcileWorkflowMutationFailure({
        current: { id: 'workflow_1', nodes: second },
        previous: { id: 'workflow_1', nodes: [] },
        submitted: { nodes: first }
    });

    assert.deepEqual(result.nodes, second);
});

test('workflow mutation fields exclude request-only metadata', () => {
    assert.deepEqual(workflowMutationFields({ nodes: first, expectedRevision: 1, source: 'visual', summary: 'Save' }), { nodes: first });
});

test('removing a workflow node persists its connected edge removal atomically', () => {
    const nodes = [
        { id: 'trigger_1', type: 'trigger', subType: 'manual' },
        { id: 'email_1', type: 'action', subType: 'email' }
    ];
    const edges = [{ id: 'edge_1', source: 'trigger_1', target: 'email_1' }];

    const update = applyWorkflowNodeChanges({
        nodes,
        edges,
        changes: [{ type: 'remove', id: 'email_1' }]
    });

    assert.deepEqual(update, {
        nodes: [nodes[0]],
        edges: []
    });
});

test('removing a node through the mutation adapter also removes dangling canonical references', () => {
    const nodes = [
        { id: 'summary_1', config: {} },
        { id: 'email_1', config: { body: { $expr: 'reference', v: 1, nodeId: 'summary_1', path: ['response'] } } }
    ];
    const edges = [{ id: 'edge_1', source: 'summary_1', target: 'email_1' }];

    const update = applyWorkflowNodeChanges({
        nodes,
        edges,
        changes: [{ type: 'remove', id: 'summary_1' }]
    });

    assert.equal(update.nodes.find(node => node.id === 'email_1').config.body, undefined);
    assert.deepEqual(update.edges, []);
});

test('moving a node marks its position as protected from automatic layout', () => {
    const result = applyWorkflowNodeChanges({
        nodes: [{ id: 'node_1', position: { x: 10, y: 20 }, layoutPinned: false }],
        changes: [{ id: 'node_1', type: 'position', position: { x: 100, y: 200 } }]
    });
    assert.deepEqual(result.nodes[0], { id: 'node_1', position: { x: 100, y: 200 }, layoutPinned: true });
});

test('a delayed first autosave never makes the editor show the first word again', async () => {
    let cache = { id: 'workflow_1', nodes: first, revision: 1 };
    let releaseFirst;
    const firstRequest = new Promise(resolve => { releaseFirst = resolve; });
    const observedSubjects = [];
    let requestCount = 0;
    const queue = createDebouncedSaveQueue({
        delay: 1,
        save: async submitted => {
            requestCount += 1;
            if (requestCount === 1) await firstRequest;
            const server = { id: 'workflow_1', ...submitted, revision: requestCount + 1 };
            cache = reconcileWorkflowMutationSuccess({ current: cache, server, submitted });
            observedSubjects.push(cache.nodes[0].config.subject);
        }
    });

    queue.schedule({ nodes: first });
    await new Promise(resolve => setTimeout(resolve, 5));
    cache = { ...cache, nodes: second };
    observedSubjects.push(cache.nodes[0].config.subject);
    queue.schedule({ nodes: second });
    releaseFirst();
    await queue.flush();

    assert.deepEqual(observedSubjects, ['First second', 'First second', 'First second']);
});
