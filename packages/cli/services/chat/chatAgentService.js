import { ChatSession, ChatMessage, Workflow, Form, ExecutionLog, AgentRun } from '../../models/index.js';
import { generateFormFromPrompt } from '../ai/aiFormsService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import {
    classifyRequest,
    compactWorkflowSnapshot,
    assembleWorkflow,
    patchWorkflow,
    tokenTotal
} from '../ai/workflowAgentService.js';
import { getAITaskConfig, getAIProviderForTask } from '../ai/aiService.js';
import env from '../../config/env.js';
import { mergeAgentContext, resolveResource } from './resourceResolver.js';
import { processAgenticTurn, resumeAgentAfterClarification, resumeAgentAfterForm, resumeAgentAfterPlanReview } from '../agent/agentOrchestrator.js';
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
You have access to tools for finding resources, reading their definitions, and preparing safe proposals. Use a tool whenever you need facts from the user's account.
If native function calling is unavailable, output a tool request exactly as <TOOL>{"name":"tool_name","args":{...}}</TOOL> and wait for <TOOL_RESPONSE>...</TOOL_RESPONSE> before continuing.

Tools available:
- list_forms(): Returns a list of the user's forms with their IDs and titles. No arguments.
- list_workflows(purpose: "choose_target" | "list"): Returns a list of the user's workflows with their IDs and names.
- search_resources(resourceType: "form" | "workflow", query: string): Finds compact matches by ID or name. Use this before editing when the user names a resource.
- get_form_context(formId: string): Returns a compact form definition for understanding an existing form.
- get_workflow_context(workflowId: string): Returns compact workflow nodes and connections for understanding an existing workflow.
- get_execution_summary(workflowId: string | null, status: "All" | "Success" | "Failed", limit: number): Returns recent compact run summaries.
- get_execution_details(logId: string): Returns one execution log with step details for troubleshooting.
- get_form(formId: string): Returns the full schema of the specified form.
- get_workflow(workflowId: string): Returns the full structure of the specified workflow.
- propose_form_change(formId: string | null, prompt: string): Triggers the form builder to propose an edit or create a new form. If creating a new form, formId should be null.
- propose_workflow_change(workflowId: string | null, prompt: string): Triggers the workflow builder to propose an edit or create a new workflow. If creating a new workflow, workflowId should be null.

When the user clearly asks to create a new workflow, call propose_workflow_change with a null workflowId.
When the user asks to edit, update, or modify an existing workflow without identifying which one, call list_workflows with purpose "choose_target" first. The system will present the workflows as choices; do not guess a workflow.
When the user names a workflow or form, call search_resources with that name before proposing a change. Never invent an ID.`;

const agentTools = [
    {
        type: 'function',
        function: {
            name: 'list_forms',
            description: 'List the user forms as compact summaries, newest first.',
            strict: true,
            parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_workflows',
            description: 'List the user workflows as compact summaries, newest first.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { purpose: { type: 'string', enum: ['choose_target', 'list'] } },
                required: ['purpose'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_resources',
            description: 'Find a form or workflow by its ID or name. Use this before editing a named resource.',
            strict: true,
            parameters: {
                type: 'object',
                properties: {
                    resourceType: { type: 'string', enum: ['form', 'workflow'] },
                    query: { type: 'string' }
                },
                required: ['resourceType', 'query'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_form',
            description: 'Get the full schema for one form after its target is resolved.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { formId: { type: 'string' } },
                required: ['formId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_workflow',
            description: 'Get the full structure for one workflow after its target is resolved.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { workflowId: { type: 'string' } },
                required: ['workflowId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_form_context',
            description: 'Get a compact definition of one form without loading response data.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { formId: { type: 'string' } },
                required: ['formId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_workflow_context',
            description: 'Get compact workflow metadata, nodes, and edges without loading version history.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { workflowId: { type: 'string' } },
                required: ['workflowId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_execution_summary',
            description: 'List recent execution results for troubleshooting, with step payloads excluded.',
            strict: true,
            parameters: {
                type: 'object',
                properties: {
                    workflowId: { type: ['string', 'null'] },
                    status: { type: 'string', enum: ['All', 'Success', 'Failed'] },
                    limit: { type: 'integer', minimum: 1, maximum: 10 }
                },
                required: ['workflowId', 'status', 'limit'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_execution_details',
            description: 'Get one execution log including its step details and error.',
            strict: true,
            parameters: {
                type: 'object',
                properties: { logId: { type: 'string' } },
                required: ['logId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'propose_form_change',
            description: 'Prepare a reviewable form creation or form change proposal. Do not apply changes.',
            strict: true,
            parameters: {
                type: 'object',
                properties: {
                    formId: { type: ['string', 'null'] },
                    prompt: { type: 'string' }
                },
                required: ['formId', 'prompt'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'propose_workflow_change',
            description: 'Prepare a reviewable workflow creation or workflow change proposal. Do not apply changes.',
            strict: true,
            parameters: {
                type: 'object',
                properties: {
                    workflowId: { type: ['string', 'null'] },
                    prompt: { type: 'string' }
                },
                required: ['workflowId', 'prompt'],
                additionalProperties: false
            }
        }
    }
];

export const processChatMessage = async ({ session, userId, context = {} }) => {
    const effectiveContext = mergeAgentContext(session.agentContext || {}, context);
    const latestUserMessage = await ChatMessage.findOne({ where: { sessionId: session.id, sender: 'user' }, order: [['createdAt', 'DESC']] });

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
    const maxLoops = 5;
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

    while (loopCount < maxLoops) {
        loopCount++;
        const response = await provider.generateContent(aiMessages, {
            systemInstruction: `${systemInstruction}
