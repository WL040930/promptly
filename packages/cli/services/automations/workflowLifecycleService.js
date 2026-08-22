import { Workflow } from '../../models/index.js';
import { executeWorkflow } from '../engine/executionEngine.js';
import SchedulerService from '../scheduler/schedulerService.js';
import { reconcileWorkflow, removeWorkflow } from '../triggers/triggerRuntime.js';
import { deactivateWorkflowTriggerBindings } from '../triggers/workflowTriggerBindingService.js';
import { pauseAutomation, publishAutomation } from './automationService.js';

export const WORKFLOW_LIFECYCLE_ACTIONS = Object.freeze([
    'publish',
    'pause',
    'test_run',
    'live_run'
]);

const ACTION_LABELS = Object.freeze({
    publish: 'Publish',
    pause: 'Pause',
    test_run: 'Run test',
    live_run: 'Run live'
});

const asJson = value => value?.toJSON?.() || value || null;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const errorWith = (code, message, status = 409, extra = {}) => Object.assign(new Error(message), {
    code,
    status,
    ...extra
});

export const normalizeWorkflowLifecycleAction = action => {
    const normalized = String(action || '').trim().toLowerCase();
    if (!WORKFLOW_LIFECYCLE_ACTIONS.includes(normalized)) {
        throw errorWith('WORKFLOW_LIFECYCLE_ACTION_INVALID', `Unsupported workflow action "${action}".`, 400);
    }
    return normalized;
};

export const workflowLifecycleActionLabel = action => ACTION_LABELS[normalizeWorkflowLifecycleAction(action)];

export const workflowLifecycleExpectation = (workflow, action) => {
    const normalizedAction = normalizeWorkflowLifecycleAction(action);
    const value = asJson(workflow) || {};
    if (['publish', 'test_run'].includes(normalizedAction)) {
        return { draftRevision: Number(value.revision || 0) };
    }
    return {
        publishedRevisionId: value.publishedRevisionId || null,
        isActive: value.isActive === true
    };
};

export const assertWorkflowLifecycleExpectation = (workflow, expected = {}) => {
    const value = asJson(workflow) || {};
    if (expected.draftRevision !== undefined && Number(value.revision || 0) !== Number(expected.draftRevision)) {
        throw errorWith(
            'WORKFLOW_LIFECYCLE_STALE',
            'This workflow draft changed while the action was waiting for approval. Generate a new action proposal.',
            409,
            { expected, current: workflowLifecycleExpectation(value, 'test_run') }
        );
    }
    if (expected.publishedRevisionId !== undefined && (value.publishedRevisionId || null) !== (expected.publishedRevisionId || null)) {
        throw errorWith(
            'WORKFLOW_LIFECYCLE_STALE',
            'This workflow release changed while the action was waiting for approval. Generate a new action proposal.',
            409,
            { expected, current: workflowLifecycleExpectation(value, 'live_run') }
        );
    }
    if (expected.isActive !== undefined && (value.isActive === true) !== Boolean(expected.isActive)) {
        throw errorWith(
            'WORKFLOW_LIFECYCLE_STALE',
            'This workflow status changed while the action was waiting for approval. Generate a new action proposal.',
            409,
            { expected, current: workflowLifecycleExpectation(value, 'live_run') }
        );
    }
};

const triggerTypeFor = workflow => {
    const trigger = (asJson(workflow)?.nodes || []).find(node => node?.type === 'trigger');
    const subtype = String(trigger?.subType || '').toLowerCase();
    if (subtype.includes('form')) return 'form';
    if (subtype.includes('webhook')) return 'webhook';
    if (subtype.includes('schedule') || subtype.includes('cron')) return 'schedule';
    return 'manual';
};

