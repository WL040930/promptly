import assert from 'node:assert/strict';
import test from 'node:test';
import { isMeaningfulTurnEvent } from './assistantTurnContract.js';

test('transport heartbeats do not count as meaningful assistant progress', () => {
    assert.equal(isMeaningfulTurnEvent({ type: 'turn.heartbeat' }), false);
    assert.equal(isMeaningfulTurnEvent({ type: 'run.progress' }), true);
    assert.equal(isMeaningfulTurnEvent({ type: 'turn.completed' }), true);
});
