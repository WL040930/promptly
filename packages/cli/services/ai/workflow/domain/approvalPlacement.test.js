import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovalPlacement } from './approvalPlacement.js';

const workflow = {
    nodes: [
        { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission', title: 'Promptly Form' },
        { id: 'review', type: 'logic', subType: 'approval', nodeKey: 'logic:approval', title: 'Review form submission before saving' },
        { id: 'condition', type: 'logic', subType: 'condition', nodeKey: 'logic:condition', title: 'Check Attendance Mode' },
        { id: 'online', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Joining Instructions' },
        { id: 'venue', type: 'action', subType: 'email', nodeKey: 'action:email', title: 'Send Venue Instructions' }
    ],
    edges: [
        { id: 'form_review', source: 'form', sourceHandle: 'event', target: 'review', targetHandle: 'event' },
        { id: 'review_condition', source: 'review', sourceHandle: 'approved', target: 'condition', targetHandle: 'input1' },
        { id: 'condition_online', source: 'condition', sourceHandle: 'true', target: 'online', targetHandle: 'event' },
        { id: 'condition_venue', source: 'condition', sourceHandle: 'false', target: 'venue', targetHandle: 'event' }
    ]
};

const request = 'Also wait for my approval before sending the email';

test('asks before duplicating an approval that already covers both email branches', () => {
    const result = resolveApprovalPlacement({ request, workflow });
    assert.equal(result.kind, 'clarification');
    assert.deepEqual(result.inputs[0].options, ['Use existing approval', 'Choose a different approval placement']);
});

test('reuses the existing approval when selected', () => {
    const result = resolveApprovalPlacement({ request, workflow, clarificationState: { approvalExistingGate: ['Use existing approval'] } });
    assert.equal(result.kind, 'already_satisfied');
});

test('asks where to place an additional approval instead of silently choosing the shared route', () => {
    const result = resolveApprovalPlacement({ request, workflow, clarificationState: { approvalExistingGate: ['Choose a different approval placement'] } });
    assert.equal(result.kind, 'clarification');
    assert.equal(result.inputs[0].id, 'approvalPlacementScope');
    assert.deepEqual(result.inputs[0].options, ['One approval before both email routes', 'Separate approval before each email route']);
});

test('keeps an older Add another approval response actionable by asking for placement', () => {
    const result = resolveApprovalPlacement({ request, workflow, clarificationState: { approvalExistingGate: ['Add another approval'] } });
    assert.equal(result.kind, 'clarification');
    assert.equal(result.inputs[0].id, 'approvalPlacementScope');
});

test('inserts one approval on the shared route only when that scope is selected', () => {
    const result = resolveApprovalPlacement({ request, workflow, clarificationState: {
        approvalExistingGate: ['Choose a different approval placement'],
        approvalPlacementScope: ['One approval before both email routes']
    } });
    assert.equal(result.kind, 'operation');
    assert.equal(result.operations.length, 1);
    assert.equal(result.operations[0].approval.title, 'Review before both email routes');
    assert.deepEqual(result.operations[0].connection, {
        from: { nodeRef: 'n2', handle: 'approved' },
        to: { nodeRef: 'n3', handle: 'input1' }
    });
});

test('can place a separate approval on each email branch', () => {
    const result = resolveApprovalPlacement({ request, workflow, clarificationState: {
        approvalExistingGate: ['Choose a different approval placement'],
        approvalPlacementScope: ['Separate approval before each email route']
    } });

    assert.equal(result.kind, 'operation');
    assert.equal(result.operations.length, 2);
    assert.deepEqual(result.operations.map(operation => operation.connection), [
        { from: { nodeRef: 'n3', handle: 'true' }, to: { nodeRef: 'n4', handle: 'event' } },
        { from: { nodeRef: 'n3', handle: 'false' }, to: { nodeRef: 'n5', handle: 'event' } }
    ]);
    assert.deepEqual(result.operations.map(operation => operation.approval.title), [
        'Review before Send Joining Instructions',
        'Review before Send Venue Instructions'
    ]);
});

test('does not silently turn manager approval into owner approval', () => {
    const result = resolveApprovalPlacement({ request: 'Wait for manager approval before sending the email', workflow });
    assert.equal(result.kind, 'unsupported_approver');
});
