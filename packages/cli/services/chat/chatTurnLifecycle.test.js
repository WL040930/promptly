import test from 'node:test';
import assert from 'node:assert/strict';
import {
    advanceChatTurn,
    attachChatTurnMessages,
    finishChatTurn,
    progressForChatEvent,
    reconcileStaleChatTurn,
    replaceChatSessionState,
    startChatTurn,
    workStatusForAssistantReply
} from './chatTurnLifecycle.js';

test('assistant reply kinds map to durable work statuses', () => {
    assert.equal(workStatusForAssistantReply({ kind: 'clarification' }), 'needs_input');
    assert.equal(workStatusForAssistantReply({ kind: 'solution_proposal' }), 'awaiting_review');
    assert.equal(workStatusForAssistantReply({ kind: 'text' }), 'completed');
    assert.equal(workStatusForAssistantReply({ kind: 'error', isError: true }), 'failed');
});

test('approval events promote Ask Promptly work into proposal presentation', () => {
    assert.equal(progressForChatEvent({ type: 'approval.required' }).outcomeKind, 'proposal');
    assert.equal(progressForChatEvent({
        type: 'approval.required',
        progress: { id: 'approval:custom', message: 'Review the generated changes.' }
    }).outcomeKind, 'proposal');
});

test('runtime step objects receive a readable progress label', () => {
    const progress = progressForChatEvent({
        type: 'step.started',
        step: { id: 'design_form', type: 'design_form', title: 'Prepare the form proposal' }
    });

    assert.equal(progress.label, 'Working on Prepare the form proposal');
    assert.equal(progress.id, 'step:design_form:1');
    assert.doesNotMatch(progress.label, /\[object Object\]/);
});

const createMemory = () => {
    const rows = [];
    const messageModel = {
        async create(value) {
            const row = {
                ...value,
                id: value.id || `message_${rows.length + 1}`,
                async update(patch) { Object.assign(this, patch); return this; }
            };
            rows.push(row);
            return row;
        },
        async findOne({ where }) {
            return rows.find(row => Object.entries(where || {}).every(([key, value]) => row[key] === value)) || null;
        }
    };
    const session = {
        id: 'session_1',
        state: { version: 1, phase: 'idle' },
        async update(patch) { Object.assign(this, patch); return this; }
    };
    return { session, messageModel, rows };
};

test('chat turn keeps provider liveness durable while legacy session state changes', async () => {
    const { session, messageModel, rows } = createMemory();
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    await startChatTurn({ session, requestId: 'turn_1', title: 'Create an onboarding workflow', now: () => startedAt });
    const attached = await attachChatTurnMessages({ session, requestId: 'turn_1', userMessageId: 'user_1', messageModel, now: () => startedAt });

    const afterWait = new Date('2026-01-01T00:00:10.000Z');
    const progress = await advanceChatTurn({
        session,
        requestId: 'turn_1',
        messageModel,
        now: () => afterWait,
        progress: {
            id: 'chat:attempt:1',
            status: 'awaiting_model',
            phase: 'draft',
            label: 'Drafting the response',
            detail: 'The AI model is still working (about 10 seconds so far).'
        }
    });

    await replaceChatSessionState(session, { status: 'awaiting_agent_approval', runId: 'run_1' });

    assert.equal(attached.messageId, rows[0].id);
    assert.equal(progress.messageId, rows[0].id);
    assert.equal(session.state.turn.status, 'processing');
    assert.equal(session.state.turn.lastActivityAt, afterWait.toISOString());
    assert.equal(session.state.status, 'awaiting_agent_approval');
    assert.equal(rows[0].payload.work.activities.at(-1).id, 'chat:attempt:1');
});

test('stale chat turn becomes a retryable persistent failure', async () => {
    const { session, messageModel, rows } = createMemory();
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    await startChatTurn({ session, requestId: 'turn_1', title: 'Create a contact form', now: () => startedAt });
    await attachChatTurnMessages({ session, requestId: 'turn_1', messageModel, now: () => startedAt });

    const recovered = await reconcileStaleChatTurn({
        session,
        messageModel,
        now: () => new Date('2026-01-01T00:02:01.000Z')
    });

    assert.equal(recovered, true);
    assert.equal(session.state.turn.status, 'failed');
    assert.equal(rows[0].payload.work.status, 'failed');
    assert.equal(rows[1].kind, 'error');
    assert.equal(rows[1].errorMetadata.code, 'ASK_PROMPTLY_TURN_STALLED');
    assert.deepEqual(session.state.lastTurn, {
        requestId: 'turn_1',
        status: 'failed',
        outcome: 'error',
        messageId: rows[0].id,
        completedAt: '2026-01-01T00:02:01.000Z'
    });
});

test('terminal chat outcomes persist a notification-friendly last turn', async () => {
    const { session, messageModel } = createMemory();
    const finishedAt = new Date('2026-01-01T00:00:05.000Z');
    await startChatTurn({ session, requestId: 'turn_2', now: () => new Date('2026-01-01T00:00:00.000Z') });
    await attachChatTurnMessages({ session, requestId: 'turn_2', messageModel, now: () => new Date('2026-01-01T00:00:00.000Z') });
    await finishChatTurn({ session, requestId: 'turn_2', kind: 'clarification', detail: 'Choose a form', now: () => finishedAt, messageModel });

    assert.equal(session.state.lastTurn.requestId, 'turn_2');
    assert.equal(session.state.lastTurn.status, 'completed');
    assert.equal(session.state.lastTurn.outcome, 'clarification');
    assert.equal(session.state.lastTurn.completedAt, finishedAt.toISOString());
});
