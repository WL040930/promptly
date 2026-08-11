import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithProviderLiveness } from './providerLiveness.js';

test('provider liveness reports real in-flight time and stops after completion', async () => {
    let tick;
    let cleared = null;
    let currentTime = 1_000;
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const events = [];

    const run = runWithProviderLiveness({
        execute: () => waiting,
        operation: 'workflow:planner',
        attempt: 2,
        maxAttempts: 4,
        provider: 'nvidia',
        model: 'nemotron',
        onActivity: event => events.push(event),
        now: () => currentTime,
        setIntervalFn: callback => {
            tick = callback;
            return 'timer_1';
        },
        clearIntervalFn: timer => { cleared = timer; }
    });

    currentTime = 11_500;
    tick();
    release({ text: 'done' });

    assert.deepEqual(await run, { text: 'done' });
    assert.deepEqual(events, [{
        type: 'provider_waiting',
        operation: 'workflow:planner',
        attempt: 2,
        maxAttempts: 4,
        provider: 'nvidia',
        model: 'nemotron',
        elapsedMs: 10_500
    }]);
    assert.equal(cleared, 'timer_1');
});
