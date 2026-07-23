import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../../db/index.js';
import {
    ChatMessage,
    ChatSession,
    Form,
    Workflow,
    WorkflowAIState,
    WorkflowChatMessage
} from '../../../models/index.js';
import { saveAutomationDraft } from '../../automations/automationService.js';
import NodeRegistry from '../../../utils/NodeRegistry.js';
import {
    classifyRequest,
    compactWorkflowSnapshot,
    loadWorkflowResourceContext,
    patchWorkflow,
    requiredCapabilitiesForRequest
} from './workflowAgentService.js';

const DEFAULT_MODE = 'important_only';
const MAX_HISTORY = 100;

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

const migrateLegacyConversation = async ({ workflow, state, transaction }) => {
    if (state.legacyImported) return state;

    const legacySession = await ChatSession.findOne({
        where: {
            userId: workflow.userId,
            automationId: workflow.id,
            purpose: 'automation_edit'
        },
        order: [['updatedAt', 'DESC']],
        transaction
    });

    if (legacySession) {
        const messages = await ChatMessage.findAll({
            where: { sessionId: legacySession.id },
            order: [['createdAt', 'ASC']],
            transaction
        });
        for (const message of messages) {
            await WorkflowChatMessage.findOrCreate({
                where: { sourceMessageId: message.id },
                defaults: {
                    id: messageId(),
                    workflowId: workflow.id,
                    sender: message.sender,
                    text: message.text,
                    kind: message.kind || 'text',
                    payload: message.payload || null,
                    proposalStatus: message.proposalStatus || null,
                    tokenUsage: message.tokenUsage || null,
                    createdAt: message.createdAt,
                    updatedAt: message.updatedAt,
                    sourceMessageId: message.id
                },
                transaction
            });
        }
    }

    await state.update({
        legacyImported: true,
        legacySessionId: legacySession?.id || null
    }, { transaction });
    return state;
};

const ensureState = async ({ workflow, transaction, migrate = true }) => {
    const [created] = await WorkflowAIState.findOrCreate({
        where: { workflowId: workflow.id },
        defaults: { workflowId: workflow.id, version: 1, mode: DEFAULT_MODE, phase: 'idle' },
        transaction
    });
    const state = await WorkflowAIState.findOne({
        where: { workflowId: workflow.id },
        transaction,
        lock: transaction?.LOCK?.UPDATE
    }) || created;
    return migrate ? migrateLegacyConversation({ workflow, state, transaction }) : state;
};

const normalizeInput = (command, text) => {
    if (typeof text === 'string' && text.trim()) return text.trim();
    if (typeof command === 'string' && command.trim()) return command.trim();
    if (command?.type === 'submit_text' && typeof command.text === 'string') return command.text.trim();
    return '';
};

const isGreeting = text => /^(?:hi|hello|hey|who are you|what can you do|help)\s*[!?.,]*$/i.test(String(text || '').trim());

