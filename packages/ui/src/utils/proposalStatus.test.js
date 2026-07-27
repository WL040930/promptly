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
    for (const status of ['applied', 'rejected', 'superseded', 'stale']) {
        assert.equal(shouldShowProposalActions(status), false);
        assert.ok(proposalStatusLabel(status));
    }
});

test('canonical display labels remain terminal in the proposal widget', () => {
    assert.equal(proposalStatusLabel('applied'), 'Applied');
    assert.equal(isAcceptedProposalStatus('applied'), true);
    assert.equal(isRejectedProposalStatus('rejected'), true);
    assert.equal(isStaleProposalStatus('superseded'), true);
    assert.equal(shouldShowProposalActions('applied'), false);
});
