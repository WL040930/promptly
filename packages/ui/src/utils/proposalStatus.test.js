import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalStatusLabel, shouldShowProposalActions } from '../components/chat/proposalStatus.js';

test('pending proposals remain actionable until a terminal decision', () => {
    assert.equal(proposalStatusLabel('pending'), null);
    assert.equal(shouldShowProposalActions('pending'), true);
});

test('terminal proposal states render a status instead of actions', () => {
    for (const status of ['applied', 'ignored', 'superseded', 'stale']) {
        assert.equal(shouldShowProposalActions(status), false);
        assert.ok(proposalStatusLabel(status));
    }
});
