import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAcceptedProposalStatus,
    isRejectedProposalStatus,
    isStaleProposalStatus,
    proposalStatusLabel,
    shouldShowProposalActions
} from '../components/chat/proposalStatus.js';

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

test('accepted display labels remain terminal in the proposal widget', () => {
    assert.equal(proposalStatusLabel('accepted'), 'Accepted');
    assert.equal(isAcceptedProposalStatus('Accepted'), true);
    assert.equal(isAcceptedProposalStatus('Applied'), true);
    assert.equal(isRejectedProposalStatus('Ignored'), true);
    assert.equal(isStaleProposalStatus('Superseded'), true);
    assert.equal(shouldShowProposalActions('Accepted'), false);
});
