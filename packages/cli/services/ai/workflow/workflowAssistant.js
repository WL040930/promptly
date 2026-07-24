import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../../db/index.js';
import { AssistantMessage, AssistantThread, Form, Workflow } from '../../../models/index.js';
import { createAssistantStateView, ensureAssistantThread } from '../../assistant/assistantStore.js';
import { saveAutomationDraft } from '../../automations/automationService.js';
import { runWorkflowTurn } from '../workflowAIService.js';
import { normalizeWorkflowCommand, resolveWorkflowTurnContext } from './domain/workflowTurnContext.js';

const DEFAULT_MODE = 'important_only';
const MAX_HISTORY = 100;
const AI_CONTEXT_HISTORY = 30;
const IN_FLIGHT_TIMEOUT_MS = 10 * 60 * 1000;

const errorWith = (code, message, status = 400, details = {}) => {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    Object.assign(error, details);
    return error;
};

const publicState = state => state ? {
    workflowId: state.workflowId,
    version: state.version,
    phase: state.phase,
    mode: state.mode,
    activeWork: state.activeWork || null,
    openClarification: state.openClarification || null,
    activeProposalMessageId: state.activeProposalMessageId || null,
    inFlightRequestId: state.inFlightRequestId || null,
    inFlightStartedAt: state.inFlightStartedAt || null
} : null;

const publicMessage = message => {
    const value = message?.toJSON ? message.toJSON() : message;
    return {
        id: value.id,
        sender: value.sender,
        text: value.text,
        createdAt: value.createdAt,
        kind: value.kind || 'text',
        payload: value.payload || null,
        proposalStatus: value.proposalStatus || null,
        tokenUsage: value.tokenUsage || null,
        errorMetadata: value.errorMetadata || null,
        isError: value.isError === true
    };
};

const messageId = () => `wmsg_${crypto.randomUUID().replace(/-/g, '')}`;

const findWorkflow = async (workflowId, userId, options = {}) => {
    const workflow = await Workflow.findOne({ where: { id: workflowId, userId }, ...options });
    if (!workflow) throw errorWith('WORKFLOW_NOT_FOUND', 'Workflow not found.', 404);
    return workflow;
};

const ensureState = async ({ workflow, transaction }) => {
    const thread = await ensureAssistantThread({
        surface: 'workflow',
        workflowId: workflow.id,
        userId: workflow.userId,
        title: workflow.name || 'Workflow AI',
        models: { AssistantThread },
        transaction,
        lock: Boolean(transaction?.LOCK?.UPDATE)
    });
    return createAssistantStateView(thread);
};

const replyFor = (text, payload = null, kind = 'text') => ({
    id: messageId(),
    sender: 'bot',
    text,
    kind,
    ...(payload ? { payload } : {})
});

const attachedForm = async (workflow, userId, transaction) => {
    const trigger = (workflow.nodes || []).find(node => node?.subType === 'form-submission');
    const formId = trigger?.config?.formId;
    if (!formId) return null;
    return Form.findOne({ where: { id: formId, userId }, transaction });
};

const messageFromResult = ({ result, workflow }) => {
    if (result.kind === 'proposal') {
        return replyFor(result.message, {
            workflowId: workflow.id,
            baseWorkflowRevision: workflow.revision,
            requirements: result.requirements,
            capabilities: result.capabilities,
            nodes: result.nodes,
            edges: result.edges,
            operations: result.operations,
            diff: result.diff,
            readiness: result.readiness,
            verification: result.verification,
            warnings: result.warnings || [],
            plan: result.plan || []
        }, 'workflow_proposal');
    }
    if (result.kind === 'clarification') {
        return replyFor(result.message, {
            clarificationId: messageId(),
            inputs: result.inputs || [],
            allowDecide: true
        }, 'clarification');
    }
    return replyFor(result.message || result.text || 'I could not find a safe workflow change to make.');
};

const compactOwnedForms = forms => forms.map(form => ({
    id: form.id,
    title: form.title,
    respondentEmailFieldId: form.respondentEmailFieldId || form.settings?.respondentEmailFieldId || null,
    fields: (form.fields || []).slice(0, 30).map(field => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required === true
    }))
}));

const toWorkflowJson = workflow => workflow?.toJSON ? workflow.toJSON() : workflow;