export const describeWorkflowLifecycleAction = ({ workflow, action } = {}) => {
    const value = asJson(workflow);
    if (!value?.id) throw errorWith('WORKFLOW_NOT_FOUND', 'Workflow not found.', 404);
    const normalizedAction = normalizeWorkflowLifecycleAction(action);
    if (['publish', 'test_run'].includes(normalizedAction) && (!Array.isArray(value.nodes) || value.nodes.length === 0)) {
        throw errorWith('WORKFLOW_NOT_RUNNABLE', 'This workflow has no steps to operate on.', 409);
    }
    if (normalizedAction === 'pause' && value.isActive !== true) {
        throw errorWith('WORKFLOW_NOT_ACTIVE', 'This workflow is not currently live.', 409);
    }
    if (normalizedAction === 'live_run' && (!value.isActive || !value.publishedRevisionId)) {
        throw errorWith('WORKFLOW_NOT_LIVE', 'Publish and activate this workflow before running it live.', 409);
    }

    const triggerType = triggerTypeFor(value);
    const requiresPayload = ['test_run', 'live_run'].includes(normalizedAction) && triggerType !== 'schedule';
    const label = workflowLifecycleActionLabel(normalizedAction);
    const summary = normalizedAction === 'publish'
        ? `Publish “${value.name}” and activate its current draft.`
        : normalizedAction === 'pause'
            ? `Pause “${value.name}” and stop its live triggers.`
            : normalizedAction === 'test_run'
                ? `Run the current draft of “${value.name}” as a test.`
                : `Run the published version of “${value.name}” with real side effects.`;

    return {
        action: normalizedAction,
        label,
        workflowId: value.id,
        workflowName: value.name || 'Untitled automation',
        expected: workflowLifecycleExpectation(value, normalizedAction),
        triggerType,
        requiresPayload,
        summary,
        warning: normalizedAction === 'live_run'
            ? 'This uses the published version and may send emails, create records, call webhooks, or use connected services immediately.'
            : normalizedAction === 'test_run'
                ? 'Test runs can still reach connected services depending on the workflow steps.'
                : null
    };
};

const syncSchedule = (workflowId, userId, nodes, isActive) => {
    const scheduleNode = (nodes || []).find(node => node?.type === 'trigger' && node?.subType === 'schedule');
    if (scheduleNode && isActive) {
        const { cronExpression = '0 9 * * *', timezone = 'UTC' } = scheduleNode.config || {};
        SchedulerService.register(workflowId, userId, cronExpression, timezone);
    } else {
        SchedulerService.deregister(workflowId);
    }
};

const ensurePayload = payload => {
    if (payload === undefined || payload === null) return {};
    if (!isPlainObject(payload)) throw errorWith('WORKFLOW_LIFECYCLE_PAYLOAD_INVALID', 'Run payload must be a JSON object.', 400);
    return payload;
};

const findWorkflow = async ({ workflowId, userId }) => {
    const workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
    if (!workflow) throw errorWith('WORKFLOW_NOT_FOUND', 'Workflow not found.', 404);
    return workflow;
};

/**
 * Shared lifecycle seam for the builder and Ask Promptly.
 * Draft/release validation and trigger cleanup stay here so every caller
 * receives the same publish, pause, test, and live-run behavior.
 */
export const performWorkflowLifecycleAction = async ({
    workflowId,
    userId,
    action,
    payload = {},
    expected = null,
    revisionId = null,
    executionKey = null,
    trigger = null
} = {}) => {
    const normalizedAction = normalizeWorkflowLifecycleAction(action);
    let workflow = await findWorkflow({ workflowId, userId });
    if (expected) assertWorkflowLifecycleExpectation(workflow, expected);
    if (normalizedAction === 'pause' && workflow.isActive !== true) {
        throw errorWith('WORKFLOW_NOT_ACTIVE', 'This workflow is not currently live.', 409);
    }
    if (normalizedAction === 'live_run' && (!workflow.isActive || !workflow.publishedRevisionId)) {
        throw errorWith('WORKFLOW_NOT_LIVE', 'Publish and activate this workflow before running it live.', 409);
    }

    if (normalizedAction === 'publish') {
        workflow = await publishAutomation({ automationId: workflowId, userId });
        try {
            await reconcileWorkflow(workflow);
        } catch (error) {
            await workflow.update({ isActive: false, status: 'Trigger setup failed' });
            await deactivateWorkflowTriggerBindings({ workflowId: workflow.id });
            throw errorWith(
                error.code === 'TRIGGER_PUBLIC_ORIGIN_REQUIRED' ? error.code : 'TRIGGER_CONNECTION_FAILED',
                error.code === 'TRIGGER_PUBLIC_ORIGIN_REQUIRED' ? error.message : 'Automation trigger could not be connected.',
                503,
                { cause: error.message }
            );
        }
        syncSchedule(workflow.id, userId, workflow.nodes, true);
        return { action: normalizedAction, workflow };
    }

    if (normalizedAction === 'pause') {
        workflow = await pauseAutomation({ automationId: workflowId, userId });
        await removeWorkflow(workflow.id);
        SchedulerService.deregister(workflow.id);
        return { action: normalizedAction, workflow };
    }

    const runPayload = ensurePayload(payload);
    const isLive = normalizedAction === 'live_run';
    const run = await executeWorkflow(workflowId, userId, runPayload, {
        runType: isLive ? 'production' : 'test',
        ...(isLive ? { revisionId: workflow.publishedRevisionId } : (revisionId ? { revisionId } : {})),
        trigger: trigger || (isLive ? 'manual-production' : 'manual-test'),
        ...(executionKey ? { eventId: executionKey, correlationId: executionKey } : {})
    });
    return { action: normalizedAction, workflow, run };
};
