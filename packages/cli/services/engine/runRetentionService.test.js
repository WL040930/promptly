import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTIVE_RUN_STATUSES,
    OPEN_CONTINUATION_STATUSES,
    cancellableRunIds,
    continuationDiscardMessage,
    openContinuationIds,
    runCancellationMessage
} from './runRetentionService.js';

test('deleted workflow retention treats active and waiting runs as cancellable', () => {
    assert.deepEqual(ACTIVE_RUN_STATUSES, ['running', 'waiting', 'resuming']);
    assert.deepEqual(OPEN_CONTINUATION_STATUSES, ['pending', 'resuming']);
    assert.deepEqual(cancellableRunIds([
        { id: 'run_1', status: 'succeeded' },
        { id: 'run_2', status: 'waiting' },
        { id: 'run_3', status: 'cancelled' },
        { id: 'run_4', status: 'running' }
    ]), ['run_2', 'run_4']);
    assert.deepEqual(openContinuationIds([{ id: 'cont_1' }, { id: 'cont_2' }]), ['cont_1', 'cont_2']);
    assert.match(runCancellationMessage('Event Registration'), /Event Registration/);
    assert.match(continuationDiscardMessage('Event Registration'), /continuation/);
});
