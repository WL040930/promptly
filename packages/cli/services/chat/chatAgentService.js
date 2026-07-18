import { ChatSession, ChatMessage, Workflow, Form, AgentRun } from '../../models/index.js';
import { generateFormFromPrompt } from '../ai/aiFormsService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { assembleWorkflow, tokenTotal } from '../ai/workflowAgentService.js';
import { getAITaskConfig, getAIProviderForTask } from '../ai/aiService.js';
import env from '../../config/env.js';
import { mergeAgentContext } from './resourceResolver.js';
import { processAgenticTurn, resumeAgentAfterClarification, resumeAgentAfterForm, resumeAgentAfterPlanReview } from '../agent/agentOrchestrator.js';
import { createChatCapabilityRegistry } from './chatCapabilityRegistry.js';
import { getClarificationModeInstruction, normalizeClarificationMode } from '../../../shared/agentContract.js';

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
        attributes: ['sender', 'text']
    });
    return rows.map(row => ({ sender: row.sender, text: row.text }));
};

const formResult = async ({ session, userId, request, formId, continuation = null, state = {}, clarificationMode }) => {
    const form = await formForRequest(userId, formId);
    if (formId && !form) {
        const reply = await saveReply(session, { text: 'I could not find that form. Please choose one of your existing forms.', kind: 'error' });
        return { reply, tokenUsage: null };
    }
    const currentSchema = form ? form.toJSON() : state.currentSchema || {};
    const result = await generateFormFromPrompt(
        request,
        currentSchema,
        await formHistory(session.id),
        null,
        { clarificationMode: normalizeClarificationMode(clarificationMode) }
    );
    const tokenUsage = result.tokenUsage ? {
        stage1: result.tokenUsage,
        stage2: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        total: result.tokenUsage
    } : null;

    if (result.type === 'message') {
        const nextState = {
            ...state,
            status: 'awaiting_form_clarification',
            formId: formId || null,
            currentSchema,
            continuation
        };
        await session.update({ agentState: nextState });
        const reply = await saveReply(session, {
            text: result.message || 'Please provide a little more detail.',
            kind: 'clarification',
            payload: { options: result.options || [] },
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
    const reply = await saveReply(session, {
        text: result.message || 'I prepared the form for your review.',
        kind: 'form_proposal',
        payload: {
            action: formId ? 'edit_form' : 'create_form',
            formId: formId || null,
            schema: result.schema || currentSchema,
            patches: result.patches || [],
            requirements: result.requirements || [],
            verification: result.verification || null,
            cardinality: result.cardinality || null,
            ...(form ? { baseFormUpdatedAt: form.updatedAt } : {})
        },
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
export const processChatMessage = async ({ session, userId, context = {} }) => {
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

    const agenticResult = await processAgenticTurn({ session, userId, message: latestUserMessage?.text || '', context: effectiveContext });
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

    const chatTaskConfig = getAITaskConfig('chat');
    const provider = getAIProviderForTask('chat');
    const useNativeTools = provider.supportsToolCalls === true;

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
        const response = await provider.generateContent(aiMessages, {
            systemInstruction: `${systemInstruction}
Available capabilities:
${capabilitySummary}
Clarification for form requirements: ${normalizeClarificationMode(effectiveContext.clarificationMode)} - ${getClarificationModeInstruction(effectiveContext.clarificationMode)}${selectedWorkflowInstruction}${selectedFormInstruction}`,
            model: chatTaskConfig.model,
            maxCompletionTokens: env.aiChatMaxCompletionTokens,
            operation: 'chat',
            ...(useNativeTools ? { tools: capabilityTools } : {})
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
        const toolMatch = replyText.match(/<TOOL>(.*?)<\/TOOL>/s);

        if (nativeToolCall || toolMatch) {
            let toolCall;
            if (nativeToolCall) {
                toolCall = nativeToolCall;
            } else {
                try {
                    toolCall = JSON.parse(toolMatch[1]);
                } catch (e) {
                    aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
                    aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>{"error": "Invalid JSON in tool call"}</TOOL_RESPONSE>` }] });
                    continue;
                }
            }

            const { name, args = {} } = toolCall;

            // Capability execution is the production path. Domain adapters
            // return a structured observation or a user-facing terminal reply;
            // the chat loop only serializes the observation for the model.
            let capabilityResult;
            try {
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
            break;
        }
    }

    if (!replyObj) {
        replyObj = await saveReply(session, { text: "I'm sorry, I encountered an internal error while processing that.", kind: 'error' });
    }

    return { replyObj, totalTokenUsage };
};
