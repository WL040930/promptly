import crypto from 'node:crypto';
import sequelize from '../../db/index.js';
import { AssistantMessage, AssistantThread } from '../../models/assistant/index.js';

export const DEFAULT_ASSISTANT_STATE = Object.freeze({
    version: 1,
    phase: 'idle',
    mode: 'important_only',
    activeWork: null,
    openClarification: null,
    activeProposalMessageId: null,
    inFlightRequestId: null,
    inFlightStartedAt: null,
    inFlightLastActivityAt: null,
    progress: null,
    lastTurn: null
});

const cloneState = state => ({ ...DEFAULT_ASSISTANT_STATE, ...(state || {}) });
const makeId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

export const stateForThread = thread => cloneState(thread?.state);

export const publicStateForThread = thread => ({
    threadId: thread?.id || null,
    userId: thread?.userId || null,
    surface: thread?.surface || null,
    formId: thread?.formId || null,
    workflowId: thread?.workflowId || null,
    resourceBrief: thread?.context?.resourceBrief || null,
    ...stateForThread(thread)
});

export const createAssistantStateView = thread => {
    const view = {
        get id() { return thread.id; },
        get threadId() { return thread.id; },
        get userId() { return thread.userId; },
        get formId() { return thread.formId; },
        get workflowId() { return thread.workflowId; },
        get surface() { return thread.surface; },
        get version() { return stateForThread(thread).version; },
        get phase() { return stateForThread(thread).phase; },
        get mode() { return stateForThread(thread).mode; },
        get activeWork() { return stateForThread(thread).activeWork; },
        get openClarification() { return stateForThread(thread).openClarification; },
        get activeProposalMessageId() { return stateForThread(thread).activeProposalMessageId; },
        get inFlightRequestId() { return stateForThread(thread).inFlightRequestId; },
        get inFlightStartedAt() { return stateForThread(thread).inFlightStartedAt; },
        get inFlightLastActivityAt() { return stateForThread(thread).inFlightLastActivityAt; },
        get progress() { return stateForThread(thread).progress; },
        get lastTurn() { return stateForThread(thread).lastTurn; },
        get context() { return thread.context || {}; },
        async update(updates = {}, options = {}) {
            const current = stateForThread(thread);
            const next = { ...current };
            for (const key of Object.keys(next)) {
                if (Object.prototype.hasOwnProperty.call(updates, key)) next[key] = updates[key];
            }
            if (!Object.prototype.hasOwnProperty.call(updates, 'version')) next.version += 1;
            await thread.update({ state: next }, options);
            return view;
        },
        async updateContext(context = {}, options = {}) {
            await thread.update({ context }, options);
            return view;
        },
        toJSON() {
            return publicStateForThread(thread);
        }
    };
    return view;
};

export const ensureAssistantThread = async ({
    surface,
    userId,
    formId = null,
    workflowId = null,
    title = 'New Chat',
    models = { AssistantThread },
    transaction,
    lock = true
} = {}) => {
    const where = { userId, surface };
    if (surface === 'form') where.formId = formId;
    if (surface === 'workflow') where.workflowId = workflowId;
    const lockOptions = lock && transaction?.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {};
    let thread = await models.AssistantThread.findOne({ where, transaction, ...lockOptions });
    if (!thread) {
        thread = await models.AssistantThread.create({
            ...where,
            formId: surface === 'form' ? formId : null,
            workflowId: surface === 'workflow' ? workflowId : null,
            title,
            context: {},
            state: { ...DEFAULT_ASSISTANT_STATE }
        }, { transaction });
    }
    return thread;
};

export const createAssistantMessage = ({
    threadId,
    sender,
    text,
    kind = 'text',
    payload = null,
    proposalStatus = null,
    tokenUsage = null,
    errorMetadata = null,
    isError = false,
    models = { AssistantMessage },
    transaction,
    id = makeId('amsg')
} = {}) => models.AssistantMessage.create({
    id,
    threadId,
    sender,
    text,
    kind,
    payload,
    proposalStatus,
    tokenUsage,
    errorMetadata,
    isError
}, { transaction });

export const assistantMessageToJSON = message => {
    const value = message?.toJSON ? message.toJSON() : message;
    if (!value) return null;
    const payload = value.payload || null;
    return {
        ...value,
        proposal: value.kind === 'form_proposal' ? payload : undefined,
        options: value.kind === 'clarification' ? payload : undefined
    };
};

export const assistantStore = {
    ensureAssistantThread,
    createAssistantMessage,
    createAssistantStateView,
    stateForThread,
    publicStateForThread,
    assistantMessageToJSON,
    sequelize
};

export default assistantStore;
