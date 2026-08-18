import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAcceptedProposalStatus,
    isRejectedProposalStatus,
    isStaleProposalStatus,
    markWorkflowProposalStale,
    markSupersededWorkflowProposals,
    proposalStatusLabel,
    proposalSectionExpansion,
    proposalStatusTone,
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

test('applied solution proposals start collapsed while pending proposals stay open', () => {
    assert.deepEqual(proposalSectionExpansion('applied'), { form: false, workflow: false });
    assert.deepEqual(proposalSectionExpansion('pending'), { form: true, workflow: true });
});

test('proposal terminal tones stay consistent across AI surfaces', () => {
    assert.equal(proposalStatusTone('applied').header, 'border-emerald-100 bg-emerald-50/70');
    assert.equal(proposalStatusTone('ignored').header, 'border-slate-200 bg-slate-50/80');
    assert.equal(proposalStatusTone('superseded').header, 'border-amber-100 bg-amber-50/70');
    assert.equal(proposalStatusTone('pending'), null);
});

test('legacy ignored proposal status is terminal and renders as ignored', () => {
    assert.equal(proposalStatusLabel('ignored'), 'Ignored');
    assert.equal(isRejectedProposalStatus('ignored'), true);
    assert.equal(shouldShowProposalActions('ignored'), false);
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
