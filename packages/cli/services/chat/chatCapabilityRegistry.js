import { AutomationRun, Form, FormResponse, Workflow } from '../../models/index.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { resolveResource } from './resourceResolver.js';
import {
    assembleWorkflow,
    classifyRequest,
    compactWorkflowSnapshot,
    patchWorkflow,
    requiredCapabilitiesForRequest
} from '../ai/workflow/workflowAgentService.js';
import { createAgentCapabilityRegistry } from '../agent/agentCapabilityRegistry.js';

const completed = output => ({ status: 'completed', output });

const clarification = reply => ({ status: 'awaiting_clarification', reply, output: { replyId: reply?.id || null } });

const approval = reply => ({ status: 'awaiting_approval', reply, output: { replyId: reply?.id || null } });

const formUses = (workflow, formId) => (workflow.nodes || [])
    .some(node => node.subType === 'form-submission' && node.config?.formId === formId);

const SENSITIVE_KEY = /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|credential|password|private[_-]?key|secret)/i;

const redactSensitive = (value, key = '', depth = 0) => {
    if (SENSITIVE_KEY.test(key)) return '[redacted]';
    if (depth > 8 || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => redactSensitive(item, '', depth + 1));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitive(entryValue, entryKey, depth + 1)
    ]));
};

