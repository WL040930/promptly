import { ChatSession, ChatMessage, Workflow, Form } from '../../models/index.js';
import { generateFormFromPrompt } from '../ai/aiFormsService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import {
    classifyRequest,
    compactWorkflowSnapshot,
    assembleWorkflow,
    patchWorkflow,
    tokenTotal
} from '../ai/workflowAgentService.js';
import { getAIProvider } from '../ai/aiService.js';
import env from '../../config/env.js';

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

const formHistory = async (sessionId) => {
    const rows = await ChatMessage.findAll({
        where: { sessionId },
        order: [['createdAt', 'ASC']],
        limit: 20,
        attributes: ['sender', 'text']
    });
    return rows.map(row => ({ sender: row.sender, text: row.text }));
};

const formResult = async ({ session, userId, request, formId, continuation = null, state = {} }) => {
    const form = await formForRequest(userId, formId);
    if (formId && !form) {
        const reply = await saveReply(session, { text: 'I could not find that form. Please choose one of your existing forms.', kind: 'error' });
        return { reply, tokenUsage: null };
    }
    const currentSchema = form ? form.toJSON() : state.currentSchema || {};
    const result = await generateFormFromPrompt(request, currentSchema, await formHistory(session.id));
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
            patches: result.patches || []
        },
        tokenUsage,
        proposalStatus: 'pending'
    });
    return { reply, tokenUsage };
};

export const applyEvent = async (session, userId, event) => {
    if (!event?.type) return null;
    const state = session.agentState || {};
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
        const specs = NodeRegistry.getSchemasFor(state.continuation.specSubTypes);
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
You have access to the following tools. If you need to use a tool, output exactly <TOOL>{"name": "tool_name", "args": {...}}</TOOL>.
Wait for the system to reply with <TOOL_RESPONSE>...</TOOL_RESPONSE> before continuing. If no tools are needed, simply reply to the user.

Tools available:
- list_forms(): Returns a list of the user's forms with their IDs and titles. No arguments.
- list_workflows(purpose: "choose_target" | "list"): Returns a list of the user's workflows with their IDs and names.
- get_form(formId: string): Returns the full schema of the specified form.
- get_workflow(workflowId: string): Returns the full structure of the specified workflow.
- propose_form_change(formId: string | null, prompt: string): Triggers the form builder to propose an edit or create a new form. If creating a new form, formId should be null.
- propose_workflow_change(workflowId: string | null, prompt: string): Triggers the workflow builder to propose an edit or create a new workflow. If creating a new workflow, workflowId should be null.

When the user clearly asks to create a new workflow, call propose_workflow_change with a null workflowId.
When the user asks to edit, update, or modify an existing workflow without identifying which one, call list_workflows with purpose "choose_target" first. The system will present the workflows as choices; do not guess a workflow.`;

export const processChatMessage = async ({ session, userId, context = {} }) => {
    const history = await ChatMessage.findAll({
        where: { sessionId: session.id },
        order: [['createdAt', 'ASC']],
        limit: 20
    });

    const aiMessages = history.map(msg => ({
        role: msg.sender === 'user' || msg.kind === 'tool_response' ? 'user' : 'model',
        parts: [{ text: msg.kind === 'tool_response' ? `<TOOL_RESPONSE>${msg.text}</TOOL_RESPONSE>` : msg.text }]
    }));

    const provider = getAIProvider();

    let loopCount = 0;
    const maxLoops = 5;
    let totalTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let replyObj = null;
    const selectedWorkflow = context.workflowId ? await workflowForRequest(userId, context.workflowId) : null;
    const selectedWorkflowInstruction = selectedWorkflow
        ? `\n\nThe user selected this existing workflow: ${selectedWorkflow.name} (ID: ${selectedWorkflow.id}). Use this workflow ID when proposing changes.`
        : '';

    while (loopCount < maxLoops) {
        loopCount++;
        const response = await provider.generateContent(aiMessages, {
            systemInstruction: `${systemInstruction}${selectedWorkflowInstruction}`,
            model: env.aiModel || 'gemini-2.5-pro'
        });

        if (response.usageMetadata) {
            totalTokenUsage.promptTokens += response.usageMetadata.promptTokens || response.usageMetadata.promptTokenCount || 0;
            totalTokenUsage.completionTokens += response.usageMetadata.completionTokens || response.usageMetadata.candidatesTokenCount || 0;
            totalTokenUsage.totalTokens = totalTokenUsage.promptTokens + totalTokenUsage.completionTokens;
        }

        const replyText = response.text;
        const toolMatch = replyText.match(/<TOOL>(.*?)<\/TOOL>/s);

        if (toolMatch) {
            let toolCall;
            try {
                toolCall = JSON.parse(toolMatch[1]);
            } catch (e) {
                aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
                aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>{"error": "Invalid JSON in tool call"}</TOOL_RESPONSE>` }] });
                continue;
            }

            const { name, args = {} } = toolCall;
            let toolResult = '';

            try {
                if (name === 'list_forms') {
                    const forms = await Form.findAll({ where: { userId }, attributes: ['id', 'title', 'updatedAt'], order: [['updatedAt', 'DESC']], limit: 50 });
                    toolResult = JSON.stringify(forms);
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
                } else if (name === 'propose_form_change') {
                    const result = await formResult({ session, userId, request: args.prompt, formId: args.formId, state: { action: args.formId ? 'edit_form' : 'create_form' } });
                    if (result.reply?.kind === 'form_proposal') {
                        await session.update({ agentState: { proposalMessageId: result.reply.id } });
                    }
                    replyObj = result.reply;
                    break;
                } else if (name === 'propose_workflow_change') {
                    const classification = await classifyRequest({ message: args.prompt, snapshot: compactWorkflowSnapshot(await workflowForRequest(userId, args.workflowId)) });
                    if (classification.action === 'edit_workflow' && args.workflowId) {
                        const workflow = await workflowForRequest(userId, args.workflowId);
                        const selected = [...classification.selectedSubTypes];
                        const affected = (workflow.nodes || []).filter(node => classification.affectedNodeIds.includes(node.id)).map(node => node.subType);
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
                        const specs = NodeRegistry.getSchemasFor(classification.selectedSubTypes);
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

            await ChatMessage.create({ sessionId: session.id, sender: 'bot', text: replyText, kind: 'tool_call' });
            await ChatMessage.create({ sessionId: session.id, sender: 'user', text: toolResult, kind: 'tool_response' });
            
            aiMessages.push({ role: 'model', parts: [{ text: replyText }] });
            aiMessages.push({ role: 'user', parts: [{ text: `<TOOL_RESPONSE>${toolResult}</TOOL_RESPONSE>` }] });
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
