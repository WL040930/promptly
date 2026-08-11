import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundWorkerPoller } from './backgroundWorkerPoller.js';

const createManualScheduler = () => {
    const pending = [];
    return {
        schedule: (callback, delay) => {
            const handle = { callback, delay, cancelled: false };
            pending.push(handle);
            return handle;
        },
        cancel: handle => {
            handle.cancelled = true;
        },
        next: () => {
            const handle = pending.shift();
            assert.ok(handle, 'expected a scheduled callback');
            assert.equal(handle.cancelled, false);
            return handle;
        },
        pending
    };
};

test('single-flight poller does not overlap a pending run', async () => {
    const scheduler = createManualScheduler();
    let resolveTask;
    let calls = 0;
    const poller = createBackgroundWorkerPoller({
        intervalMs: 10,
        schedule: scheduler.schedule,
        cancel: scheduler.cancel,
        task: () => {
            calls += 1;
            return new Promise(resolve => {
                resolveTask = resolve;
            });
        }
    });

    await poller.start();
    const first = scheduler.next();
    const firstRun = first.callback();
    const secondRun = poller.runOnce();
    assert.equal(calls, 1);
    assert.strictEqual(secondRun, firstRun);

    resolveTask();
    await firstRun;
    assert.equal(scheduler.pending.length, 1);
    assert.equal(scheduler.pending[0].delay, 10);
    await poller.stop();
});

test('poller backs off after failures and resets after success', async () => {
    const scheduler = createManualScheduler();
    const errors = [];
    let calls = 0;
    const poller = createBackgroundWorkerPoller({
        intervalMs: 10,
        maxBackoffMs: 40,
        schedule: scheduler.schedule,
        cancel: scheduler.cancel,
        onError: error => errors.push(error.message),
        task: async () => {
            calls += 1;
            if (calls < 3) throw new Error(`failure-${calls}`);
        }
    });

    await poller.start({ immediate: true });
    assert.deepEqual(errors, ['failure-1']);
    assert.equal(scheduler.pending[0].delay, 20);

    await scheduler.next().callback();
    assert.deepEqual(errors, ['failure-1', 'failure-2']);
    assert.equal(scheduler.pending[0].delay, 40);

    await scheduler.next().callback();
    assert.equal(calls, 3);
    assert.equal(scheduler.pending[0].delay, 10);
    await poller.stop();
});

test('stopping a poller cancels future work', async () => {
    const scheduler = createManualScheduler();
    let calls = 0;
    const poller = createBackgroundWorkerPoller({
        intervalMs: 10,
        schedule: scheduler.schedule,
        cancel: scheduler.cancel,
        task: async () => {
            calls += 1;
        }
    });

    await poller.start();
    const scheduled = scheduler.next();
    await poller.stop();
    assert.equal(scheduled.cancelled, true);
    assert.equal(calls, 0);
});