const compactFormContext = form => {
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

const compactWorkflowContext = workflow => {
    if (!workflow) return { error: 'Workflow not found' };
    const value = workflow.toJSON ? workflow.toJSON() : workflow;
    return {
        id: value.id,
        name: value.name,
        status: value.status,
        isActive: value.isActive,
        revision: value.revision,
        updatedAt: value.updatedAt,
        nodes: (value.nodes || []).map(node => ({
            id: node.id,
            title: node.title,
            type: node.type,
            subType: node.subType
        })),
        edges: (value.edges || []).map(edge => ({
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle || null,
            targetHandle: edge.targetHandle || null
        }))
    };
};

const tool = (name, description, parameters, execute, risk = 'read') => ({
    name,
    description,
    risk,
    inputSchema: {
        type: 'object',
        properties: parameters,
        required: Object.keys(parameters),
        additionalProperties: false
    },
    execute
});

/**
 * Build the chat capability registry for one authenticated turn.
 *
 * The factory is the seam between the chat transport and domain adapters. A
 * capability returns an observation or a user-facing terminal reply; the
 * generic runtime does not know about Sequelize, forms, or workflows.
 */
export const createChatCapabilityRegistry = ({
    session,
    userId,
    effectiveContext,
    history,
    services
}) => {
    const {
        saveReply,
        formForRequest,
        workflowForRequest,
        formResult
    } = services;

    return createAgentCapabilityRegistry([
        tool(
            'list_forms',
            'List the user forms as compact summaries, newest first.',
            {},
            async () => completed((await Form.findAll({
                where: { userId },
                attributes: ['id', 'title', 'updatedAt'],
                order: [['updatedAt', 'DESC']],
                limit: 50
            })).map(form => redactSensitive(form.toJSON ? form.toJSON() : form)))
        ),
        tool(
            'list_workflows',
            'List the user workflows as compact summaries, newest first. Use purpose choose_target when the user must select an existing workflow.',
            { purpose: { type: 'string', enum: ['choose_target', 'list'] } },
            async ({ args }) => {
                const workflows = await Workflow.findAll({
                    where: { userId },
                    attributes: ['id', 'name', 'updatedAt'],
                    order: [['updatedAt', 'DESC']],
                    limit: 50
                });
                const request = [...history]
                    .reverse()
                    .find(message => message.sender === 'user' && message.kind === 'text')?.text;
                if (args.purpose === 'choose_target' && workflows.length > 0 && request) {
                    await session.update({
                        state: {
                            status: 'awaiting_workflow_target',
                            continuation: { request }
                        }
                    });
                    return clarification(await saveReply(session, {
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
                    }));
                }
                return completed(workflows.map(workflow => redactSensitive(workflow.toJSON ? workflow.toJSON() : workflow)));
            }
        ),
        tool(
            'search_resources',
            'Find a form or workflow by its ID or name. Use this before editing a named resource.',
            {
                resourceType: { type: 'string', enum: ['form', 'workflow', 'execution'] },
                query: { type: 'string' }
            },
            async ({ args }) => {
                const result = await resolveResource({ userId, type: args.resourceType, reference: args.query || '' });
                if (result.status === 'ambiguous') {
                    const type = args.resourceType;
                    const request = [...history]
                        .reverse()
                        .find(message => message.sender === 'user' && message.kind === 'text')?.text;
                    await session.update({
                        state: {
                            status: `awaiting_${type}_target`,
                            continuation: { request }
                        }
                    });
                    return clarification(await saveReply(session, {
                        text: `I found multiple ${type}s that match. Which one should I use?`,
                        kind: 'clarification',
                        payload: {
                            options: [{
                                id: `${type}-target`,
                                type: `${type}_choice`,
                                label: `Choose a ${type}`,
                                options: result.candidates.map(candidate => type === 'form'
                                    ? { id: candidate.id, title: candidate.name }
                                    : { id: candidate.id, name: candidate.name })
                            }]
                        }
                    }));
                }
                return completed({ resourceType: args.resourceType, ...result });
            }
        ),
        tool(
            'get_form',
            'Get the full schema for one form after its target is resolved.',
            { formId: { type: 'string' } },
            async ({ args }) => {
                const form = await Form.findOne({ where: { id: args.formId, userId } });
                return completed(form ? redactSensitive(form.toJSON ? form.toJSON() : form) : { error: 'Form not found' });
            }
        ),
        tool(
            'get_workflow',
            'Get the full structure for one workflow after its target is resolved.',
            { workflowId: { type: 'string' } },
            async ({ args }) => {
                const workflow = await Workflow.findOne({ where: { id: args.workflowId, userId } });
                return completed(workflow ? redactSensitive(workflow.toJSON ? workflow.toJSON() : workflow) : { error: 'Workflow not found' });
            }
        ),
        tool(
            'get_form_context',
            'Get a compact definition of one form without loading response data.',
            { formId: { type: 'string' } },
            async ({ args }) => completed(compactFormContext(await formForRequest(userId, args.formId)))
        ),
        tool(
            'get_form_dependencies',
            'Find workflows that use a form submission trigger for this form.',
            { formId: { type: 'string' } },
            async ({ args }) => {
                const form = await Form.findOne({ where: { id: args.formId, userId }, attributes: ['id', 'title', 'updatedAt', 'responseCount'] });
                if (!form) return completed({ error: 'Form not found' });
                const workflows = await Workflow.findAll({
                    where: { userId },
                    attributes: ['id', 'name', 'updatedAt', 'isActive', 'nodes'],
                    order: [['updatedAt', 'DESC']]
                });
                const dependencies = workflows
                    .filter(workflow => (workflow.nodes || []).some(node => node.subType === 'form-submission' && node.config?.formId === form.id))
                    .map(workflow => redactSensitive(workflow.toJSON ? workflow.toJSON() : workflow));
                return completed({
                    form: redactSensitive(form.toJSON ? form.toJSON() : form),
                    workflows: dependencies,
                    canDelete: dependencies.length === 0
                });
            }
        ),
        tool(
            'get_form_response_summary',
            'Get a count and recent timestamps for a form without loading response contents.',
            { formId: { type: 'string' } },
            async ({ args }) => {
                const form = await Form.findOne({ where: { id: args.formId, userId }, attributes: ['id', 'title', 'responseCount'] });
                if (!form) return completed({ error: 'Form not found' });
                const recent = await FormResponse.findAll({
                    where: { formId: form.id },
                    attributes: ['id', 'createdAt'],
                    order: [['createdAt', 'DESC']],
                    limit: 5
                });
                return completed({
                    formId: form.id,
                    title: form.title,
                    responseCount: Number(form.responseCount || 0),
                    recentResponses: recent.map(response => ({ id: response.id, createdAt: response.createdAt }))
                });
            }
        ),
        tool(
            'get_workflow_context',
            'Get compact workflow metadata, nodes, and edges without loading version history.',
            { workflowId: { type: 'string' } },
            async ({ args }) => completed(compactWorkflowContext(await workflowForRequest(userId, args.workflowId)))
        ),
        tool(
            'get_execution_summary',
            'List recent execution results for troubleshooting, with step payloads excluded.',
            {
                workflowId: { type: ['string', 'null'] },
                status: { type: 'string', enum: ['All', 'Success', 'Failed'] },
                limit: { type: 'integer', minimum: 1, maximum: 10 }
            },
            async ({ args }) => {
                const where = { userId };
                if (args.workflowId) where.workflowId = args.workflowId;
                if (args.status && args.status !== 'All') where.status = args.status;
                const logs = await AutomationRun.findAll({
                    where,
                    attributes: ['id', 'time', 'durationMs', 'status', 'trigger', 'workflowId', 'error'],
                    include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'], required: false }],
                    order: [['time', 'DESC'], ['id', 'DESC']],
                    limit: Math.min(Math.max(Number(args.limit) || 5, 1), 10)
                });
                return completed(logs.map(log => {
                    const value = log.toJSON ? log.toJSON() : log;
                    return {
                        ...value,
                        error: value.error ? String(value.error).slice(0, 500) : null
                    };
                }));
            }
        ),
        tool(
            'get_execution_details',
            'Get one execution log including its step details and error.',
            { logId: { type: 'string' } },
            async ({ args }) => {
                const log = await AutomationRun.findOne({
                    where: { id: args.logId, userId },
                    include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name'], required: false }]
                });
                return completed(log ? redactSensitive(log.toJSON ? log.toJSON() : log) : { error: 'Execution log not found' });
            }
        ),
        tool(
            'propose_form_change',
            'Prepare a reviewable form creation or form change proposal. Do not apply changes.',
            {
                formId: { type: ['string', 'null'] },
                prompt: { type: 'string' }
            },
            async ({ args }) => {
                const formId = args.formId || effectiveContext.formId || null;
                const result = await formResult({
                    session,
                    userId,
                    request: args.prompt,
                    formId,
                    clarificationMode: effectiveContext.clarificationMode,
                    state: { action: formId ? 'edit_form' : 'create_form' }
                });
                if (result.reply?.kind === 'form_proposal') {
                    await session.update({ state: { proposalMessageId: result.reply.id } });
                    return approval(result.reply);
                }
                if (result.reply?.kind === 'text') return completed(result.reply);
                return clarification(result.reply);
            },
            'proposal'
        ),
        tool(
            'propose_form_duplicate',
            'Prepare a reviewable copy of an existing form. Do not create the copy yet.',
            {
                formId: { type: 'string' },
                title: { type: 'string' }
            },
            async ({ args }) => {
                const form = await formForRequest(userId, args.formId);
                if (!form) return completed({ error: 'Form not found' });
                const reply = await saveReply(session, {
                    text: 'I prepared a copy of the form for your review.',
                    kind: 'form_duplicate_proposal',
                    payload: {
                        action: 'duplicate_form',
                        formId: form.id,
                        sourceTitle: form.title,
                        title: String(args.title || `${form.title} copy`).trim().slice(0, 255),
                        schema: {
                            title: String(args.title || `${form.title} copy`).trim().slice(0, 255),
                            description: form.description || '',
                            settings: form.settings || {},
                            fields: form.fields || []
                        },
                        baseFormUpdatedAt: form.updatedAt
                    },
                    proposalStatus: 'pending'
                });
                    await session.update({ state: { status: 'awaiting_form_approval', formId: form.id, proposalMessageId: reply.id } });
                return approval(reply);
            },
            'proposal'
        ),
        tool(
            'propose_form_delete',
            'Prepare a reviewable permanent form deletion. Always inspect dependencies and response count first.',
            { formId: { type: 'string' } },
            async ({ args }) => {
                const form = await Form.findOne({ where: { id: args.formId, userId }, attributes: ['id', 'title', 'updatedAt', 'responseCount'] });
                if (!form) return completed({ error: 'Form not found' });
                const workflows = await Workflow.findAll({ where: { userId }, attributes: ['id', 'name', 'updatedAt', 'isActive', 'nodes'] });
                const dependencies = workflows
                    .filter(workflow => (workflow.nodes || []).some(node => node.subType === 'form-submission' && node.config?.formId === form.id))
                    .map(workflow => ({ id: workflow.id, name: workflow.name, isActive: workflow.isActive }));
                if (dependencies.length > 0) {
                    return clarification(await saveReply(session, {
                        text: `I cannot prepare deletion yet because ${dependencies.length} workflow${dependencies.length === 1 ? '' : 's'} still use this form. Remove or update those workflow references first.`,
                        kind: 'clarification',
                        payload: { formId: form.id, dependencies }
                    }));
                }
                const reply = await saveReply(session, {
                    text: `I prepared permanent deletion of “${form.title}”. This will remove the form and its ${Number(form.responseCount || 0)} response${Number(form.responseCount || 0) === 1 ? '' : 's'}.`,
                    kind: 'form_delete_proposal',
                    payload: {
                        action: 'delete_form',
                        formId: form.id,
                        title: form.title,
                        responseCount: Number(form.responseCount || 0),
                        permanent: true,
                        baseFormUpdatedAt: form.updatedAt
                    },
                    proposalStatus: 'pending'
                });
                    await session.update({ state: { status: 'awaiting_form_delete_approval', formId: form.id, proposalMessageId: reply.id } });
                return approval(reply);
            },
            'proposal'
        ),
        tool(
            'propose_delete_all_forms',
            'Prepare one reviewable permanent deletion proposal for every form in the account. Never apply the deletion without explicit user approval.',
            {},
            async () => {
                const forms = await Form.findAll({
                    where: { userId },
                    attributes: ['id', 'title', 'updatedAt', 'responseCount'],
                    order: [['updatedAt', 'DESC']]
                });
                if (forms.length === 0) {
                    return completed({ message: 'There are no forms in this account to delete.', forms: [] });
                }

                const workflows = await Workflow.findAll({
                    where: { userId },
                    attributes: ['id', 'name', 'updatedAt', 'isActive', 'nodes']
                });
                const dependencies = forms
                    .map(form => ({
                        formId: form.id,
                        title: form.title,
                        workflows: workflows
                            .filter(workflow => formUses(workflow, form.id))
                            .map(workflow => ({ id: workflow.id, name: workflow.name, isActive: workflow.isActive }))
                    }))
                    .filter(item => item.workflows.length > 0);
                if (dependencies.length > 0) {
                    const blockedCount = dependencies.reduce((total, item) => total + item.workflows.length, 0);
                    return clarification(await saveReply(session, {
                        text: `I cannot prepare an all-forms deletion yet because ${dependencies.length} form${dependencies.length === 1 ? '' : 's'} are still used by ${blockedCount} workflow${blockedCount === 1 ? '' : 's'}. Remove or update those workflow references first.`,
                        kind: 'clarification',
                        payload: { action: 'delete_all_forms_blocked', dependencies }
                    }));
                }

                const formSummaries = forms.map(form => ({
                    id: form.id,
                    title: form.title,
                    responseCount: Number(form.responseCount || 0),
                    baseFormUpdatedAt: form.updatedAt
                }));
                const totalResponseCount = formSummaries.reduce((total, form) => total + form.responseCount, 0);
                const reply = await saveReply(session, {
                    text: `I prepared permanent deletion of all ${forms.length} forms. This will remove ${totalResponseCount} response${totalResponseCount === 1 ? '' : 's'} as well.`,
                    kind: 'form_bulk_delete_proposal',
                    payload: {
                        action: 'delete_forms',
                        forms: formSummaries,
                        formCount: forms.length,
                        totalResponseCount,
                        permanent: true
                    },
                    proposalStatus: 'pending'
                });
                await session.update({
                    state: {
                        status: 'awaiting_form_bulk_delete_approval',
                        formIds: forms.map(form => form.id),
                        proposalMessageId: reply.id
                    }
                });
                return approval(reply);
            },
            'proposal'
        ),
        tool(
            'propose_form_response_clear',
            'Prepare a reviewable permanent deletion of all responses for a form.',
            { formId: { type: 'string' } },
            async ({ args }) => {
                const form = await formForRequest(userId, args.formId);
                if (!form) return completed({ error: 'Form not found' });
                const reply = await saveReply(session, {
                    text: `I prepared deletion of all ${Number(form.responseCount || 0)} responses for “${form.title}”.`,
                    kind: 'form_response_clear_proposal',
                    payload: {
                        action: 'clear_form_responses',
                        formId: form.id,
                        title: form.title,
                        responseCount: Number(form.responseCount || 0),
                        baseFormUpdatedAt: form.updatedAt
                    },
                    proposalStatus: 'pending'
                });
                    await session.update({ state: { status: 'awaiting_form_response_clear_approval', formId: form.id, proposalMessageId: reply.id } });
                return approval(reply);
            },
            'proposal'
        ),
        tool(
            'propose_workflow_change',
            'Prepare a reviewable workflow creation or workflow change proposal. Do not apply changes.',
            {
                workflowId: { type: ['string', 'null'] },
                prompt: { type: 'string' }
            },
            async ({ args }) => {
                const workflowId = args.workflowId || effectiveContext.workflowId || null;
                const workflow = await workflowForRequest(userId, workflowId);
                const requiredCapabilities = requiredCapabilitiesForRequest(args.prompt);
                const classification = await classifyRequest({
                    message: args.prompt,
                    snapshot: compactWorkflowSnapshot(workflow),
                    requiredCapabilities
                });
                if (classification.action === 'edit_workflow' && workflowId && workflow) {
                    const selected = [...(classification.selectedNodeKeys || [])];
                    const affected = (workflow.nodes || [])
                        .filter(node => classification.affectedNodeIds.includes(node.id))
                        .map(node => `${node.type}:${node.subType}`);
                    const specs = NodeRegistry.getSchemasFor([...selected, ...affected]);
                    const selectedForm = effectiveContext.formId ? await formForRequest(userId, effectiveContext.formId) : null;
                    const patched = await patchWorkflow({
                        message: args.prompt,
                        currentWorkflow: workflow.toJSON(),
                        classification,
                        specs,
                        formSchema: selectedForm?.toJSON?.() || selectedForm || null,
                        requiredCapabilities
                    });
                    const reply = await saveReply(session, {
                        text: 'I prepared the requested workflow changes for your review.',
                        kind: 'workflow_diff',
                        payload: {
                            action: 'edit_workflow',
                            workflowId: workflow.id,
                            nodes: patched.nodes,
                            edges: patched.edges,
                            diff: patched.diff,
                            baseWorkflowRevision: workflow.revision
                        },
                        proposalStatus: 'pending'
                    });
                    await session.update({ state: {
                        status: 'awaiting_workflow_approval',
                        workflowId: workflow.id,
                        proposalMessageId: reply.id
                    } });
                    return approval(reply);
                }

                const specs = NodeRegistry.getSchemasFor(classification.selectedNodeKeys);
                const selectedForm = effectiveContext.formId ? await formForRequest(userId, effectiveContext.formId) : null;
                const assembled = await assembleWorkflow({
                    message: args.prompt,
                    specs,
                    workflowName: classification.workflowName,
                    formId: selectedForm?.id || null,
                    formSchema: selectedForm?.toJSON?.() || selectedForm || null,
                    requiredCapabilities
                });
                const reply = await saveReply(session, {
                    text: 'The workflow is ready for your review.',
                    kind: 'workflow_proposal',
                    payload: {
                        action: 'create_workflow',
                        ...(workflow ? { workflowId: workflow.id, baseWorkflowRevision: workflow.revision } : {}),
                        name: assembled.name,
                        intent: classification.intent,
                        needsForm: false,
                        nodes: assembled.nodes,
                        edges: assembled.edges,
                        plan: assembled.nodes.map(node => ({
                            subType: node.subType,
                            title: node.title,
                            reason: node.description
                        }))
                    },
                    proposalStatus: 'pending'
                });
                    await session.update({ state: {
                    status: 'awaiting_workflow_approval',
                    workflowId: null,
                    proposalMessageId: reply.id
                } });
                return approval(reply);
            },
            'proposal'
        )
    ]);
};
