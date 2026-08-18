import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowProposalPresentation } from './workflowProposalPresentation.js';

test('legacy workflow proposals derive summary changes when presentation metadata is missing', () => {
    const presentation = workflowProposalPresentation({
        name: 'Event Registration',
        nodes: [
            { id: 'form', subType: 'form-submission' },
            { id: 'email', subType: 'send-email' }
        ],
        diff: {
            addedNodes: [{ id: 'email', subType: 'send-email' }],
            updatedNodes: [],
            removedNodes: [],
            edges: [{ id: 'edge_1', op: 'connect' }]
        }
    });

    assert.deepEqual(presentation.flow, ['Form submission', 'Send email']);
    assert.deepEqual(presentation.changes.map(change => change.label), ['Send email', 'Workflow connection']);
    assert.equal(presentation.changes.length, 2);
});

test('workflow deletion effects remain visible in the proposal summary', () => {
    const presentation = workflowProposalPresentation({
        name: 'Feedback follow-up',
        nodes: [{ id: 'email', title: 'Send email', subType: 'email' }],
        diff: {
            addedNodes: [],
            updatedNodes: [],
            removedNodes: [{ id: 'summary', title: 'Summarize feedback' }],
            edges: [],
            deletionEffects: [{
                clearedReferences: [{ title: 'Send email', nodeId: 'email', configPath: 'nodes.email.config.body' }],
                bypassedEdges: [{ id: 'bypass' }]
            }]
        }
    });

    assert.deepEqual(presentation.changes.map(change => change.detail), [
        'Removed step',
        'Cleared body',
        'Bypassed the removed step'
    ]);
});
