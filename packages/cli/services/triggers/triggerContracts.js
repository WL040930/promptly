import crypto from 'node:crypto';

export const PROVIDERS = Object.freeze({
    database: 'database',
    email: 'gmail',
    googleSheets: 'google-drive'
});

export const externalTriggerForNode = node => {
    if (!node || node.type !== 'trigger') return null;
    const provider = PROVIDERS[node.subType];
    return provider ? { provider, node } : null;
};

export const hashConfig = config => crypto.createHash('sha256')
    .update(JSON.stringify(config || {}))
    .digest('hex');

export const normalizeEvent = ({ provider, eventType, externalEventId, payload, subscription, correlationId = null, causationId = null, depth = 0 }) => ({
    provider,
    eventType,
    externalEventId: String(externalEventId),
    payload: {
        eventId: String(externalEventId),
        provider,
        eventType,
        occurredAt: payload?.occurredAt || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        data: payload?.data ?? payload ?? {}
    },
    subscriptionId: subscription.id,
    workflowId: subscription.workflowId,
    nodeId: subscription.nodeId,
    userId: subscription.userId,
    correlationId,
    causationId,
    depth
});

export const matchesDatabaseSubscription = ({ config = {}, change }) => {
    if (config.resource && config.resource !== change.resource) return false;
    if (config.ignoreOwnWorkflowChanges !== false && change.resource === 'automationRuns') {
        const current = change.afterData || change.beforeData || {};
        if (current.workflowId === change.subscriptionWorkflowId) return false;
    }
    const events = Array.isArray(config.events) && config.events.length > 0 ? config.events : ['created', 'updated', 'deleted'];
    if (!events.includes(change.eventType)) return false;
    const filters = config.filters && typeof config.filters === 'object' ? config.filters : {};
    const current = change.afterData || change.beforeData || {};
    return Object.entries(filters).every(([key, value]) => current[key] === value);
};

export const stableRowFingerprint = row => crypto.createHash('sha256')
    .update(JSON.stringify(row || []))
    .digest('hex');