const isOutOfScope = text => {
    const value = String(text || '').toLowerCase();
    if (/\b(?:another|different|new)\s+(?:workflow|automation)\b/.test(value)) return true;
    if (/\b(?:create|edit|modify|delete|duplicate|change)\s+(?:a\s+)?(?:the\s+|my\s+|new\s+)?form\b/.test(value)) return true;
    return false;
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

const specsForWorkflow = ({ workflow, classification }) => {
    const existingKeys = (workflow.nodes || []).map(node => node.nodeKey || `${node.type}:${node.subType}`);
    return NodeRegistry.getSchemasFor([
        ...existingKeys,
        ...(classification?.selectedNodeKeys || [])
    ]);
};

const summarizeProposal = diff => {
    const added = diff?.addedNodes?.length || 0;
    const updated = diff?.updatedNodes?.length || 0;
    const removed = diff?.removedNodes?.length || 0;
    const connectionChanges = diff?.edges?.length || 0;
    const parts = [];
    if (added) parts.push(`${added} node${added === 1 ? '' : 's'} added`);
    if (updated) parts.push(`${updated} node${updated === 1 ? '' : 's'} updated`);
    if (removed) parts.push(`${removed} node${removed === 1 ? '' : 's'} removed`);
    if (connectionChanges) parts.push('connections changed');
    return parts.length ? `I prepared changes for this workflow: ${parts.join(', ')}.` : 'I prepared a workflow change proposal for your review.';
};

const runWorkflowTurn = async ({ workflow, userId, userEmail, text, clarificationMode, onProgress }) => {
    if (isGreeting(text)) {
        return replyFor('I am the AI assistant for this workflow. I can inspect and propose changes to this workflow only.');
    }
    if (isOutOfScope(text)) {
        return replyFor('I can only modify this workflow. Use Form AI to edit forms, or Ask Promptly to create or change other resources.');
    }

    onProgress?.({ message: 'Reading this workflow' });
    const workflowRequest = (workflow.nodes || []).length > 0
        ? text
        : `This workflow is currently empty. Build the requested automation inside this existing workflow, including a suitable trigger when the request requires one. Request: ${text}`;
    const snapshot = compactWorkflowSnapshot(workflow);
    const classification = await classifyRequest({ message: workflowRequest, snapshot });
    const specs = specsForWorkflow({ workflow, classification });
    const form = await attachedForm(workflow, userId);
    const requiredCapabilities = requiredCapabilitiesForRequest(text);
    const resourceContext = await loadWorkflowResourceContext({ userId, specs });
    onProgress?.({ message: 'Preparing a safe workflow proposal' });
    const proposal = await patchWorkflow({
        message: workflowRequest,
        currentWorkflow: workflow.toJSON(),
        classification: { ...classification, action: 'edit_workflow' },
        specs,
        formSchema: form?.toJSON?.() || null,
        respondentEmailFieldId: form?.respondentEmailFieldId || form?.settings?.respondentEmailFieldId || null,
        approverEmail: userEmail || null,
        requiredCapabilities,
        resourceContext
    });
    return replyFor(
        summarizeProposal(proposal.diff),
        {
            workflowId: workflow.id,
            baseWorkflowRevision: workflow.revision,
            nodes: proposal.nodes,
            edges: proposal.edges,
            operations: proposal.operations,
            diff: proposal.diff,
            readiness: proposal.readiness,
            plan: [
                ...(proposal.diff?.addedNodes || []).map(node => ({ title: `Add ${node.title || node.subType}` })),
                ...(proposal.diff?.updatedNodes || []).map(node => ({ title: `Update ${node.title}` })),
                ...(proposal.diff?.removedNodes || []).map(node => ({ title: `Remove ${node.title}` }))
            ]
        },
        'workflow_proposal'
    );
};

const toWorkflowJson = workflow => workflow?.toJSON ? workflow.toJSON() : workflow;

export const workflowAssistant = {
    async getHistory({ workflowId, userId, limit = 50, before = null }) {
        const workflow = await findWorkflow(workflowId, userId);
        return sequelize.transaction(async transaction => {
            await ensureState({ workflow, transaction });
            const where = { workflowId };
            if (before) {
                const cursor = await WorkflowChatMessage.findOne({ where: { id: before, workflowId }, transaction });
                if (cursor) where.createdAt = { [Op.lt]: cursor.createdAt };
            }
            const messages = await WorkflowChatMessage.findAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY),
                transaction
            });
            const state = await WorkflowAIState.findOne({ where: { workflowId }, transaction });
            return {
                messages: messages.reverse().map(publicMessage),
                nextBefore: messages.length >= Math.min(Math.max(Number(limit) || 50, 1), MAX_HISTORY) ? messages[0]?.id || null : null,
                state: publicState(state)
            };
        });
    },

    async submitTurn({ workflowId, userId, userEmail = null, command, text, clarificationMode = DEFAULT_MODE, expectedStateVersion, requestId, onProgress }) {
        const workflow = await findWorkflow(workflowId, userId);
        const input = normalizeInput(command, text);
        if (!input) throw errorWith('WORKFLOW_AI_INPUT_REQUIRED', 'Please describe a workflow change.', 400);
        const runId = requestId || `wturn_${crypto.randomUUID().replace(/-/g, '')}`;
        let started = false;

        try {
            const userMessage = await sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction });
                if (Number.isInteger(expectedStateVersion) && expectedStateVersion !== state.version) {
                    throw errorWith('WORKFLOW_AI_STATE_CONFLICT', 'This workflow assistant changed in another tab. Refresh the conversation and try again.', 409, { currentStateVersion: state.version });
                }
                if (state.phase === 'processing' && state.inFlightRequestId !== runId) {
                    throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'This workflow assistant is already processing a request.', 409, { currentStateVersion: state.version });
                }
                const message = await WorkflowChatMessage.create({
                    id: messageId(), workflowId, sender: 'user', text: input, kind: 'text'
                }, { transaction });
                await state.update({
                    version: state.version + 1,
                    phase: 'processing',
                    mode: clarificationMode || state.mode || DEFAULT_MODE,
                    activeWork: { requestId: runId, messageId: message.id },
                    inFlightRequestId: runId,
                    inFlightStartedAt: new Date(),
                    openClarification: null
                }, { transaction });
                started = true;
                return message;
            });

            const reply = await runWorkflowTurn({ workflow, userId, userEmail, text: input, clarificationMode, onProgress });
            return sequelize.transaction(async transaction => {
                const state = await WorkflowAIState.findOne({ where: { workflowId }, transaction, lock: transaction.LOCK.UPDATE });
                if (!state) throw errorWith('WORKFLOW_AI_STATE_MISSING', 'Workflow assistant state is missing.', 500);
                let activeProposalMessageId = null;
                if (reply.kind === 'workflow_proposal') activeProposalMessageId = reply.id;
                const botMessage = await WorkflowChatMessage.create({
                    ...reply,
                    workflowId,
                    proposalStatus: reply.kind === 'workflow_proposal' ? 'pending' : null
                }, { transaction });
                if (activeProposalMessageId && state.activeProposalMessageId) {
                    await WorkflowChatMessage.update(
                        { proposalStatus: 'superseded' },
                        { where: { id: state.activeProposalMessageId, workflowId }, transaction }
                    );
                }
                await state.update({
                    version: state.version + 1,
                    phase: 'idle',
                    activeWork: null,
                    inFlightRequestId: null,
                    inFlightStartedAt: null,
                    activeProposalMessageId,
                    openClarification: reply.kind === 'clarification' ? reply.payload || null : null
                }, { transaction });
                return {
                    userMsg: publicMessage(userMessage),
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
                const state = await WorkflowAIState.findOne({ where: { workflowId }, transaction, lock: transaction.LOCK.UPDATE });
                if (!state || state.inFlightRequestId !== runId) return;
                const botMessage = await WorkflowChatMessage.create({
                    ...errorMessage,
                    workflowId,
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
            const state = await ensureState({ workflow, transaction, migrate: false });
            if (state.inFlightRequestId) {
                throw errorWith('WORKFLOW_AI_TURN_IN_PROGRESS', 'The workflow AI is still processing a request. Wait for it to finish before clearing the chat.', 409);
            }

            const deletedMessages = await WorkflowChatMessage.destroy({ where: { workflowId }, transaction });
            const legacySessions = await ChatSession.findAll({
                where: { userId, automationId: workflowId, purpose: 'automation_edit' },
                transaction
            });
            let deletedLegacyMessages = 0;
            for (const session of legacySessions) {
                deletedLegacyMessages += await ChatMessage.destroy({ where: { sessionId: session.id }, transaction });
                await session.destroy({ transaction });
            }

            await state.update({
                version: state.version + 1,
                phase: 'idle',
                activeWork: null,
                openClarification: null,
                activeProposalMessageId: null,
                inFlightRequestId: null,
                inFlightStartedAt: null,
                legacyImported: true,
                legacySessionId: null
            }, { transaction });
            return {
                cleared: true,
                deletedMessages: deletedMessages + deletedLegacyMessages,
                state: publicState(state)
            };
        });
    },

    async decideProposal({ workflowId, userId, proposalMessageId, action = 'accept', expectedStateVersion }) {
        const workflow = await findWorkflow(workflowId, userId);
        const message = await WorkflowChatMessage.findOne({ where: { id: proposalMessageId, workflowId, kind: 'workflow_proposal' } });
        if (!message) throw errorWith('WORKFLOW_PROPOSAL_NOT_FOUND', 'Workflow proposal not found.', 404);
        if (message.proposalStatus !== 'pending') throw errorWith('WORKFLOW_PROPOSAL_NOT_PENDING', 'This workflow proposal is no longer pending.', 409);
        const payload = message.payload || {};

        if (action === 'reject') {
            return sequelize.transaction(async transaction => {
                const state = await ensureState({ workflow, transaction, migrate: false });
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
                const lockedMessage = await WorkflowChatMessage.findOne({
                    where: { id: proposalMessageId, workflowId, kind: 'workflow_proposal' },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!lockedMessage || lockedMessage.proposalStatus !== 'pending') {
                    throw errorWith('WORKFLOW_PROPOSAL_NOT_PENDING', 'This workflow proposal is no longer pending.', 409);
                }
                const state = await ensureState({ workflow: lockedWorkflow, transaction, migrate: false });
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

export const workflowAssistantInternals = { publicMessage, publicState, normalizeInput, isOutOfScope, ensureState };
