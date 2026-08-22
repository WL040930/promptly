import { AssistantMessage, Workflow } from '../../models/index.js';
import sequelize from '../../db/index.js';
import {
    WORKFLOW_LIFECYCLE_ACTIONS,
    describeWorkflowLifecycleAction,
    performWorkflowLifecycleAction
} from '../automations/workflowLifecycleService.js';
import { clearChatSessionState, replaceChatSessionState } from './chatTurnLifecycle.js';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const RUN_STATUSES_THAT_CAN_CONTINUE = new Set(['succeeded', 'waiting', 'running', 'resuming', 'pending']);

const errorWith = (code, message, status = 409, extra = {}) => Object.assign(new Error(message), {
    code,
    status,
    ...extra
});

const messagePayload = message => {
    const json = message.toJSON ? message.toJSON() : message;
    return {
        id: json.id,
        sender: json.sender,
        text: json.text,
        createdAt: json.createdAt,
        kind: json.kind || 'text',
        payload: json.payload || null,
        proposalStatus: json.proposalStatus || null,
        tokenUsage: json.tokenUsage || null,
        errorMetadata: json.errorMetadata || null,
        isError: json.isError === true
    };
};

const normalizeActions = actions => {
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > 3) {
        throw errorWith('WORKFLOW_LIFECYCLE_ACTIONS_INVALID', 'Provide between one and three workflow actions.', 400);
    }
    const normalized = actions.map(action => {
        const value = String(action || '').trim().toLowerCase();
        if (!WORKFLOW_LIFECYCLE_ACTIONS.includes(value)) {
            throw errorWith('WORKFLOW_LIFECYCLE_ACTION_INVALID', `Unsupported workflow action "${action}".`, 400);
        }
        return value;
    });
    return normalized;
};

const workflowSummary = workflow => {
    const value = workflow?.toJSON?.() || workflow || {};
    return {
        id: value.id,
        name: value.name,
        status: value.status,
        isActive: value.isActive === true,
        revision: Number(value.revision || 0),
        publishedRevisionId: value.publishedRevisionId || null
    };
};

const runSummary = run => {
    const value = run?.toJSON?.() || run || null;
    if (!value) return null;
    return {
        id: value.id,
        status: value.status,
        durationMs: value.durationMs ?? null,
        error: value.error || null,
        trigger: value.trigger || null,
        revisionId: value.revisionId || null,
        completedAt: value.completedAt || null
    };
};

const operationSummary = result => ({
    action: result.action,
    workflow: workflowSummary(result.workflow),
    ...(result.run ? { run: runSummary(result.run) } : {})
});

const actionText = ({ plan, remainingActions = [] }) => {
    const followUp = remainingActions.length > 0
        ? ` After this, I will ask you to approve: ${remainingActions.join(' → ')}.`
        : '';
    return `${plan.summary}${followUp}`;
};

const runPayloadClarification = async ({ session, workflowId, actions, plan }) => {
    await replaceChatSessionState(session, {
        status: 'awaiting_workflow_run_payload',
        workflowId,
        continuation: { workflowId, actions }
    });
    const clarification = await AssistantMessage.create({
        threadId: session.id,
        sender: 'bot',
        text: `Provide the JSON payload for the ${plan.label.toLowerCase()} action on “${plan.workflowName}”.`,
        kind: 'clarification',
        payload: {
            inputs: [{
                id: 'workflow-run-payload',
                type: 'textarea',
                label: 'Run payload (JSON)',
                required: true,
                multiline: true,
                workflowRunPayload: true,
                placeholder: '{\n  "key": "value"\n}'
            }],
            workflowRun: { workflowId, actions, triggerType: plan.triggerType }
        }
    });
    return {
        status: 'awaiting_clarification',
        reply: messagePayload(clarification),
        output: { replyId: clarification.id }
    };
};

/**
 * Prepare one lifecycle action behind the same proposal seam used by forms
 * and workflow edits. A run payload is collected before the pending action is
 * created so the approval card always shows exactly what will be executed.
 */
