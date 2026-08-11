import { Op } from 'sequelize';
import { getDatabasePoolStats } from '../../db/index.js';
import TriggerSubscription from '../../models/triggers/TriggerSubscription.js';
import TriggerEvent from '../../models/triggers/TriggerEvent.js';
import Workflow from '../../models/workflows/Workflow.js';
import WorkflowVersion from '../../models/workflows/WorkflowVersion.js';
import { executeWorkflow } from '../engine/executionEngine.js';
import { externalTriggerForNode, hashConfig, normalizeEvent } from './triggerContracts.js';
import databaseAdapter from './databaseAdapter.js';
import gmailAdapter from './gmailTriggerAdapter.js';
import sheetsAdapter from './googleSheetsTriggerAdapter.js';
import { syncLiveTriggerBindings } from './workflowTriggerBindingService.js';
import { createBackgroundWorkerPoller } from '../backgroundWorkerPoller.js';
import { claimQueueRow, TRIGGER_EVENT_CLAIM_SQL } from '../queueClaim.js';

const MAX_ATTEMPTS = 5;
const MAX_TRIGGER_DEPTH = 10;
const adapters = new Map();

const registerTriggerAdapter = (provider, adapter) => {
    if (!provider || !adapter?.reconcile || !adapter?.remove) throw new Error(`Invalid trigger adapter for ${provider}.`);
    adapters.set(provider, adapter);
};

registerTriggerAdapter('database', databaseAdapter);
registerTriggerAdapter('gmail', gmailAdapter);
registerTriggerAdapter('google-drive', sheetsAdapter);

const markSubscriptionError = async (subscription, error) => {
    await subscription.update({ status: 'degraded', lastError: error.message });
};

const reconcileSubscription = async ({ workflow, node, provider }) => {
    const adapter = adapters.get(provider);
    if (!adapter) throw new Error(`No trigger adapter is registered for provider "${provider}".`);
    const config = node.config || {};
    let subscription = await TriggerSubscription.findOne({ where: { workflowId: workflow.id, nodeId: node.id } });
    let configChanged = false;
    if (!subscription) {
        subscription = await TriggerSubscription.create({
            workflowId: workflow.id,
            nodeId: node.id,
            userId: workflow.userId,
            provider,
            config,
            configHash: hashConfig(config),
            status: 'provisioning'
        });
        configChanged = true;
    } else if (subscription.configHash !== hashConfig(config) || subscription.userId !== workflow.userId) {
        await subscription.update({
            userId: workflow.userId,
            provider,
            config,
            configHash: hashConfig(config),
            status: 'provisioning',
            lastError: null
        });
        configChanged = true;
    }

    try {
        await adapter.reconcile({ subscription, workflow, node, config, force: configChanged });
        if (subscription.status !== 'active') await subscription.update({ status: 'active', lastError: null });
    } catch (error) {
        await markSubscriptionError(subscription, error);
        throw error;
    }
    return subscription;
};

const disableStaleSubscriptions = async (workflowId, activeNodeId) => {
    const stale = await TriggerSubscription.findAll({
        where: {
            workflowId,
            ...(activeNodeId ? { nodeId: { [Op.ne]: activeNodeId } } : {})
        }
    });
    for (const subscription of stale) {
        const adapter = adapters.get(subscription.provider);
        try {
            await adapter?.remove({ subscription });
        } finally {
            await subscription.update({ status: 'inactive' });
        }
    }
};

export const reconcileWorkflow = async workflow => {
    if (!workflow?.isActive) {
        await disableStaleSubscriptions(workflow?.id);
        return [];
    }
    // Live subscriptions always use the immutable published graph, never an
    // autosaved draft that has not been released yet.
    const release = workflow.publishedRevisionId
        ? await WorkflowVersion.findOne({ where: { id: workflow.publishedRevisionId, workflowId: workflow.id } })
        : null;
    if (!release) throw new Error('An active automation requires a published release.');
    // Rehydrate local form/webhook routes on process restart. This is
    // idempotent and keeps dispatch independent of scanning workflow JSON.
    await syncLiveTriggerBindings({ workflow, revision: release });
    const liveWorkflow = { ...workflow.toJSON(), nodes: release.nodes || [], edges: release.edges || [] };
    const externalTrigger = (liveWorkflow.nodes || []).map(externalTriggerForNode).find(Boolean);
    if (!externalTrigger) {
        await disableStaleSubscriptions(liveWorkflow.id);
        return [];
    }
    await disableStaleSubscriptions(liveWorkflow.id, externalTrigger.node.id);
    return [await reconcileSubscription({ workflow: liveWorkflow, ...externalTrigger })];
};

