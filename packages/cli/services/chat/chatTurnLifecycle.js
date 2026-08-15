import { AssistantMessage } from '../../models/index.js';
import { advanceAssistantWork, createAssistantWork, finishAssistantWork } from '../../../shared/assistantWork.js';
import { buildAssistantRecovery } from '../../../shared/assistantRecovery.js';
import { isAssistantTurnStale } from '../assistant/assistantTurnLiveness.js';
import { outcomeForAssistantMessage } from '../../../shared/assistantTurnNotification.js';

const toIso = value => (value instanceof Date ? value : new Date(value)).toISOString();
const nowDate = () => new Date();
const activeTurn = session => session?.state?.turn || null;

export const workStatusForAssistantReply = ({ kind = null, isError = false, status = null } = {}) => {
    const outcome = outcomeForAssistantMessage({ kind, status, isError });
    if (outcome === 'error') return 'failed';
    if (outcome === 'clarification') return 'needs_input';
    if (outcome === 'proposal') return 'awaiting_review';
    return status === 'failed' ? 'failed' : 'completed';
};

const updateState = async (session, state, options = {}) => {
    await session.update({ state }, options);
    return state;
};

/** Merge an Ask Promptly legacy state update without losing its durable turn. */
export const mergeChatSessionState = async (session, patch = {}, options = {}) => {
    const next = { ...(session.state || {}), ...(patch || {}) };
    return updateState(session, next, options);
};

/**
 * Existing coordinator code historically replaced the whole session state.
 * Keep that behavior for its own keys while preserving `state.turn`.
 */
export const replaceChatSessionState = async (session, nextState = {}, options = {}) => {
    const turn = activeTurn(session);
    return updateState(session, {
        ...(nextState || {}),
        ...(turn ? { turn } : {})
    }, options);
};

export const clearChatSessionState = async (session, options = {}) => replaceChatSessionState(session, {}, options);

export const chatTurnSnapshot = session => activeTurn(session);
export const isChatTurnProcessing = session => activeTurn(session)?.status === 'processing';

export const startChatTurn = async ({ session, requestId, title = 'Preparing your request', now = nowDate } = {}) => {
    if (!session?.id) throw new Error('A chat session is required.');
    const existing = activeTurn(session);
    if (existing?.status === 'processing') {
        const error = new Error('This Ask Promptly conversation is already processing a request.');
        error.code = existing.requestId === requestId ? 'ASSISTANT_TURN_ALREADY_RUNNING' : 'ASSISTANT_TURN_IN_PROGRESS';
        error.status = 409;
        error.requestId = existing.requestId;
        throw error;
    }

    const startedAt = toIso(now());
    const turn = {
        requestId,
        status: 'processing',
        title: String(title || 'Preparing your request').trim() || 'Preparing your request',
        userMessageId: null,
        workMessageId: null,
        startedAt,
        lastActivityAt: startedAt,
        completedAt: null,
        progress: {
            id: 'turn:started',
            status: 'starting',
            phase: 'understand',
            label: 'Preparing your request',
            detail: 'Saved your request and preparing the workspace context.',
            updatedAt: startedAt
        }
    };
    await mergeChatSessionState(session, { turn });
    return turn;
};

export const attachChatTurnMessages = async ({
    session,
    requestId,
    userMessageId = null,
    messageModel = AssistantMessage,
    now = nowDate
} = {}) => {
    const turn = activeTurn(session);
    if (!turn || turn.requestId !== requestId || turn.status !== 'processing') return null;

    const work = createAssistantWork({
        requestId,
        surface: 'ask_promptly',
        title: turn.title,
        now: now()
    });
    const workMessage = await messageModel.create({
        threadId: session.id,
        sender: 'bot',
        text: 'Preparing your request',
        kind: 'assistant_work',
        payload: { work }
    });
    const timestamp = toIso(now());
    const progress = {
        ...turn.progress,
        updatedAt: timestamp
    };
    const nextTurn = {
        ...turn,
        userMessageId: userMessageId || null,
        workMessageId: workMessage.id,
        lastActivityAt: timestamp,
        progress
    };
    await mergeChatSessionState(session, { turn: nextTurn });
    return { ...progress, work, messageId: workMessage.id };
};

