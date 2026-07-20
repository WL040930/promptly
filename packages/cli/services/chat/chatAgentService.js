import { ChatSession, ChatMessage, Workflow, Form, AgentRun, WorkflowVersion } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { FormAIState, FormChatMessage, FormResponse } from '../../models/index.js';
import { runFormTurn } from '../ai/formAIService.js';
import { ai } from '../ai/index.js';
import { AI_TASKS } from '../ai/core/aiTasks.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { assembleWorkflow, tokenTotal } from '../ai/workflow/workflowAgentService.js';
import env from '../../config/env.js';
import { mergeAgentContext } from './resourceResolver.js';
import { processAgenticTurn, resumeAgentAfterClarification, resumeAgentAfterForm, resumeAgentAfterPlanReview } from '../agent/agentOrchestrator.js';
import { createChatCapabilityRegistry } from './chatCapabilityRegistry.js';
import { hasFallbackToolMarkup, parseFallbackToolCall } from './fallbackToolCall.js';
import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';
import { supersedePendingChatFormProposals } from '../proposalLifecycle.js';
import { applyFormPatches } from '../ai/form/domain/formPatchEngine.js';
import { validateFormSchema } from '../ai/form/domain/formSchemaValidator.js';
import { validateWorkflow } from '../engine/workflowValidator.js';

const tokenPayload = (...usages) => {
    const stage1 = usages[0] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const stage2 = usages[1] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    return {
        stage1,
        stage2,
        total: {
            promptTokens: stage1.promptTokens + stage2.promptTokens,
            completionTokens: stage1.completionTokens + stage2.completionTokens,
            totalTokens: tokenTotal(stage1, stage2)
        }
    };
};

const messagePayload = (message) => {
    const json = message.toJSON();
    return {
        id: json.id,
        sender: json.sender,
        text: json.text,
        createdAt: json.createdAt,
        kind: json.kind || 'text',
        payload: json.payload || null,
        proposalStatus: json.proposalStatus || null,
        tokenUsage: json.tokenUsage || null
    };
};

const saveReply = async (session, { text, kind = 'text', payload = null, tokenUsage = null, proposalStatus = null }) => {
    const reply = await ChatMessage.create({
        sessionId: session.id,
        sender: 'bot',
        text: text || '',
        kind,
        payload,
        tokenUsage,
        proposalStatus
    });
    return messagePayload(reply);
};

export const saveUserMessage = async (session, message) => {
    if (!message || !message.trim()) return null;
    const saved = await ChatMessage.create({ sessionId: session.id, sender: 'user', text: message.trim(), kind: 'text' });
    return messagePayload(saved);
};

const formUses = (workflow, formId) => (workflow.nodes || [])
    .some(node => node.subType === 'form-submission' && node.config?.formId === formId);

const ensureFormRevision = (form, expected) => {
    if (expected && new Date(form.updatedAt).getTime() !== new Date(expected).getTime()) {
        const error = new Error('This form changed while the proposal was waiting for approval. Generate a new proposal.');
        error.code = 'FORM_PROPOSAL_STALE';
        error.status = 409;
        throw error;
    }
};

/**
 * Apply non-AI form lifecycle proposals through one server-owned seam.
 * The browser submits a decision; it never performs the destructive write.
 */
