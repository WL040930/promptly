import test from 'node:test';
import assert from 'node:assert/strict';
import CatchErrorNode, { findCatchableError } from './core-logic/flow-control/catch-error/index.js';
import MergeNode, { mergeInputs } from './core-logic/flow-control/merge/index.js';
import { resolveDelay } from './core-logic/flow-control/delay/index.js';
import ApprovalNode from './core-logic/flow-control/approval/index.js';

test('catch error selects only unhandled errors and exposes recovery routing', async () => {
    const context = {
        metadata: {
            errors: [
                { nodeId: 'old', error: 'already handled', handled: true },
                { nodeId: 'failed_1', error: 'provider timeout', handled: false }
            ]
        }
    };
    assert.equal(findCatchableError(context).nodeId, 'failed_1');
    const result = await new CatchErrorNode('catch_1', 'logic', 'catchError', {}).execute(context);
    assert.equal(result.handledError, true);
    assert.equal(result.failedNodeId, 'failed_1');
    assert.equal(result.targetHandle, 'errorPath');
});

test('merge combines only branches that actually reached the merge node', async () => {
    const context = {
        branch_a: { value: 'A' },
        branch_b: { value: 'B' },
        __runtime: { incomingNodeIds: ['branch_a', 'branch_b'] }
    };
    assert.deepEqual(mergeInputs(context, ['branch_a', 'branch_b'], 'array'), [{ value: 'A' }, { value: 'B' }]);
    const result = await new MergeNode('merge_1', 'logic', 'merge', { mergeMode: 'object' }).execute(context);
    assert.deepEqual(result.merged, { branch_a: { value: 'A' }, branch_b: { value: 'B' } });
});

test('delay validates units, negative values, and the maximum delay', () => {
    assert.equal(resolveDelay({ delayAmount: 2, delayUnit: 'seconds' }).milliseconds, 2000);
    assert.throws(() => resolveDelay({ delayAmount: -1, delayUnit: 'seconds' }), /cannot be negative/);
    assert.throws(() => resolveDelay({ delayAmount: 25, delayUnit: 'hours' }), /24 hours/);
    assert.throws(() => resolveDelay({ delayAmount: 1, delayUnit: 'days' }), /Unsupported delay unit/);
});

test('approval pauses live runs for the automation owner without email or expiry configuration', async () => {
    const node = new ApprovalNode('approval_1', 'logic', 'approval', {
        title: 'Review application',
        instructions: 'Decide whether to continue.'
    });
    const live = await node.execute({ metadata: { runType: 'production' }, initialPayload: { applicant: 'Ada' } });
    assert.equal(live.suspend.kind, 'approval');
    assert.equal(live.suspend.expiresAt, undefined);
    assert.deepEqual(live.suspend.payload, {
        title: 'Review application',
        instructions: 'Decide whether to continue.',
        input: { applicant: 'Ada' }
    });

    const preview = await node.execute({ metadata: { runType: 'test' } });
    assert.equal(preview.targetHandle, 'approved');
});