export const advanceChatTurn = async ({
    session,
    requestId,
    progress = {},
    messageModel = AssistantMessage,
    now = nowDate
} = {}) => {
    const turn = activeTurn(session);
    if (!turn || turn.requestId !== requestId || turn.status !== 'processing') return null;

    const timestamp = toIso(now());
    const snapshot = {
        status: String(progress.status || 'working'),
        message: String(progress.message || progress.detail || 'Promptly is working on this request.'),
        ...(progress.id ? { id: String(progress.id) } : {}),
        ...(progress.phase ? { phase: progress.phase } : {}),
        ...(progress.label ? { label: String(progress.label) } : {}),
        ...(progress.detail ? { detail: String(progress.detail) } : {}),
        ...(Number.isInteger(progress.attempt) ? { attempt: progress.attempt } : {}),
        ...(progress.outcomeKind ? { outcomeKind: progress.outcomeKind } : {}),
        updatedAt: timestamp
    };
    let work = null;
    if (turn.workMessageId) {
        const workMessage = await messageModel.findOne({ where: { id: turn.workMessageId, threadId: session.id } });
        if (workMessage) {
            work = advanceAssistantWork(workMessage.payload?.work, snapshot, now());
            await workMessage.update({ payload: { ...(workMessage.payload || {}), work } });
        }
    }
    const nextTurn = { ...turn, lastActivityAt: timestamp, progress: snapshot };
    await mergeChatSessionState(session, { turn: nextTurn });
    return { ...snapshot, work, messageId: turn.workMessageId || null };
};

export const finishChatTurn = async ({
    session,
    requestId,
    status = 'completed',
    detail = '',
    outcome = null,
    messageId = null,
    kind = null,
    isError = false,
    errorMetadata = null,
    messageModel = AssistantMessage,
    now = nowDate
} = {}) => {
    const turn = activeTurn(session);
    if (!turn || turn.requestId !== requestId || turn.status !== 'processing') return null;

    const timestamp = toIso(now());
    let work = null;
    if (turn.workMessageId) {
        const workMessage = await messageModel.findOne({ where: { id: turn.workMessageId, threadId: session.id } });
        if (workMessage) {
            work = finishAssistantWork(workMessage.payload?.work, { status, detail }, now());
            await workMessage.update({
                text: detail || workMessage.text,
                kind: 'assistant_work',
                payload: { ...(workMessage.payload || {}), work }
            });
        }
    }
    const nextTurn = {
        ...turn,
        status,
        lastActivityAt: timestamp,
        completedAt: timestamp,
        progress: { ...(turn.progress || {}), status, detail: detail || turn.progress?.detail || '', updatedAt: timestamp },
        ...(errorMetadata ? { errorMetadata } : {})
    };
    await mergeChatSessionState(session, {
        turn: nextTurn,
        lastTurn: {
            requestId,
            status,
            outcome: outcomeForAssistantMessage({ outcome, kind, status, isError }),
            messageId: messageId || turn.workMessageId || null,
            completedAt: timestamp
        }
    });
    return { turn: nextTurn, work, messageId: turn.workMessageId || null };
};

export const failChatTurn = async ({
    session,
    requestId,
    code = 'ASSISTANT_TURN_FAILED',
    message = 'Assistant turn failed.',
    messageModel = AssistantMessage,
    now = nowDate,
    createFailureMessage = true
} = {}) => {
    const turn = activeTurn(session);
    if (!turn || turn.requestId !== requestId || turn.status !== 'processing') return null;

    const recovery = buildAssistantRecovery({
        surface: 'assistant',
        code,
        context: { retryText: turn.title }
    });
    const errorMetadata = { code, retryable: recovery.retryable, recovery };
    const finished = await finishChatTurn({
        session,
        requestId,
        status: 'failed',
        detail: recovery.summary || message,
        outcome: 'error',
        errorMetadata,
        messageModel,
        now
    });
    let failureMessage = null;
    if (createFailureMessage) {
        failureMessage = await messageModel.create({
            threadId: session.id,
            sender: 'bot',
            text: recovery.summary || message,
            kind: 'error',
            payload: errorMetadata,
            isError: true,
            errorMetadata
        });
    }
    return { ...finished, recovery, errorMetadata, failureMessage };
};

