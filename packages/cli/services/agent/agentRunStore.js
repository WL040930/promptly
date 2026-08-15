import crypto from 'crypto';
import { AgentRun } from '../../models/index.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const normalizeRun = run => run.toJSON ? run.toJSON() : run;

const updateJsonCollection = async (run, field, key, updates, options = {}) => {
    const current = Array.isArray(run[field]) ? run[field] : [];
    const index = current.findIndex(item => item[key] === updates[key]);
    const next = [...current];
    if (index === -1) next.push(updates);
    else next[index] = { ...next[index], ...updates };
    await run.update({ [field]: next }, options);
    run[field] = next;
    return next[index === -1 ? next.length - 1 : index];
};

export const createRun = ({ threadId, userId, metadata = {} }) => AgentRun.create({ threadId, userId, metadata, steps: [], artifacts: [] });

export const updateRun = (run, updates, options = {}) => run.update(updates, options);

export const createStep = async (run, { stepKey, type, inputArtifactIds = [] }) => {
    const existing = (Array.isArray(run.steps) ? run.steps : []).find(step => step.stepKey === stepKey);
    if (existing) {
        const proxy = {
            ...existing,
            update: async updates => {
                const next = await updateJsonCollection(run, 'steps', 'stepKey', { ...proxy, ...updates, stepKey });
                Object.assign(proxy, next);
                return proxy;
            }
        };
        return proxy;
    }
    const step = {
        id: `step_${crypto.randomUUID().replace(/-/g, '')}`,
        stepKey,
        type,
        status: 'pending',
        attempt: 0,
        inputArtifactIds,
        outputArtifactIds: [],
        result: null,
        error: null,
        tokenUsage: {},
        startedAt: null,
        completedAt: null
    };
    await updateJsonCollection(run, 'steps', 'stepKey', step);
    const proxy = {
        ...step,
        update: async updates => {
            const next = await updateJsonCollection(run, 'steps', 'stepKey', { ...proxy, ...updates, stepKey });
            Object.assign(proxy, next);
            return proxy;
        }
    };
    return proxy;
};

export const startStep = step => step.update({
    status: 'running',
    attempt: (step.attempt || 0) + 1,
    startedAt: new Date(),
    error: null
});

export const completeStep = (step, { result = null, outputArtifactIds = [], tokenUsage = {} } = {}) => step.update({
    status: 'completed',
    result,
    outputArtifactIds,
    tokenUsage,
    completedAt: new Date()
});

export const failStep = (step, error) => step.update({
    status: 'failed',
    error: { code: error?.code || 'AGENT_STEP_FAILED', message: error?.message || 'Agent step failed.' },
    tokenUsage: error?.tokenUsage || {},
    completedAt: new Date()
});

export const createArtifact = async ({ run, runId, type, artifactKey, content, baseResources = [], metadata = {} }) => {
    const targetRun = run || await AgentRun.findByPk(runId);
    if (!targetRun) throw new Error('Agent run not found while creating an artifact.');
    const artifact = {
        id: `artifact_${crypto.randomUUID().replace(/-/g, '')}`,
        type,
        artifactKey,
        status: 'draft',
        content,
        contentHash: hash(content),
        baseResources,
        metadata
    };
    await updateJsonCollection(targetRun, 'artifacts', 'artifactKey', artifact);
    return artifact;
};

export const updateArtifact = async (run, artifactKey, updates = {}, options = {}) => {
    const current = (Array.isArray(run?.artifacts) ? run.artifacts : []).find(artifact => artifact.artifactKey === artifactKey);
    if (!current) throw new Error(`Agent artifact '${artifactKey}' was not found.`);
    const content = updates.content === undefined ? current.content : updates.content;
    return updateJsonCollection(run, 'artifacts', 'artifactKey', {
        ...current,
        ...updates,
        artifactKey,
        content,
        contentHash: hash(content)
    }, options);
};

export const createApproval = async ({ run, userId, artifactIds, idempotencyKey }) => {
    const approval = run.approval || {
        id: `approval_${crypto.randomUUID().replace(/-/g, '')}`,
        userId,
        status: 'pending',
        artifactIds: [],
        idempotencyKey,
        approvedAt: null,
        rejectedAt: null,
        metadata: {}
    };
    const next = { ...approval, artifactIds, idempotencyKey };
    await run.update({ approval: next });
    run.approval = next;
    return next;
};

export const getRunForUser = (runId, userId) => AgentRun.findOne({ where: { id: runId, userId } });

export const getRunArtifacts = run => (Array.isArray(run.artifacts) ? run.artifacts : []);

export const serializeRun = run => {
    if (!run) return null;
    const value = normalizeRun(run);
    return {
        id: value.id,
        status: value.status,
        intent: value.intent,
        plan: value.plan,
        currentStep: value.currentStep,
        tokenUsage: value.tokenUsage || {},
        error: value.error || null,
        artifacts: Array.isArray(value.artifacts) ? value.artifacts : [],
        steps: Array.isArray(value.steps) ? value.steps : [],
        approval: value.approval ? {
            id: value.approval.id,
            status: value.approval.status,
            artifactIds: value.approval.artifactIds
        } : null
    };
};
