import test from 'node:test';
import assert from 'node:assert/strict';
import {
    supersedePendingChatFormProposals,
    supersedePendingFormChatProposals,
    supersedePendingWorkflowProposals
} from './proposalLifecycle.js';

const fakeMessage = fields => ({
    ...fields,
    async update(changes) {
        Object.assign(this, changes);
        return this;
    }
});

test('supersedePendingFormChatProposals disables every older pending proposal for the form', async () => {
    const messages = [
        fakeMessage({ id: 'old_1', threadId: 'thread_1', kind: 'form_proposal', proposalStatus: 'pending', payload: { status: 'pending', patches: [] } }),
        fakeMessage({ id: 'old_2', threadId: 'thread_1', kind: 'form_proposal', proposalStatus: 'accepted', payload: { status: 'accepted', patches: [] } }),
        fakeMessage({ id: 'old_3', threadId: 'thread_1', kind: 'form_proposal', proposalStatus: 'pending', payload: { status: 'pending', patches: [] } })
    ];

    const supersededMessageIds = await supersedePendingFormChatProposals({
        threadId: 'thread_1',
        messageModel: { findAll: async () => messages }
    });

    assert.deepEqual(supersededMessageIds, ['old_1', 'old_3']);
    assert.equal(messages[0].proposalStatus, 'superseded');
    assert.equal(messages[1].proposalStatus, 'accepted');
    assert.equal(messages[2].proposalStatus, 'superseded');
});

test('supersedePendingChatFormProposals only disables pending proposals for the same form', async () => {
    const messages = [
        fakeMessage({ id: 'same_form', payload: { formId: 'form_1' }, proposalStatus: 'pending' }),
        fakeMessage({ id: 'other_form', payload: { formId: 'form_2' }, proposalStatus: 'pending' }),
        fakeMessage({ id: 'new_form', payload: { formId: null }, proposalStatus: 'pending' })
    ];

    const supersededMessageIds = await supersedePendingChatFormProposals({
        threadId: 'thread_1',
        formId: 'form_1',
        messageModel: { findAll: async () => messages }
    });

    assert.deepEqual(supersededMessageIds, ['same_form']);
    assert.equal(messages[0].proposalStatus, 'superseded');
    assert.equal(messages[1].proposalStatus, 'pending');
    assert.equal(messages[2].proposalStatus, 'pending');
});

test('supersedePendingWorkflowProposals disables every older pending workflow proposal', async () => {
    const messages = [
        fakeMessage({ id: 'workflow_old_1', threadId: 'thread_1', kind: 'workflow_proposal', proposalStatus: 'pending', payload: {} }),
        fakeMessage({ id: 'form_pending', threadId: 'thread_1', kind: 'form_proposal', proposalStatus: 'pending', payload: {} }),
        fakeMessage({ id: 'workflow_old_2', threadId: 'thread_1', kind: 'workflow_proposal', proposalStatus: 'pending', payload: {} }),
        fakeMessage({ id: 'workflow_applied', threadId: 'thread_1', kind: 'workflow_proposal', proposalStatus: 'applied', payload: {} })
    ];

    const supersededMessageIds = await supersedePendingWorkflowProposals({
        threadId: 'thread_1',
        messageModel: { findAll: async () => messages }
    });

    assert.deepEqual(supersededMessageIds, ['workflow_old_1', 'workflow_old_2']);
    assert.equal(messages[0].proposalStatus, 'superseded');
    assert.equal(messages[1].proposalStatus, 'pending');
    assert.equal(messages[2].proposalStatus, 'superseded');
    assert.equal(messages[3].proposalStatus, 'applied');
});