export const decideChatProposal = async ({ session, userId, messageId, action = 'approve', overrides = null } = {}) => {
    if (!session?.id || !messageId) throw new Error('A session and proposal message are required.');
    let result;
    await sequelize.transaction(async transaction => {
        const message = await ChatMessage.findOne({
            where: { id: messageId, sessionId: session.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!message) {
            const error = new Error('Proposal not found.');
            error.code = 'CHAT_PROPOSAL_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        if (message.proposalStatus === 'applied') {
            result = { status: 'applied', message: messagePayload(message), resource: message.payload?.result || null };
            return;
        }
        if (message.proposalStatus !== 'pending') {
            const error = new Error('This proposal is no longer pending.');
            error.code = 'CHAT_PROPOSAL_NOT_PENDING';
            error.status = 409;
            throw error;
        }

        const proposal = { ...(message.payload || {}), ...(overrides || {}) };
        if (action === 'reject' || action === 'ignore') {
            await message.update({ proposalStatus: 'ignored' }, { transaction });
            await session.update({ agentState: {} }, { transaction });
            result = { status: 'ignored', message: messagePayload({ toJSON: () => ({ ...message.toJSON(), proposalStatus: 'ignored' }) }) };
            return;
        }

        const formKinds = ['form_proposal', 'form_duplicate_proposal', 'form_delete_proposal', 'form_response_clear_proposal'];
        if (formKinds.includes(message.kind)) {
            const form = proposal.formId
                ? await Form.findOne({ where: { id: proposal.formId, userId }, transaction, lock: transaction.LOCK.UPDATE })
                : null;
            if (proposal.formId && !form) {
                const error = new Error('The form no longer exists.');
                error.code = 'FORM_NOT_FOUND';
                error.status = 404;
                throw error;
            }
            ensureFormRevision(form, proposal.baseFormUpdatedAt);

            if (message.kind === 'form_proposal') {
                const schema = proposal.schema || (form && Array.isArray(proposal.patches)
                    ? applyFormPatches({ currentSchema: form.toJSON(), patches: proposal.patches }).schema
                    : proposal.schema);
                const issues = validateFormSchema(schema || {});
                if (issues.length > 0) {
                    const error = new Error('The form proposal failed validation.');
                    error.code = 'FORM_PROPOSAL_INVALID';
                    error.status = 422;
                    error.issues = issues;
                    throw error;
                }
                const saved = form || await Form.create({
                    title: schema.title,
                    description: schema.description || '',
                    settings: schema.settings || {},
                    fields: schema.fields || [],
                    userId
                }, { transaction });
                if (form) await saved.update({
                    title: schema.title,
                    description: schema.description || '',
                    settings: schema.settings || {},
                    fields: schema.fields || []
                }, { transaction });
                result = { formId: saved.id, action: form ? 'edit_form' : 'create_form' };
            } else if (message.kind === 'form_delete_proposal') {
            const workflows = await Workflow.findAll({ where: { userId }, transaction, attributes: ['id', 'name', 'nodes'] });
            const dependencies = workflows.filter(workflow => formUses(workflow, form.id));
            if (dependencies.length > 0) {
                const error = new Error('The form is still used by one or more workflows.');
                error.code = 'FORM_DELETE_DEPENDENCIES';
                error.status = 409;
                error.issues = dependencies.map(workflow => ({ id: workflow.id, name: workflow.name }));
                throw error;
            }
            await FormChatMessage.destroy({ where: { formId: form.id }, transaction });
            await FormAIState.destroy({ where: { formId: form.id }, transaction });
            await FormResponse.destroy({ where: { formId: form.id }, transaction });
            await form.destroy({ transaction });
            result = { formId: form.id, action: 'delete_form' };
            } else if (message.kind === 'form_duplicate_proposal') {
            const copy = await Form.create({
                title: proposal.schema?.title || `${form.title} copy`,
                description: proposal.schema?.description || form.description || '',
                settings: proposal.schema?.settings || form.settings || {},
                fields: proposal.schema?.fields || form.fields || [],
                userId
            }, { transaction });
            result = { formId: copy.id, action: 'duplicate_form' };
            } else if (message.kind === 'form_response_clear_proposal') {
            await FormResponse.destroy({ where: { formId: form.id }, transaction });
            await form.update({ responseCount: 0 }, { transaction });
            result = { formId: form.id, action: 'clear_form_responses' };
            }
        } else if (message.kind === 'workflow_diff' || message.kind === 'workflow_proposal') {
            const workflow = proposal.workflowId
                ? await Workflow.findOne({ where: { id: proposal.workflowId, userId }, transaction, lock: transaction.LOCK.UPDATE })
                : null;
            if (proposal.workflowId && !workflow) {
                const error = new Error('The workflow no longer exists.');
                error.code = 'WORKFLOW_NOT_FOUND';
                error.status = 404;
                throw error;
            }
            if (workflow && proposal.baseWorkflowUpdatedAt) {
                ensureFormRevision(workflow, proposal.baseWorkflowUpdatedAt);
            }
            const nodes = Array.isArray(proposal.nodes) ? proposal.nodes : [];
            const edges = Array.isArray(proposal.edges) ? proposal.edges : [];
            const validation = validateWorkflow({ nodes, edges, isActive: false, registry: NodeRegistry });
            if (!validation.valid) {
                const error = new Error('The workflow proposal failed validation.');
                error.code = 'WORKFLOW_PROPOSAL_INVALID';
                error.status = 422;
                error.issues = validation.issues;
                throw error;
            }
            const saved = workflow || await Workflow.create({
                name: proposal.name || 'New Automation',
                status: 'Draft',
                isActive: false,
                iconColor: 'text-indigo-600',
                iconBg: 'bg-indigo-100',
                nodes,
                edges,
                revision: 1,
                userId
            }, { transaction });
            const nextRevision = Number(saved.revision || 0) + (workflow ? 1 : 0);
            const version = await WorkflowVersion.create({
                workflowId: saved.id,
                versionNumber: workflow ? nextRevision : 1,
                baseRevisionId: workflow ? String(saved.revision || 1) : null,
                nodes,
                edges,
                source: 'ai',
                summary: proposal.summary || 'Applied AI automation proposal'
            }, { transaction });
            await saved.update({
                draftRevisionId: version.id,
                ...(workflow ? { nodes, edges, revision: nextRevision } : {})
            }, { transaction });
            result = { workflowId: saved.id, action: workflow ? 'edit_workflow' : 'create_workflow' };
        } else {
            const error = new Error('Unsupported chat proposal.');
            error.code = 'CHAT_PROPOSAL_UNSUPPORTED';
            error.status = 400;
            throw error;
        }

        const nextPayload = { ...proposal, result, appliedAt: new Date().toISOString() };
        await message.update({ proposalStatus: 'applied', payload: nextPayload }, { transaction });
        await session.update({ agentState: {} }, { transaction });
        result = { status: 'applied', message: messagePayload({ toJSON: () => ({ ...message.toJSON(), proposalStatus: 'applied', payload: nextPayload }) }), resource: result };
    });
    return result;
};

const workflowForRequest = async (userId, workflowId) => {
    if (!workflowId) return null;
    return Workflow.findOne({ where: { id: workflowId, userId } });
};

const formForRequest = async (userId, formId) => {
    if (!formId) return null;
    return Form.findOne({ where: { id: formId, userId } });
};

const compactWorkflowContext = (workflow) => {
    if (!workflow) return { error: 'Workflow not found' };
    const value = workflow.toJSON ? workflow.toJSON() : workflow;
    return {
        id: value.id,
        name: value.name,
        status: value.status,
        isActive: value.isActive,
        updatedAt: value.updatedAt,
        nodes: (value.nodes || []).map(node => ({
            id: node.id,
            title: node.title,
            type: node.type,
            subType: node.subType
        })),
        edges: (value.edges || []).map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle || null,
            targetHandle: edge.targetHandle || null
        }))
    };
};