export const reconcileStaleChatTurn = async ({ session, messageModel = AssistantMessage, now = nowDate } = {}) => {
    const turn = activeTurn(session);
    if (!turn || turn.status !== 'processing') return false;
    const stale = isAssistantTurnStale({
        phase: 'processing',
        inFlightRequestId: turn.requestId,
        inFlightStartedAt: turn.startedAt,
        inFlightLastActivityAt: turn.lastActivityAt,
        progress: turn.progress
    }, { now: now().getTime() });
    if (!stale) return false;
    await failChatTurn({
        session,
        requestId: turn.requestId,
        code: 'ASK_PROMPTLY_TURN_STALLED',
        message: 'The previous Ask Promptly request stopped responding.',
        messageModel,
        now
    });
    return true;
};

const phaseForOperation = operation => /plan|intent|research/.test(String(operation || '')) ? 'plan' : 'draft';
const stepLabelForProgress = step => {
    const value = typeof step === 'string'
        ? step
        : step?.title || step?.description || step?.stepKey || step?.type || step?.id || 'the next step';
    return String(value).replace(/_/g, ' ').trim() || 'the next step';
};
const stepIdForProgress = step => {
    const value = typeof step === 'string' ? step : step?.id || step?.stepKey || step?.type || 'respond';
    return String(value).trim() || 'respond';
};

/** Convert runtime events into persisted user-visible work without treating heartbeats as progress. */
export const progressForChatEvent = event => {
    if (!event || event.type === 'turn.heartbeat') return null;
    if (event.type === 'approval.required') {
        return {
            ...(event.progress && typeof event.progress === 'object' ? event.progress : {}),
            id: event.progress?.id || 'approval:required',
            status: event.progress?.status || 'awaiting_review',
            phase: event.progress?.phase || 'check',
            label: event.progress?.label || 'Prepared a proposal for review',
            message: event.progress?.message || 'Your review is needed',
            detail: event.progress?.detail || 'The requested changes are ready for you to review.',
            outcomeKind: 'proposal'
        };
    }
    if (event.progress && typeof event.progress === 'object') return event.progress;

    if (event.type === 'provider_attempt' || event.type === 'provider_waiting') {
        const phase = phaseForOperation(event.operation);
        const elapsedSeconds = Math.max(1, Math.round((event.elapsedMs || 0) / 1000));
        return {
            id: `${event.operation}:attempt:${event.attempt}`,
            status: 'awaiting_model',
            phase,
            attempt: event.attempt,
            label: phase === 'plan' ? 'Preparing the request plan' : 'Drafting the response',
            message: event.type === 'provider_waiting' ? 'AI is still working on this step' : 'AI is working on this step',
            detail: event.type === 'provider_waiting'
                ? `The AI model is still working (about ${elapsedSeconds} seconds so far).`
                : `Attempt ${event.attempt} of ${event.maxAttempts}.`
        };
    }
    if (event.type === 'provider_fallback') {
        return {
            id: `${event.operation}:fallback:${event.attempt}`,
            status: 'retrying',
            phase: phaseForOperation(event.operation),
            label: 'Trying another AI route',
            message: 'Retrying with another available AI route',
            detail: 'The first route did not finish in time, so Promptly is continuing automatically.'
        };
    }
    if (event.type === 'turn.routed') return {
        id: 'turn:routed', status: 'planning', phase: 'understand', label: 'Understanding your request',
        message: 'Choosing the right workspace path', detail: event.route === 'coordination' ? 'Coordinating the form and workflow specialists.' : 'Preparing a direct answer.'
    };
    if (event.type === 'run.started') return {
        id: `run:${event.runId || 'started'}`, status: 'working', phase: 'plan', label: 'Planning the workspace task',
        message: 'Preparing the task plan', detail: 'Checking the requested form, workflow, and available capabilities.'
    };
    if (event.type === 'step.started' || event.type === 'assistant_step_started') return {
        id: `step:${stepIdForProgress(event.step)}:${event.attempt || 1}`, status: 'working', phase: 'draft',
        label: event.step ? `Working on ${stepLabelForProgress(event.step)}` : 'Drafting the response',
        message: 'Working on the next step', detail: 'Promptly is progressing through the request.'
    };
    if (event.type === 'plan.ready' || event.type === 'plan.revised') return {
        id: event.type, status: 'working', phase: 'plan', label: event.type === 'plan.revised' ? 'Adjusted the plan' : 'Prepared the plan',
        message: 'Planning is complete', detail: event.type === 'plan.revised' ? 'Adjusted the plan after checking the workspace.' : 'Moving from planning into the requested work.'
    };
    return null;
};