export const createWorkflowLifecycleProposal = async ({
    session,
    userId,
    workflowId,
    actions,
    payload = null
} = {}) => {
    const normalizedActions = normalizeActions(actions);
    const workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
    if (!workflow) throw errorWith('WORKFLOW_NOT_FOUND', 'Workflow not found.', 404);

    const [action, ...remainingActions] = normalizedActions;
    const plan = describeWorkflowLifecycleAction({ workflow, action });
    if (plan.requiresPayload && payload === null) {
        return runPayloadClarification({ session, workflowId, actions: normalizedActions, plan });
    }
    if (payload !== null && !isPlainObject(payload)) {
        throw errorWith('WORKFLOW_LIFECYCLE_PAYLOAD_INVALID', 'Run payload must be a JSON object.', 400);
    }

    const resolvedPayload = plan.requiresPayload ? payload : {};
    const reply = await AssistantMessage.create({
        threadId: session.id,
        sender: 'bot',
        text: actionText({ plan, remainingActions }),
        kind: 'workflow_lifecycle_proposal',
        proposalStatus: 'pending',
        payload: {
            ...plan,
            actions: normalizedActions,
            remainingActions,
            ...(plan.requiresPayload ? { runPayload: resolvedPayload } : {})
        }
    });
    await replaceChatSessionState(session, {
        status: 'awaiting_workflow_lifecycle_approval',
        workflowId,
        proposalMessageId: reply.id
    });
    return {
        status: 'awaiting_approval',
        reply: messagePayload(reply),
        output: { replyId: reply.id }
    };
};

const errorResult = error => ({
    code: error?.code || 'WORKFLOW_LIFECYCLE_FAILED',
    message: error?.message || 'The workflow action could not be completed.'
});

