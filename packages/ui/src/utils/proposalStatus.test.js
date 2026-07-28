import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAcceptedProposalStatus,
    isRejectedProposalStatus,
    isStaleProposalStatus,
    markWorkflowProposalStale,
    markSupersededWorkflowProposals,
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

test('only the active workflow proposal remains actionable when a newer proposal arrives', () => {
    const messages = markSupersededWorkflowProposals([
        { id: 'proposal_old', kind: 'workflow_proposal', proposalStatus: 'pending' },
        { id: 'proposal_new', kind: 'workflow_proposal', proposalStatus: 'pending' },
        { id: 'form_pending', kind: 'form_proposal', proposalStatus: 'pending' },
        { id: 'proposal_applied', kind: 'workflow_proposal', proposalStatus: 'applied' }
    ], 'proposal_new');

    assert.equal(messages[0].proposalStatus, 'superseded');
    assert.equal(messages[1].proposalStatus, 'pending');
    assert.equal(messages[2].proposalStatus, 'pending');
    assert.equal(messages[3].proposalStatus, 'applied');
    assert.equal(shouldShowProposalActions(messages[0].proposalStatus), false);
    assert.equal(shouldShowProposalActions(messages[1].proposalStatus), true);
});

test('a workflow proposal becomes non-actionable immediately when its draft is stale', () => {
    const messages = markWorkflowProposalStale([
        { id: 'proposal_1', kind: 'workflow_proposal', proposalStatus: 'pending' },
        { id: 'proposal_2', kind: 'workflow_proposal', proposalStatus: 'pending' },
        { id: 'form_1', kind: 'form_proposal', proposalStatus: 'pending' }
    ], 'proposal_1');

    assert.equal(messages[0].proposalStatus, 'stale');
    assert.equal(shouldShowProposalActions(messages[0].proposalStatus), false);
    assert.equal(messages[1].proposalStatus, 'pending');
    assert.equal(messages[2].proposalStatus, 'pending');
});