export const workflowAssistant = {
    async getHistory({ workflowId, userId, limit = 50, before = null }) {
        const workflow = await findWorkflow(workflowId, userId);
        return sequelize.transaction(async transaction => {
            const state = await ensureState({ workflow, transaction });
            const where = { threadId: state.threadId };
            if (before) {
                const cursor = await AssistantMessage.findOne({ where: { id: before, threadId: state.threadId }, transaction });
                if (cursor) where.createdAt = { [Op.lt]: cursor.createdAt };
            }
            const messages = await AssistantMessage.findAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY),
                transaction
            });
            return {
                messages: messages.reverse().map(publicMessage),
                nextBefore: messages.length >= Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY) ? messages[0]?.id || null : null,
                state: publicState(state)
            };
        });
    },

    async submitTurn({ workflowId, userId, command, text, clarificationMode = DEFAULT_MODE, expectedStateVersion, requestId, onProgress }) {
        const workflow = await findWorkflow(workflowId, userId);
        const normalizedCommand = normalizeWorkflowCommand({ command, text });
        if (normalizedCommand.type === 'submit_text' && !normalizedCommand.text) {
            throw errorWith('WORKFLOW_AI_INPUT_REQUIRED', 'Please describe a workflow change.', 400);
        }
        const displayText = normalizedCommand.type === 'decide_for_me'
            ? 'Use sensible defaults.'
            : normalizedCommand.text;
        const runId = requestId || `wturn_${crypto.randomUUID().replace(/-/g, '')}`;
        let started = false;
        let reservation = null;

        try {
            await sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'This workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                }
                if (state.inFlightRequestId && state.inFlightStartedAt) {
                    const age = Date.now() - new Date(state.inFlightStartedAt).getTime();
                    if (age < IN_FLIGHT_TIMEOUT_MS && state.inFlightRequestId !== runId) {
                        throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'This workflow assistant is already processing a request.', 409, { currentStateVersion: state.version });
                    }
                } else if (state.phase === 'processing' && state.inFlightRequestId !== runId) {
                    throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'This workflow assistant is already processing a request.', 409, { currentStateVersion: state.version });
                }
                const pending = state.activeProposalMessageId
                    ? await AssistantMessage.findOne({
                        where: { id: state.activeProposalMessageId, threadId: state.threadId },
                        transaction
                    })
                    : null;
                const context = resolveWorkflowTurnContext({
                    command: normalizedCommand,
                    activeWork: state.activeWork,
                    clarification: state.openClarification,
                    pendingProposal: pending ? publicMessage(pending) : null,
                    clarificationMode
                });
                const message = await AssistantMessage.create({
                    id: messageId(), threadId: state.threadId, sender: 'user', text: displayText, kind: 'text'
                }, { transaction });
                await state.update({
                    version: state.version + 1,
                    phase: 'processing',
                    mode: clarificationMode || state.mode || DEFAULT_MODE,
                    inFlightRequestId: runId,
                    inFlightStartedAt: new Date(),
                    openClarification: null
                }, { transaction });
                started = true;
                reservation = { state, pending, context, userMessage: message };
            });

            const rawHistory = await AssistantMessage.findAll({
                where: { threadId: reservation.state.threadId },
                order: [['createdAt', 'DESC']],
                limit: AI_CONTEXT_HISTORY + 2
            });
            const history = rawHistory.reverse()
                .filter(message => message.id !== reservation.userMessage.id)
                .map(publicMessage);
            const form = await attachedForm(workflow, userId);
            const ownedForms = await Form.findAll({ where: { userId }, order: [['updatedAt', 'DESC']] });
            const request = reservation.context.command.type === 'decide_for_me'
                ? `Resolve the active workflow request using sensible defaults. Active request: ${reservation.context.intent.sourceText || 'the current workflow request'}`
                : reservation.context.command.text;
            const result = await runWorkflowTurn({
                request,
                currentWorkflow: toWorkflowJson(workflow),
                history,
                pendingProposal: reservation.pending && reservation.context.pendingProposal.mode === 'include'
                    ? publicMessage(reservation.pending)
                    : null,
                clarificationMode,
                turnContext: reservation.context.intent,
                userId,
                userContext: { forms: compactOwnedForms(ownedForms) },
                formSchema: form?.toJSON?.() || null,
                formLoader: async ({ formId }) => {
                    const selected = await Form.findOne({ where: { id: formId, userId } });
                    return selected?.toJSON?.() || null;
                },
                onProgress
            });
            const reply = messageFromResult({ result, workflow });
            reply.tokenUsage = result.tokenUsage || null;
            return sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                let activeProposalMessageId = null;
                if (reply.kind === 'workflow_proposal') activeProposalMessageId = reply.id;
                const botMessage = await AssistantMessage.create({
                    ...reply,
                    threadId: state.threadId,
                    proposalStatus: reply.kind === 'workflow_proposal' ? 'pending' : null
                }, { transaction });
                if (activeProposalMessageId && state.activeProposalMessageId) {
                    await AssistantMessage.update(
                        { proposalStatus: 'superseded' },
                        { where: { id: state.activeProposalMessageId, threadId: state.threadId }, transaction }
                    );
                }
                await state.update({
                    version: state.version + 1,
                    phase: reply.kind === 'clarification' ? 'awaiting_clarification' : reply.kind === 'workflow_proposal' ? 'awaiting_proposal' : 'idle',
                    activeWork: reply.kind === 'clarification'
                        ? {
                            sourceText: reservation.context.intent.sourceText || request,
                            requestId: runId,
                            relationToPending: reservation.context.intent.relationToPending,
                            updatedAt: new Date().toISOString()
                        }
                        : null,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    activeProposalMessageId,
                    openClarification: reply.kind === 'clarification' ? reply.payload || null : null
                }, { transaction });
                return {
                    userMsg: publicMessage(reservation.userMessage),
                    botMsg: publicMessage(botMessage),
                    state: publicState(state)
                };
            });
        } catch (error) {
            if (!started) throw error;
            const errorMessage = replyFor(error.message || 'I could not prepare a safe workflow proposal.', {
                code: error.code || 'WORKFLOW_AI_FAILED',
                retryable: error.status >= 500 || error.code === 'AI_PROVIDER_TIMEOUT'
            }, 'error');
            await sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (!state || state.inFlightRequestId !== runId) return;
                const botMessage = await AssistantMessage.create({
                    ...errorMessage,
                    threadId: state.threadId,
                    isError: true,
                    errorMetadata: errorMessage.payload
                }, { transaction });
                await state.update({
                    version: state.version + 1,
                    phase: 'idle',
                    activeWork: null,
                    inFlightRequestId: null,
                    inFlightStartedAt: null
                }, { transaction });
                error.workflowAssistantMessage = botMessage;
            });
            throw error;
        }
    },

    async clearChat({ workflowId, userId }) {
        return sequelize.transaction(async transaction => {
            const workflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
            const state = await ensureState({ workflow, transaction });
            if (state.inFlightRequestId) {
                throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'The workflow AI is still processing a request. Wait for it to finish before clearing the chat.', 409);
            }

            const deletedMessages = await AssistantMessage.destroy({ where: { threadId: state.threadId }, transaction });

            await state.update({
                version: state.version + 1,
                phase: 'idle',
                activeWork: null,
                openClarification: null,
                activeProposalMessageId: null,
                inFlightRequestId: null,
                inFlightStartedAt: null,
            }, { transaction });
            return {
                cleared: true,
                deletedMessages,
                state: publicState(state)
            };
        });
    },

    async decideProposal({ workflowId, userId, proposalMessageId, action = 'accept', expectedStateVersion }) {
        const workflow = await findWorkflow(workflowId, userId);
        const message = await AssistantMessage.findOne({ where: { id: proposalMessageId, kind: 'workflow_proposal' }, include: [{ model: AssistantThread, as: 'thread', where: { surface: 'workflow', workflowId, userId } }] });
        if (!message) throw errorWith('WORKFLOW_PROPOSAL_NOT_FOUND', 'Workflow proposal not found.', 404);
        if (message.proposalStatus !== 'pending') throw errorWith('WORKFLOW_PROPOSAL_NOT_PENDING', 'This workflow proposal is no longer pending.', 409);
        const payload = message.payload || {};

        if (action === 'reject') {
            return sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'The workflow assistant changed in another tab. Refresh and try again.', 409, { currentStateVersion: state.version });
                }
                await message.update({ proposalStatus: 'ignored' }, { transaction });
                await state.update({ version: state.version + 1, activeProposalMessageId: state.activeProposalMessageId === message.id ? null : state.activeProposalMessageId }, { transaction });
                return { message: publicMessage(message), state: publicState(state) };
            });
        }

        if (payload.workflowId !== workflow.id) throw errorWith('WORKFLOW_PROPOSAL_SCOPE_INVALID', 'This proposal belongs to a different workflow.', 409);
        try {
            return await sequelize.transaction(async transaction => {
                const lockedWorkflow = await findWorkflow(workflowId, userId, { transaction, lock: transaction.LOCK.UPDATE });
                const lockedMessage = await AssistantMessage.findOne({
                    where: { id: proposalMessageId, threadId: (await ensureState({ workflow: lockedWorkflow, transaction })).threadId, kind: 'workflow_proposal' },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!lockedMessage || lockedMessage.proposalStatus !== 'pending') {
                    throw errorWith('WORKFLOW_PROPOSAL_NOT_PENDING', 'This workflow proposal is no longer pending.', 409);
                }
                const state = await ensureState({ workflow: lockedWorkflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'The workflow assistant changed in another tab. Refresh and try again.', 409, { currentStateVersion: state.version });
                }
                if (Number(payload.baseWorkflowRevision) !== Number(lockedWorkflow.revision)) {
                    throw errorWith('WORKFLOW_PROPOSAL_STALE', 'This workflow changed after the proposal was prepared. Generate a new proposal.', 409);
                }
                const saved = await saveAutomationDraft({
                    automationId: lockedWorkflow.id,
                    userId,
                    nodes: payload.nodes,
                    edges: payload.edges,
                    expectedRevision: payload.baseWorkflowRevision,
                    source: 'ai',
                    summary: 'Applied workflow AI proposal',
                    transaction
                });
                await lockedMessage.update({ proposalStatus: 'applied' }, { transaction });
                await state.update({ version: state.version + 1, activeProposalMessageId: state.activeProposalMessageId === lockedMessage.id ? null : state.activeProposalMessageId }, { transaction });
                return { workflow: toWorkflowJson(saved.automation), message: publicMessage(lockedMessage), state: publicState(state) };
            });
        } catch (error) {
            if (error.code === 'WORKFLOW_PROPOSAL_STALE') {
                await message.update({ proposalStatus: 'stale' }).catch(() => {});
            }
            throw error;
        }
    }
};

export const workflowAssistantInternals = {
    publicMessage,
    publicState,
    ensureState,
    normalizeWorkflowCommand,
    resolveWorkflowTurnContext
};