const markLifecycleFailure = async ({ session, message, error }) => {
    const stale = error?.code === 'WORKFLOW_LIFECYCLE_STALE';
    const status = stale ? 'stale' : 'failed';
    await sequelize.transaction(async transaction => {
        const locked = await AssistantMessage.findOne({
            where: { id: message.id, threadId: session.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!locked) return;
        await locked.update({
            proposalStatus: status,
            payload: { ...(locked.payload || {}), error: errorResult(error), failedAt: new Date().toISOString() }
        }, { transaction });
    });
    await clearChatSessionState(session);
    const latest = await AssistantMessage.findOne({ where: { id: message.id, threadId: session.id } });
    return {
        status,
        message: messagePayload(latest || message),
        resource: { error: errorResult(error) }
    };
};

export const decideWorkflowLifecycleProposal = async ({ session, userId, messageId, action = 'approve' } = {}) => {
    if (!session?.id || !messageId) throw errorWith('CHAT_PROPOSAL_REQUIRED', 'A session and proposal message are required.', 400);

    let message;
    await sequelize.transaction(async transaction => {
        message = await AssistantMessage.findOne({
            where: { id: messageId, threadId: session.id, kind: 'workflow_lifecycle_proposal' },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!message) throw errorWith('CHAT_PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
        if (message.proposalStatus === 'applied') return;
        if (message.proposalStatus !== 'pending') {
            throw errorWith(
                message.proposalStatus === 'applying' ? 'CHAT_PROPOSAL_APPLYING' : 'CHAT_PROPOSAL_NOT_PENDING',
                message.proposalStatus === 'applying' ? 'This workflow action is already being processed.' : 'This proposal is no longer pending.',
                409
            );
        }
        if (action === 'reject' || action === 'ignore') {
            await message.update({ proposalStatus: 'ignored' }, { transaction });
            return;
        }
        await message.update({
            proposalStatus: 'applying',
            payload: {
                ...(message.payload || {}),
                execution: { key: message.id, startedAt: new Date().toISOString() }
            }
        }, { transaction });
    });

    if (action === 'reject' || action === 'ignore') {
        await clearChatSessionState(session);
        return { status: 'ignored', message: messagePayload(message) };
    }
    if (message.proposalStatus === 'applied') {
        return { status: 'applied', message: messagePayload(message), resource: message.payload?.result || null };
    }

    const proposal = message.payload || {};
    let operation;
    try {
        operation = await performWorkflowLifecycleAction({
            workflowId: proposal.workflowId,
            userId,
            action: proposal.action,
            payload: proposal.runPayload || {},
            expected: proposal.expected,
            executionKey: message.id,
            trigger: `ask-promptly:${proposal.action}:${message.id}`
        });
    } catch (error) {
        return markLifecycleFailure({ session, message, error });
    }

    const resource = operationSummary(operation);
    const runFailed = resource.run && !RUN_STATUSES_THAT_CAN_CONTINUE.has(resource.run.status);
    const nextPayload = {
        ...proposal,
        result: resource,
        appliedAt: new Date().toISOString()
    };
    await sequelize.transaction(async transaction => {
        const locked = await AssistantMessage.findOne({
            where: { id: message.id, threadId: session.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!locked) throw errorWith('CHAT_PROPOSAL_NOT_FOUND', 'Proposal not found.', 404);
        await locked.update({ proposalStatus: 'applied', payload: nextPayload }, { transaction });
        await clearChatSessionState(session, { transaction });
        message = locked;
    });

    const response = {
        status: 'applied',
        message: messagePayload(message),
        resource
    };
    if (!runFailed && Array.isArray(proposal.remainingActions) && proposal.remainingActions.length > 0) {
        const next = await createWorkflowLifecycleProposal({
            session,
            userId,
            workflowId: proposal.workflowId,
            actions: proposal.remainingActions
        });
        response.nextProposal = next.reply || null;
    }
    return response;
};

const parsePayload = value => {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw errorWith('WORKFLOW_LIFECYCLE_PAYLOAD_INVALID', 'Run payload must be valid JSON.', 400);
        }
    }
    if (!isPlainObject(parsed)) throw errorWith('WORKFLOW_LIFECYCLE_PAYLOAD_INVALID', 'Run payload must be a JSON object.', 400);
    return parsed;
};

export const handleWorkflowRunPayloadEvent = async ({ session, userId, event } = {}) => {
    const state = session?.state || {};
    if (state.status !== 'awaiting_workflow_run_payload') {
        throw errorWith('WORKFLOW_RUN_PAYLOAD_NOT_EXPECTED', 'There is no workflow run waiting for payload data.', 409);
    }
    const rawPayload = event?.state?.['workflow-run-payload'];
    const payload = parsePayload(rawPayload);
    const clarification = await AssistantMessage.findOne({
        where: { threadId: session.id, sender: 'bot', kind: 'clarification' },
        order: [['createdAt', 'DESC']]
    });
    if (clarification) await clarification.update({
        payload: {
            ...(clarification.payload || {}),
            selectedState: { 'workflow-run-payload': rawPayload },
            resolution: { type: 'answered', answeredAt: new Date().toISOString(), answers: [{ id: 'workflow-run-payload', answer: rawPayload }] }
        }
    });

    const continuation = state.continuation || {};
    await clearChatSessionState(session);
    try {
        return {
            reply: (await createWorkflowLifecycleProposal({
                session,
                userId,
                workflowId: continuation.workflowId,
                actions: continuation.actions,
                payload
            })).reply
        };
    } catch (error) {
        return {
            reply: await AssistantMessage.create({
                threadId: session.id,
                sender: 'bot',
                text: error.message || 'I could not prepare that workflow run.',
                kind: 'error',
                payload: { code: error.code || 'WORKFLOW_LIFECYCLE_FAILED' },
                isError: true
            }).then(messagePayload)
        };
    }
};

export const workflowLifecycleInternals = {
    normalizeActions,
    workflowSummary,
    runSummary,
    operationSummary,
    parsePayload
};