Clarification for form requirements: ${normalizeClarificationMode(effectiveContext.clarificationMode)} - ${getClarificationModeInstruction(effectiveContext.clarificationMode)}${selectedWorkflowInstruction}${selectedFormInstruction}`,
            model: chatTaskConfig.model,
            maxCompletionTokens: env.aiChatMaxCompletionTokens,
            operation: 'chat',
            ...(useNativeTools ? { tools: agentTools } : {})
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
            let toolResult = '';

            try {
                if (name === 'list_forms') {
                    const forms = await Form.findAll({ where: { userId }, attributes: ['id', 'title', 'updatedAt'], order: [['updatedAt', 'DESC']], limit: 50 });
                    toolResult = JSON.stringify(forms);
                } else if (name === 'search_resources') {
                    const type = args.resourceType === 'form' ? 'form' : 'workflow';
                    const resolution = await resolveResource({ userId, type, reference: args.query || '' });
                    if (resolution.status === 'ambiguous') {
                        const request = [...history]
                            .reverse()
                            .find(message => message.sender === 'user' && message.kind === 'text')?.text;
                        await session.update({
                            agentState: {
                                status: `awaiting_${type}_target`,
                                continuation: { request }
                            }
                        });
                        replyObj = await saveReply(session, {
                            text: `I found multiple ${type}s that match. Which one should I use?`,
                            kind: 'clarification',
                            payload: {
                                options: [{
                                    id: `${type}-target`,
                                    type: `${type}_choice`,
                                    label: `Choose a ${type}`,
                                    options: resolution.candidates.map(candidate => type === 'form'
                                        ? { id: candidate.id, title: candidate.name }
                                        : { id: candidate.id, name: candidate.name })
                                }]
                            }
                        });
                        break;
                    }
                    toolResult = JSON.stringify({ resourceType: type, ...resolution });
                } else if (name === 'list_workflows') {
                    const workflows = await Workflow.findAll({ where: { userId }, attributes: ['id', 'name', 'updatedAt'], order: [['updatedAt', 'DESC']], limit: 50 });
                    const request = [...history]
                        .reverse()
                        .find(message => message.sender === 'user' && message.kind === 'text')?.text;
                    const likelyEditIntent = /\b(edit|update|modify|change|remove|delete|add|append|fix|adjust|existing|current)\b/i.test(request || '');
                    const shouldChooseTarget = args.purpose === 'choose_target' || likelyEditIntent;

                    if (workflows.length > 0 && request && shouldChooseTarget) {
                        await session.update({
                            agentState: {
                                status: 'awaiting_workflow_target',
                                continuation: { request }
                            }
                        });
                        replyObj = await saveReply(session, {
                            text: 'Which workflow would you like me to work on?',
                            kind: 'clarification',
                            payload: {
                                options: [{
                                    id: 'workflow-target',
                                    type: 'workflow_choice',
                                    label: 'Choose a workflow',
                                    options: workflows.map(workflow => ({ id: workflow.id, name: workflow.name }))
                                }]
                            }
                        });
                        break;
                    }

                    toolResult = JSON.stringify(workflows);
                } else if (name === 'get_form') {
                    const form = await Form.findOne({ where: { id: args.formId || args.id, userId } });
                    toolResult = form ? JSON.stringify(form) : JSON.stringify({ error: 'Form not found' });
                } else if (name === 'get_workflow') {
                    const workflow = await Workflow.findOne({ where: { id: args.workflowId || args.id, userId } });
                    toolResult = workflow ? JSON.stringify(workflow) : JSON.stringify({ error: 'Workflow not found' });
                } else if (name === 'get_form_context') {
                    const form = await formForRequest(userId, args.formId);
                    toolResult = JSON.stringify(compactFormContext(form));
                } else if (name === 'get_workflow_context') {
                    const workflow = await workflowForRequest(userId, args.workflowId);
                    toolResult = JSON.stringify(compactWorkflowContext(workflow));
                } else if (name === 'get_execution_summary') {
                    const where = { userId };
                    if (args.workflowId) where.workflowId = args.workflowId;
                    if (args.status && args.status !== 'All') where.status = args.status;
                    const logs = await ExecutionLog.findAll({
                        where,
                        attributes: ['id', 'time', 'durationMs', 'status', 'trigger', 'workflowId', 'error'],
                        include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'], required: false }],
                        order: [['time', 'DESC'], ['id', 'DESC']],
                        limit: Math.min(Math.max(Number(args.limit) || 5, 1), 10)
                    });
                    toolResult = JSON.stringify(logs.map(log => {
                        const value = log.toJSON ? log.toJSON() : log;
                        return {
                            ...value,
                            error: value.error ? String(value.error).slice(0, 500) : null
                        };
                    }));
                } else if (name === 'get_execution_details') {
                    const log = await ExecutionLog.findOne({
                        where: { id: args.logId, userId },
                        include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'], required: false }]
                    });
                    toolResult = log ? JSON.stringify(log) : JSON.stringify({ error: 'Execution log not found' });
                } else if (name === 'propose_form_change') {
                    const formId = args.formId || effectiveContext.formId || null;
                    const result = await formResult({ session, userId, request: args.prompt, formId, clarificationMode: effectiveContext.clarificationMode, state: { action: formId ? 'edit_form' : 'create_form' } });
                    if (result.reply?.kind === 'form_proposal') {
                        await session.update({ agentState: { proposalMessageId: result.reply.id } });
                    }
                    replyObj = result.reply;
                    break;
                } else if (name === 'propose_workflow_change') {
                    const workflowId = args.workflowId || effectiveContext.workflowId || null;
                    const workflow = await workflowForRequest(userId, workflowId);
                    const classification = await classifyRequest({ message: args.prompt, snapshot: compactWorkflowSnapshot(workflow) });
                    if (classification.action === 'edit_workflow' && workflowId) {
                        const selected = [...(classification.selectedNodeKeys || [])];
                        const affected = (workflow.nodes || [])
                            .filter(node => classification.affectedNodeIds.includes(node.id))
                            .map(node => `${node.type}:${node.subType}`);
                        selected.push(...affected);
                        const specs = NodeRegistry.getSchemasFor(selected);
                        
                        const patched = await patchWorkflow({ message: args.prompt, currentWorkflow: workflow.toJSON(), classification, specs });
                        replyObj = await saveReply(session, {
                            text: 'I prepared the requested workflow changes for your review.',
                            kind: 'workflow_diff',
                            payload: { action: 'edit_workflow', workflowId: workflow.id, nodes: patched.nodes, edges: patched.edges, diff: patched.diff, baseWorkflowUpdatedAt: workflow.updatedAt },
                            proposalStatus: 'pending'
                        });
                        await session.update({ agentState: { status: 'awaiting_workflow_approval', workflowId: workflow.id, proposalMessageId: replyObj.id } });
                        break;
                    } else {
                        const specs = NodeRegistry.getSchemasFor(classification.selectedNodeKeys || classification.selectedSubTypes);
                        const assembled = await assembleWorkflow({ message: args.prompt, specs, workflowName: classification.workflowName, formId: null });
                        replyObj = await saveReply(session, {
                            text: 'The workflow is ready for your review.',
                            kind: 'workflow_proposal',
                            payload: { action: 'create_workflow', name: assembled.name, intent: classification.intent, needsForm: false, nodes: assembled.nodes, edges: assembled.edges, plan: assembled.nodes.map(node => ({ subType: node.subType, title: node.title, reason: node.description })) },
                            proposalStatus: 'pending'
                        });
                        await session.update({ agentState: { status: 'awaiting_workflow_approval', workflowId: null, proposalMessageId: replyObj.id } });
                        break;
                    }
                } else {
                    toolResult = JSON.stringify({ error: 'Unknown tool' });
                }
            } catch (err) {
                toolResult = JSON.stringify({ error: err.message });
            }

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
                text: toolResult,
                kind: 'tool_response',
                ...(nativeToolCall ? { payload: { toolCallId: nativeToolCall.id, name: nativeToolCall.name } } : {})
            });

            if (nativeToolCall) {
                aiMessages.push({ role: 'model', parts: [{ text: replyText }], toolCalls: nativeToolCalls });
                aiMessages.push({ role: 'tool', toolCallId: nativeToolCall.id, name: nativeToolCall.name, content: toolResult });
            } else {
                aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
                aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>${toolResult}</TOOL_RESPONSE>` }] });
            }
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
