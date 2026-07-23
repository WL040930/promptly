import test from 'node:test';
import assert from 'node:assert/strict';
import {
    supersedePendingChatFormProposals,
    supersedePendingFormChatProposals
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
    assert.equal(messages[0].payload.status, 'superseded');
    assert.equal(messages[1].payload.status, 'accepted');
    assert.equal(messages[2].payload.status, 'superseded');
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
