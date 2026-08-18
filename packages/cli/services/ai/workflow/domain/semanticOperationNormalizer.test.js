import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSemanticWorkflowOperations } from './semanticOperationNormalizer.js';

test('assigns compiler-owned unique references to every conditional branch node', () => {
    const { operations, issues } = normalizeSemanticWorkflowOperations({
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2', handle: 'approved' },
            condition: { ref: 'online_email', config: { valueA: 'Online', operator: 'equals', valueB: 'Online' } },
            whenTrue: { ref: 'online_email', nodeKey: 'action:send_email', title: 'Send joining instructions', config: {} },
            whenFalse: { ref: 'online_email', nodeKey: 'action:send_email', title: 'Send venue instructions', config: {} }
        }],
        knownNodeKeys: ['logic:condition', 'action:email']
    });

    assert.deepEqual(issues, []);
    assert.deepEqual(operations[0].condition.ref, 'cf_1_condition');
    assert.deepEqual(operations[0].whenTrue.ref, 'cf_1_true');
    assert.deepEqual(operations[0].whenFalse.ref, 'cf_1_false');
    assert.equal(operations[0].whenTrue.nodeKey, 'action:email');
    assert.equal(operations[0].whenFalse.nodeKey, 'action:email');
});

test('keeps an explicit terminal conditional route null while normalizing the true action', () => {
    const { operations, issues } = normalizeSemanticWorkflowOperations({
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2', handle: 'done' },
            condition: { ref: 'low_rating', config: { valueA: { $binding: 'form_field_rating' }, operator: 'less_than_or_equal', valueB: 3 } },
            whenTrue: { ref: 'notify_support', nodeKey: 'action:email', config: {} },
            whenFalse: null
        }],
        knownNodeKeys: ['logic:condition', 'action:email']
    });

    assert.deepEqual(issues, []);
    assert.equal(operations[0].whenTrue.ref, 'cf_1_true');
    assert.equal(operations[0].whenFalse, null);
});

test('normalizes the compiler-owned approved action for a route-created approval gate', () => {
    const { operations, issues } = normalizeSemanticWorkflowOperations({
        operations: [{
            op: 'add_approval_gate',
            from: { nodeRef: 'notify_support', handle: 'outputData' },
            approval: { ref: 'review_compensation', config: {} },
            whenApproved: { ref: 'send_compensation', nodeKey: 'action:email', config: {} },
            whenRejected: null
        }],
        knownNodeKeys: ['logic:approval', 'action:email']
    });

    assert.deepEqual(issues, []);
    assert.equal(operations[0].approval.ref, 'cf_1_approval');
    assert.equal(operations[0].whenApproved.ref, 'cf_1_approved');
    assert.equal(operations[0].whenRejected, null);
});

test('rewrites a later semantic operation to a uniquely created earlier route', () => {
    const { operations, issues } = normalizeSemanticWorkflowOperations({
        operations: [
            {
                op: 'add_condition_branch', from: { nodeRef: 'n2', handle: 'approved' },
                condition: { ref: 'attendance', config: { valueA: 'Online', operator: 'equals', valueB: 'Online' } },
                whenTrue: { ref: 'online', nodeKey: 'action:email', config: {} },
                whenFalse: { ref: 'venue', nodeKey: 'action:email', config: {} }
            },
            {
                op: 'join_branches',
                branches: [{ from: { nodeRef: 'online', handle: 'done' } }, { from: { nodeRef: 'venue', handle: 'done' } }],
                merge: { ref: 'joined', config: { mergeMode: 'last' } },
                continueWith: { ref: 'log', nodeKey: 'action:email', config: {} }
            }
        ],
        knownNodeKeys: ['logic:condition', 'logic:merge', 'action:email']
    });

    assert.deepEqual(issues, []);
    assert.equal(operations[1].branches[0].from.nodeRef, 'cf_1_true');
    assert.equal(operations[1].branches[1].from.nodeRef, 'cf_1_false');
    assert.equal(operations[1].merge.ref, 'cf_2_merge');
});