const compactFormContext = (form) => {
    if (!form) return { error: 'Form not found' };
    const value = form.toJSON ? form.toJSON() : form;
    return {
        id: value.id,
        title: value.title,
        description: value.description || '',
        updatedAt: value.updatedAt,
        fields: (value.fields || []).map(field => ({
            id: field.id,
            label: field.label || field.name || '',
            type: field.type,
            required: Boolean(field.required)
        }))
    };
};

const formHistory = async (sessionId) => {
    const rows = await ChatMessage.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        limit: 20,
        attributes: ['sender', 'text', 'kind', 'payload', 'proposalStatus']
    });
    return rows.map(row => ({
        sender: row.sender,
        text: row.text,
        ...(row.kind === 'form_proposal' && row.proposalStatus === 'pending' && row.payload
            ? { proposal: { ...row.payload, status: 'pending' } }
            : {})
    }));
};

const formResult = async ({ session, userId, request, formId, continuation = null, state = {}, clarificationMode }) => {
    const form = await formForRequest(userId, formId);
    if (formId && !form) {
        const reply = await saveReply(session, { text: 'I could not find that form. Please choose one of your existing forms.', kind: 'error' });
        return { reply, tokenUsage: null };
    }
    const currentSchema = form ? form.toJSON() : state.currentSchema || {};
    const result = await runFormTurn({
        request,
        currentSchema,
        history: await formHistory(session.id),
        clarificationMode: normalizeClarificationMode(clarificationMode)
    });
    const tokenUsage = result.tokenUsage ? {
        stage1: result.tokenUsage,
        stage2: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        total: result.tokenUsage
    } : null;

    if (result.kind === 'reply' || result.kind === 'clarification') {
        const nextState = {
            ...state,
            status: result.kind === 'reply' ? 'form_conversation' : 'awaiting_form_clarification',
            formId: formId || null,
            currentSchema,
            continuation
        };
        await session.update({ agentState: nextState });
        const reply = await saveReply(session, {
            text: result.message || 'Please provide a little more detail.',
            kind: result.kind === 'reply' ? 'text' : 'clarification',
            payload: result.kind === 'reply' ? null : { options: result.options || result.inputs || [] },
            tokenUsage
        });
        return { reply, tokenUsage };
    }

    const nextState = {
        ...state,
        status: 'awaiting_form_approval',
        formId: formId || null,
        currentSchema,
        continuation,
        schema: result.schema || currentSchema
    };
    await session.update({ agentState: nextState });
    const supersededMessageIds = await supersedePendingChatFormProposals({
        sessionId: session.id,
        formId: formId || null
    });
    const proposalPayload = {
        action: formId ? 'edit_form' : 'create_form',
        formId: formId || null,
        schema: result.schema || currentSchema,
        patches: result.patches || [],
        requirements: result.requirements || [],
        verification: result.verification || null,
        cardinality: result.cardinality || null,
        ...(form ? { baseFormUpdatedAt: form.updatedAt } : {}),
        ...(supersededMessageIds.length > 0 ? { supersededMessageIds } : {})
    };
    const reply = await saveReply(session, {
        text: result.message || 'I prepared the form for your review.',
        kind: 'form_proposal',
        payload: proposalPayload,
        tokenUsage,
        proposalStatus: 'pending'
    });
    return { reply, tokenUsage };
};

