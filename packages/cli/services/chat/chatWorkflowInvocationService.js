import crypto from 'node:crypto';
import { AssistantMessage, WorkflowTriggerBinding } from '../../models/index.js';
import { ai } from '../ai/index.js';
import { AI_TASKS } from '../ai/core/aiTasks.js';
import {
    CHAT_WORKFLOW_TRIGGER_KIND,
    chatWorkflowInvocationFromConfig,
    clarificationInputsForChatParameters,
    validateChatInvocationParameters
} from '../triggers/chatWorkflowInvocationContract.js';
import { createWorkflowLifecycleProposal } from './chatWorkflowLifecycleService.js';
import { replaceChatSessionState } from './chatTurnLifecycle.js';
import { resolveClarificationSubmission } from '../../../shared/clarificationContract.js';

const CONFIDENCE_THRESHOLD = 0.75;
const MAX_CANDIDATES = 50;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const asJson = value => value?.toJSON?.() || value || {};

const errorReply = (messageModel, session, text, code) => messageModel.create({
    threadId: session.id,
    sender: 'bot',
    text,
    kind: 'error',
    payload: { code },
    isError: true
}).then(messagePayload);

const messagePayload = message => {
    const value = asJson(message);
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

const invocationId = () => `chatinv_${crypto.randomUUID().replaceAll('-', '')}`;
const pathName = path => String(path || '').replace(/^\//, '').split('/')[0];

const selectionPrompt = ({ message, candidates }) => JSON.stringify({
    task: 'Select exactly one eligible workflow only when it directly fulfills the user request. Extract only declared parameter values. Do not choose a workflow when intent is unclear or unrelated.',
    userMessage: String(message || '').slice(0, 12_000),
    candidates: candidates.map(candidate => ({
        bindingId: candidate.id,
        invocationKey: candidate.invocationKey,
        description: candidate.description,
        parameterSchema: candidate.parameterSchema
    })),
    responseShape: {
        bindingId: 'string or null',
        confidence: 'number from 0 to 1',
        parameters: 'object',
        reason: 'short string'
    }
});

const selectionSystemInstruction = `You route a user chat request to a pre-approved workflow. Return valid JSON only. Select a binding only if its description directly matches the user request. Never invent parameter names or values. If the request is ambiguous, set bindingId to null and confidence below 0.75.`;

const validSelection = ({ value, candidates }) => {
    if (!isPlainObject(value)) return null;
    const bindingId = typeof value.bindingId === 'string' ? value.bindingId : null;
    const confidence = Number(value.confidence);
    const candidate = candidates.find(item => item.id === bindingId);
    if (!candidate || !Number.isFinite(confidence) || confidence < CONFIDENCE_THRESHOLD) return null;
    return {
        candidate,
        confidence,
        parameters: isPlainObject(value.parameters) ? value.parameters : {},
        reason: typeof value.reason === 'string' ? value.reason.slice(0, 500) : ''
    };
};

const invalidParameterNames = validation => new Set((validation.issues || [])
    .map(item => pathName(item.path))
    .filter(Boolean));

const chatRunPayload = ({ session, candidate, message, parameters }) => ({
    message,
    sessionId: session.id,
    invocationKey: candidate.invocationKey,
    invocationId: invocationId(),
    parameters
});

/**
 * This module is the seam between a natural-language chat turn and a live
 * automation. It only exposes three outcomes: no match, clarification, or an
 * existing lifecycle approval proposal. Selection, JSON validation, and
 * parameter coercion stay behind that small interface.
 */
export const createChatWorkflowInvocationService = ({
    bindingModel = WorkflowTriggerBinding,
    messageModel = AssistantMessage,
    aiClient = ai,
    createLifecycleProposal = createWorkflowLifecycleProposal,
    replaceState = replaceChatSessionState
} = {}) => {
    const activeCandidates = async userId => {
        const bindings = await bindingModel.findAll({
            where: { userId, kind: CHAT_WORKFLOW_TRIGGER_KIND, status: 'active' },
            attributes: ['id', 'workflowId', 'revisionId', 'nodeId', 'userId', 'resourceId', 'config'],
            order: [['updatedAt', 'DESC']],
            limit: MAX_CANDIDATES
        });
        return bindings.flatMap(binding => {
            const value = asJson(binding);
            const invocation = chatWorkflowInvocationFromConfig({ ...(value.config || {}), chatEnabled: true });
            if (!invocation.valid) return [];
            return [{
                id: value.id,
                workflowId: value.workflowId,
                revisionId: value.revisionId,
                nodeId: value.nodeId,
                invocationKey: invocation.invocationKey,
                description: invocation.description,
                parameterSchema: invocation.parameterSchema
            }];
        });
    };

    const createParameterClarification = async ({ session, candidate, message, parameters, validation, reason = '' }) => {
        const requiredIds = [...invalidParameterNames(validation)];
        const inputs = clarificationInputsForChatParameters({ schema: candidate.parameterSchema, requiredIds });
        const names = [...new Set([
            ...requiredIds,
            ...(candidate.parameterSchema.required || [])
        ])].filter(name => inputs.some(input => input.id === name));
        await replaceState(session, {
            status: 'awaiting_chat_workflow_invocation_parameters',
            chatWorkflowInvocation: {
                bindingId: candidate.id,
                workflowId: candidate.workflowId,
                revisionId: candidate.revisionId,
                invocationKey: candidate.invocationKey,
                parameterSchema: candidate.parameterSchema,
                message,
                extractedParameters: parameters
            }
        });
        const clarification = await messageModel.create({
            threadId: session.id,
            sender: 'bot',
            text: names.length > 0
                ? `I can run “${candidate.invocationKey}”, but I need ${names.join(', ')} first.`
                : `I need a little more information before running “${candidate.invocationKey}”.`,
            kind: 'clarification',
            payload: {
                inputs,
                selectedState: parameters,
                chatWorkflowInvocation: {
                    bindingId: candidate.id,
                    workflowId: candidate.workflowId,
                    invocationKey: candidate.invocationKey,
                    parameterSchema: candidate.parameterSchema,
                    reason
                }
            }
        });
        return { reply: messagePayload(clarification) };
    };

    const proposeLiveRun = async ({ session, userId, candidate, message, parameters }) => {
        try {
            return await createLifecycleProposal({
                session,
                userId,
                workflowId: candidate.workflowId,
                actions: ['live_run'],
                payload: chatRunPayload({ session, candidate, message, parameters })
            });
        } catch (error) {
            return {
                reply: await errorReply(
                    messageModel,
                    session,
                    error.message || 'I could not prepare that workflow run.',
                    error.code || 'CHAT_WORKFLOW_INVOCATION_FAILED'
                )
            };
        }
    };

    const routeMessage = async ({ session, userId, message }) => {
        const candidates = await activeCandidates(userId);
        if (candidates.length === 0) return null;

        let modelResult;
        try {
            modelResult = await aiClient.run({
                task: AI_TASKS.NODE_JSON,
                messages: [{ role: 'user', parts: [{ text: selectionPrompt({ message, candidates }) }] }],
                systemInstruction: selectionSystemInstruction,
                operation: 'chat:workflow-invocation-select'
            });
        } catch (error) {
            console.warn('[ChatWorkflowInvocation] Selection unavailable:', error.message);
            return null;
        }

        const selection = validSelection({ value: modelResult?.json, candidates });
        if (!selection) return null;
        const validation = validateChatInvocationParameters({
            schema: selection.candidate.parameterSchema,
            parameters: selection.parameters
        });
        if (!validation.valid) {
            return createParameterClarification({
                session,
                candidate: selection.candidate,
                message,
                parameters: validation.parameters,
                validation,
                reason: selection.reason
            });
        }
        return proposeLiveRun({
            session,
            userId,
            candidate: selection.candidate,
            message,
            parameters: validation.parameters
        });
    };

    const handleClarification = async ({ session, userId, event }) => {
        const pending = session?.state?.chatWorkflowInvocation;
        if (session?.state?.status !== 'awaiting_chat_workflow_invocation_parameters' || !pending?.bindingId) return null;
        const binding = await bindingModel.findOne({
            where: { id: pending.bindingId, userId, kind: CHAT_WORKFLOW_TRIGGER_KIND, status: 'active' }
        });
        if (!binding) {
            return { reply: await errorReply(messageModel, session, 'That chat-enabled workflow is no longer live. Please send the request again.', 'CHAT_WORKFLOW_INVOCATION_STALE') };
        }
        const bindingValue = asJson(binding);
        const invocation = chatWorkflowInvocationFromConfig({ ...(bindingValue.config || {}), chatEnabled: true });
        if (!invocation.valid || bindingValue.revisionId !== pending.revisionId) {
            return { reply: await errorReply(messageModel, session, 'That chat-enabled workflow changed while it was waiting for input. Please send the request again.', 'CHAT_WORKFLOW_INVOCATION_STALE') };
        }

        const clarification = await messageModel.findOne({
            where: {
                threadId: session.id,
                sender: 'bot',
                kind: 'clarification',
                ...(event?.clarificationMessageId ? { id: event.clarificationMessageId } : {})
            },
            order: [['createdAt', 'DESC']]
        });
        const inputs = clarification?.payload?.inputs || clarification?.payload?.options || [];
        const submitted = resolveClarificationSubmission({ inputs, state: event?.state || {} });
        if (!submitted.complete) {
            return createParameterClarification({
                session,
                candidate: {
                    id: bindingValue.id,
                    workflowId: bindingValue.workflowId,
                    revisionId: bindingValue.revisionId,
                    invocationKey: invocation.invocationKey,
                    parameterSchema: invocation.parameterSchema
                },
                message: pending.message,
                parameters: { ...(pending.extractedParameters || {}), ...(submitted.state || {}) },
                validation: { issues: submitted.missingInputIds.map(id => ({ path: id })) }
            });
        }

        const validation = validateChatInvocationParameters({
            schema: invocation.parameterSchema,
            parameters: { ...(pending.extractedParameters || {}), ...(submitted.state || {}) }
        });
        if (!validation.valid) {
            return createParameterClarification({
                session,
                candidate: {
                    id: bindingValue.id,
                    workflowId: bindingValue.workflowId,
                    revisionId: bindingValue.revisionId,
                    invocationKey: invocation.invocationKey,
                    parameterSchema: invocation.parameterSchema
                },
                message: pending.message,
                parameters: validation.parameters,
                validation
            });
        }

        if (clarification) await clarification.update({
            payload: {
                ...(clarification.payload || {}),
                selectedState: submitted.state,
                resolution: {
                    type: 'answered',
                    answeredAt: new Date().toISOString(),
                    answers: submitted.answers
                }
            }
        });
        return proposeLiveRun({
            session,
            userId,
            candidate: {
                id: bindingValue.id,
                workflowId: bindingValue.workflowId,
                revisionId: bindingValue.revisionId,
                invocationKey: invocation.invocationKey,
                parameterSchema: invocation.parameterSchema
            },
            message: pending.message,
            parameters: validation.parameters
        });
    };

    return Object.freeze({ activeCandidates, handleClarification, routeMessage });
};

export const chatWorkflowInvocationService = createChatWorkflowInvocationService();

export const chatWorkflowInvocationInternals = {
    CONFIDENCE_THRESHOLD,
    validSelection,
    selectionPrompt
};