export const reconcileActiveWorkflows = async () => {
    const workflows = await Workflow.findAll({ where: { isActive: true } });
    for (const workflow of workflows) {
        try {
            await reconcileWorkflow(workflow);
        } catch (error) {
            console.error(`[TriggerRuntime] Failed to reconcile workflow ${workflow.id}:`, error.message);
        }
    }
};

export const removeWorkflow = async workflowId => {
    const subscriptions = await TriggerSubscription.findAll({ where: { workflowId } });
    for (const subscription of subscriptions) {
        try {
            await adapters.get(subscription.provider)?.remove({ subscription });
        } finally {
            await subscription.update({ status: 'inactive' });
        }
    }
};

export const ingestEvent = async ({ provider, eventType, externalEventId, payload, subscriptionId, correlationId = null, causationId = null, depth = 0 }) => {
    const subscription = await TriggerSubscription.findOne({ where: { id: subscriptionId, provider, status: 'active' } });
    if (!subscription) throw new Error('Active trigger subscription was not found.');
    if (depth > MAX_TRIGGER_DEPTH) throw new Error(`Trigger depth exceeded the maximum of ${MAX_TRIGGER_DEPTH}.`);
    const event = normalizeEvent({ provider, eventType, externalEventId, payload, subscription, correlationId, causationId, depth });
    try {
        const record = await TriggerEvent.create(event);
        await subscription.update({ lastEventAt: new Date(), lastError: null });
        return { event: record, duplicate: false };
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const duplicate = await TriggerEvent.findOne({ where: { subscriptionId, externalEventId: String(externalEventId) } });
            return { event: duplicate, duplicate: true };
        }
        throw error;
    }
};

const claimEvent = async () => {
    return claimQueueRow({ model: TriggerEvent, query: TRIGGER_EVENT_CLAIM_SQL });
};

const processPendingEvents = async ({ limit = 10 } = {}) => {
    let processed = 0;
    while (processed < limit) {
        const event = await claimEvent();
        if (!event) break;
        try {
            const workflow = await Workflow.findOne({ where: { id: event.workflowId, userId: event.userId, isActive: true } });
            if (!workflow) {
                await event.update({ status: 'discarded', processedAt: new Date(), lockedAt: null, lastError: 'Workflow is no longer active.' });
            } else {
                const execution = await executeWorkflow(event.workflowId, event.userId, event.payload, {
                    runType: 'production',
                    trigger: `${event.provider}:${event.eventType}`,
                    eventId: event.externalEventId,
                    correlationId: event.correlationId,
                    causationId: event.causationId,
                    depth: event.depth
                });
                if (String(execution.status || '').toLowerCase() === 'failed') throw new Error(execution.error || 'Triggered workflow execution failed.');
                await event.update({ status: 'succeeded', processedAt: new Date(), lockedAt: null, lastError: null });
            }
        } catch (error) {
            const attempts = event.attempts;
            const terminal = attempts >= MAX_ATTEMPTS;
            await event.update({
                status: terminal ? 'dead' : 'pending',
                availableAt: terminal ? event.availableAt : new Date(Date.now() + (2 ** attempts) * 1000),
                lockedAt: null,
                lastError: error.message
            });
        }
        processed += 1;
    }
    return processed;
};

const renewSubscriptions = async () => {
    const expiringAt = new Date(Date.now() + 60 * 60 * 1000);
    const subscriptions = await TriggerSubscription.findAll({
        where: { status: 'active', expiresAt: { [Op.ne]: null, [Op.lte]: expiringAt } }
    });
    for (const subscription of subscriptions) {
        try {
            await adapters.get(subscription.provider)?.reconcile({ subscription, config: subscription.config });
        } catch (error) {
            await markSubscriptionError(subscription, error);
        }
    }
};

const logWorkerFailure = (label, error) => {
    console.error(label, error.message, getDatabasePoolStats());
};

const eventWorker = createBackgroundWorkerPoller({
    task: processPendingEvents,
    onError: error => logWorkerFailure('[TriggerRuntime] Worker failed:', error)
});

const subscriptionRenewalWorker = createBackgroundWorkerPoller({
    task: renewSubscriptions,
    intervalMs: 15 * 60 * 1000,
    maxBackoffMs: 15 * 60 * 1000,
    onError: error => logWorkerFailure('[TriggerRuntime] Renewal failed:', error)
});

export const startTriggerRuntime = async () => {
    await eventWorker.start();
    await subscriptionRenewalWorker.start({ immediate: true });
};

export const stopTriggerRuntime = async () => {
    await Promise.all([eventWorker.stop(), subscriptionRenewalWorker.stop()]);
};