export const applyEvent = async (session, userId, event) => {
    if (!event?.type) return null;
    const state = session.agentState || {};
    if (event.type === 'agent_plan_approved' && event.runId) {
        const run = await AgentRun.findOne({ where: { id: event.runId, sessionId: session.id, userId } });
        if (!run || state.status !== 'awaiting_agent_plan_review' || state.runId !== run.id) {
            return { reply: await saveReply(session, { text: 'That plan is no longer waiting for approval. Please send the request again.', kind: 'error' }) };
        }
        const resumed = await resumeAgentAfterPlanReview({ run, session, userId });
        return { reply: resumed.replyObj, tokenUsage: resumed.totalTokenUsage };
    }
    if (event.type === 'agent_plan_rejected' && event.runId) {
        const run = await AgentRun.findOne({ where: { id: event.runId, sessionId: session.id, userId } });
        if (!run || state.status !== 'awaiting_agent_plan_review' || state.runId !== run.id) {
            return { reply: await saveReply(session, { text: 'That plan is no longer waiting for approval.', kind: 'error' }) };
        }
        await run.update({ status: 'blocked', currentStep: null, error: { code: 'AGENT_PLAN_REJECTED', message: 'The user chose not to continue with the proposed plan.' } });
        await session.update({ agentState: {} });
        return { reply: await saveReply(session, { text: 'I stopped before making any form or workflow changes.', kind: 'status', payload: { status: 'cancelled', runId: run.id } }) };
    }
    if (event.type === 'form_saved' && event.runId) {
        const run = await AgentRun.findOne({ where: { id: event.runId, sessionId: session.id, userId } });
        if (!run) return { reply: await saveReply(session, { text: 'That agent run is no longer available.', kind: 'error' }) };
        if (event.messageId) await ChatMessage.update({ proposalStatus: 'applied' }, { where: { id: event.messageId, sessionId: session.id } });
        const resumed = await resumeAgentAfterForm({ run, session, userId, formId: event.formId });
        await session.update({ agentState: { status: 'awaiting_agent_approval', runId: run.id } });
        return { reply: resumed.reply, tokenUsage: resumed.tokenUsage };
    }
    if (event.type === 'workflow_target_selected') {
        const workflow = await workflowForRequest(userId, event.workflowId);
        const request = state.continuation?.request;
        if (!workflow || !request) {
            return { reply: await saveReply(session, { text: 'I could not resume that workflow request. Please send it again.', kind: 'error' }) };
        }

        await session.update({
            agentContext: { ...(session.agentContext || {}), workflowId: workflow.id },
            agentState: {}
        });

        return {
            resume: {
                message: request,
                context: { workflowId: workflow.id }
            }
        };
    }
    if (event.type === 'form_target_selected') {
        const form = await formForRequest(userId, event.formId);
        const request = state.continuation?.request;
        if (!form || !request) {
            return { reply: await saveReply(session, { text: 'I could not resume that form request. Please send it again.', kind: 'error' }) };
        }

        await session.update({
            agentContext: mergeAgentContext(session.agentContext || {}, { formId: form.id }),
            agentState: {}
        });

        return {
            resume: {
                message: request,
                context: { formId: form.id }
            }
        };
    }
    if (event.type === 'proposal_ignored') {
        if (event.messageId) await ChatMessage.update({ proposalStatus: 'ignored' }, { where: { id: event.messageId, sessionId: session.id } });
        await session.update({ agentState: {} });
        return { reply: await saveReply(session, { text: 'Ignored.', kind: 'status', payload: { status: 'ignored' } }) };
    }
    if (event.type === 'proposal_stale') {
        if (event.messageId) await ChatMessage.update({ proposalStatus: 'stale' }, { where: { id: event.messageId, sessionId: session.id } });
        await session.update({ agentState: {} });
        return { reply: await saveReply(session, { text: 'This suggestion is outdated. Generate a new one.', kind: 'status', payload: { status: 'stale' } }) };
    }
    if (event.type === 'proposal_applied') {
        if (event.messageId) await ChatMessage.update({ proposalStatus: 'applied' }, { where: { id: event.messageId, sessionId: session.id } });
        await session.update({ agentState: {} });
        return { reply: await saveReply(session, { text: 'Applied.', kind: 'status', payload: { status: 'applied' } }) };
    }
    if (event.type === 'form_saved') {
        if (!state.continuation?.workflow) {
            const msgIdToUpdate = event.messageId || state.proposalMessageId;
            if (msgIdToUpdate) await ChatMessage.update({ proposalStatus: 'applied' }, { where: { id: msgIdToUpdate, sessionId: session.id } });
            await session.update({ agentState: {} });
            return { reply: await saveReply(session, { text: 'Form saved.', kind: 'status', payload: { status: 'applied', formId: event.formId } }) };
        }
        const workflow = await workflowForRequest(userId, state.continuation.workflowId);
        if (!workflow) throw new Error('Workflow not found while resuming agent');
        const specs = NodeRegistry.getSchemasFor(state.continuation.specNodeKeys || state.continuation.specSubTypes);
        const assembled = await assembleWorkflow({
            message: state.continuation.request,
            specs,
            workflowName: state.continuation.workflowName,
            formId: event.formId
        });
        await session.update({ agentState: {} });
        const tokenUsage = tokenPayload(state.continuation.stage1Usage, assembled.tokenUsage);
        return {
            reply: await saveReply(session, {
                text: 'The workflow is ready for your review.',
                kind: 'workflow_proposal',
                payload: {
                    action: 'create_workflow',
                    name: assembled.name,
                    intent: state.continuation.intent,
                    needsForm: true,
                    formId: event.formId,
                    nodes: assembled.nodes,
                    edges: assembled.edges,
                    plan: assembled.nodes.map(node => ({ subType: node.subType, title: node.title, reason: node.description })),
                    baseWorkflowUpdatedAt: workflow.updatedAt
                },
                tokenUsage,
                proposalStatus: 'pending'
            }),
            tokenUsage
        };
    }
    return null;
};

const systemInstruction = `You are Promptly Agent, an AI assistant helping users build automation workflows and forms.
Use the registered capabilities when you need account facts or when preparing a reviewable proposal.
Never invent resource IDs. Resolve named resources before editing them. Never apply changes directly; proposals require explicit user approval.
If native function calling is unavailable, output a tool request exactly as <TOOL>{"name":"tool_name","args":{...}}</TOOL> and wait for <TOOL_RESPONSE>...</TOOL_RESPONSE> before continuing.`;

// Tool definitions are generated by chatCapabilityRegistry.js.
export const processChatMessage = async ({ session, userId, context = {}, onEvent = null }) => {
    const effectiveContext = mergeAgentContext(session.agentContext || {}, context);
    const latestUserMessage = await ChatMessage.findOne({
        where: { sessionId: session.id, sender: 'user' },
        order: [['createdAt', 'DESC']]
    });
    const pendingAgentState = session.agentState || {};
    if (pendingAgentState.status === 'awaiting_agent_plan_review' && pendingAgentState.runId) {
        const run = await AgentRun.findOne({ where: { id: pendingAgentState.runId, sessionId: session.id, userId } });
        const answer = String(latestUserMessage?.text || '');
        if (run && /\b(proceed|approve|continue|yes|go ahead)\b/i.test(answer)) {
            const resumed = await resumeAgentAfterPlanReview({ run, session, userId });
            return { replyObj: resumed.replyObj, totalTokenUsage: resumed.totalTokenUsage };
        }
        if (run && /\b(cancel|reject|stop|no)\b/i.test(answer)) {
            await run.update({ status: 'blocked', currentStep: null, error: { code: 'AGENT_PLAN_REJECTED', message: 'The user chose not to continue with the proposed plan.' } });
            await session.update({ agentState: {} });
            const reply = await saveReply(session, { text: 'I stopped before making any form or workflow changes.', kind: 'status', payload: { status: 'cancelled', runId: run.id } });
            return { replyObj: reply, totalTokenUsage: null };
        }
        if (run) {
            const reply = await saveReply(session, {
                text: 'Please review the plan above and choose Proceed or Cancel before I continue.',
                kind: 'agent_plan_review',
                payload: { runId: run.id, plan: run.plan }
            });
            return { replyObj: reply, totalTokenUsage: null };
        }
    }
    if (pendingAgentState.status === 'awaiting_agent_clarification' && pendingAgentState.runId) {
        const run = await AgentRun.findOne({ where: { id: pendingAgentState.runId, sessionId: session.id, userId } });
        if (!run) {
            await session.update({ agentState: {} });
            const reply = await saveReply(session, {
                text: 'That pending request is no longer available. Please send the request again.',
                kind: 'error'
            });
            return { replyObj: reply, totalTokenUsage: null };
        }

        const resumed = await resumeAgentAfterClarification({ run, session, userId, context: effectiveContext });
        return { replyObj: resumed.replyObj, totalTokenUsage: resumed.totalTokenUsage };
    }

    const agenticResult = await processAgenticTurn({ session, userId, message: latestUserMessage?.text || '', context: effectiveContext, onEvent });
    if (agenticResult.handled) return { replyObj: agenticResult.replyObj, totalTokenUsage: agenticResult.totalTokenUsage };

    const history = await ChatMessage.findAll({
        where: { sessionId: session.id },
        order: [['createdAt', 'ASC']],
        limit: 20
    });

    const aiMessages = history.map(msg => {
        if (msg.kind === 'tool_call' && msg.payload?.toolCalls) {
            return { role: 'model', parts: [{ text: msg.text }], toolCalls: msg.payload.toolCalls };
        }
        if (msg.kind === 'tool_response' && msg.payload?.toolCallId) {
            return { role: 'tool', toolCallId: msg.payload.toolCallId, name: msg.payload.name, content: msg.text };
        }
        return {
            role: msg.sender === 'user' || msg.kind === 'tool_response' ? 'user' : 'model',
            parts: [{ text: msg.kind === 'tool_response' ? `<TOOL_RESPONSE>${msg.text}</TOOL_RESPONSE>` : msg.text }]
        };
    });


    let loopCount = 0;
    const maxLoops = env.aiChatMaxToolLoops;
    let totalTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let replyObj = null;
    const selectedWorkflow = effectiveContext.workflowId ? await workflowForRequest(userId, effectiveContext.workflowId) : null;
    const selectedForm = effectiveContext.formId ? await formForRequest(userId, effectiveContext.formId) : null;
    const selectedWorkflowInstruction = selectedWorkflow
        ? `\n\nThe user selected this existing workflow: ${selectedWorkflow.name} (ID: ${selectedWorkflow.id}). Use this workflow ID when proposing changes.`
        : '';
    const selectedFormInstruction = selectedForm
        ? `\nThe user selected this existing form: ${selectedForm.title} (ID: ${selectedForm.id}). Use this form ID when proposing changes.`
        : '';

    const capabilityRegistry = createChatCapabilityRegistry({
        session,
        userId,
        effectiveContext,
        history,
        services: {
            saveReply,
            formForRequest,
            workflowForRequest,
            formResult
        }
    });
    const capabilityTools = capabilityRegistry.toToolDefinitions();
    const capabilitySummary = capabilityRegistry.list()
        .map(capability => `- ${capability.name}: ${capability.description}`)
        .join('\n');

    while (loopCount < maxLoops) {
        loopCount++;
        onEvent?.({ type: 'assistant_step_started', step: 'respond', attempt: loopCount });
        const response = await ai.run({
            task: AI_TASKS.CHAT_RESPOND,
            messages: aiMessages,
            systemInstruction: `${systemInstruction}
Available capabilities:
${capabilitySummary}
Clarification for form requirements: ${normalizeClarificationMode(effectiveContext.clarificationMode)} - ${getClarificationModeInstruction(effectiveContext.clarificationMode)}${selectedWorkflowInstruction}${selectedFormInstruction}`,
            operation: 'chat',
            tools: capabilityTools
        });

        if (response.usageMetadata) {
            totalTokenUsage.promptTokens += response.usageMetadata.promptTokens || response.usageMetadata.promptTokenCount || 0;
            totalTokenUsage.completionTokens += response.usageMetadata.completionTokens || response.usageMetadata.candidatesTokenCount || 0;
            totalTokenUsage.totalTokens = totalTokenUsage.promptTokens + totalTokenUsage.completionTokens;
        }

        const replyText = response.text || '';
        // The dispatcher executes one tool per turn; keep the reconstructed
        // assistant message aligned with the single tool response we send.
        const nativeToolCalls = response.toolCalls?.slice(0, 1) || [];
        const nativeToolCall = nativeToolCalls[0] || null;
        const fallbackToolCall = parseFallbackToolCall(replyText);
        const hasFallbackTool = hasFallbackToolMarkup(replyText);

        if (nativeToolCall || hasFallbackTool) {
            let toolCall;
            if (nativeToolCall) {
                toolCall = nativeToolCall;
            } else {
                if (!fallbackToolCall) {
                    aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
                    aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>{"error": "Invalid JSON in tool call"}</TOOL_RESPONSE>` }] });
                    continue;
                }
                toolCall = fallbackToolCall;
            }

            const { name, args = {} } = toolCall;

            // Capability execution is the production path. Domain adapters
            // return a structured observation or a user-facing terminal reply;
            // the chat loop only serializes the observation for the model.
            let capabilityResult;
            try {
                onEvent?.({ type: 'tool_started', name });
                capabilityResult = await capabilityRegistry.execute(name, args, {
                    session,
                    userId,
                    context: effectiveContext
                });
            } catch (error) {
                capabilityResult = {
                    status: 'completed',
                    output: { error: error.message, code: error.code || 'AGENT_CAPABILITY_FAILED' }
                };
            }
            onEvent?.({ type: 'tool_completed', name, status: capabilityResult.status || 'completed' });

            if (capabilityResult.reply) {
                replyObj = capabilityResult.reply;
                break;
            }

            const capabilityToolResult = JSON.stringify(capabilityResult.output ?? {
                status: capabilityResult.status || 'completed'
            });
            await ChatMessage.create({
                sessionId: session.id,
                sender: 'bot',
                text: replyText,
                kind: 'tool_call',
                ...(nativeToolCall ? { payload: { toolCalls: nativeToolCalls } } : {})
            });
            await ChatMessage.create({
                sessionId: session.id,
                sender: 'user',
                text: capabilityToolResult,
                kind: 'tool_response',
                ...(nativeToolCall ? { payload: { toolCallId: nativeToolCall.id, name: nativeToolCall.name } } : {})
            });

            if (nativeToolCall) {
                aiMessages.push({ role: 'model', parts: [{ text: replyText }], toolCalls: nativeToolCalls });
                aiMessages.push({ role: 'tool', toolCallId: nativeToolCall.id, name: nativeToolCall.name, content: capabilityToolResult });
            } else {
                aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
                aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>${capabilityToolResult}</TOOL_RESPONSE>` }] });
            }
            continue;

        } else {
            replyObj = await saveReply(session, { text: replyText, kind: 'text' });
            onEvent?.({ type: 'assistant_step_completed', step: 'respond' });
            break;
        }
    }

    if (!replyObj) {
        replyObj = await saveReply(session, { text: "I'm sorry, I encountered an internal error while processing that.", kind: 'error' });
    }

    return { replyObj, totalTokenUsage };
};
