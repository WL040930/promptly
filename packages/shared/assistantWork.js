const MAX_ACTIVITIES = 20;
const MAX_ARTIFACTS = 4;
const OUTCOME_KINDS = new Set(['reply', 'clarification', 'proposal']);

export const ASSISTANT_WORK_PHASES = Object.freeze([
    { id: 'understand', label: 'Understand' },
    { id: 'plan', label: 'Plan' },
    { id: 'draft', label: 'Draft' },
    { id: 'check', label: 'Check' }
]);

const clean = (value, fallback = '') => String(value || fallback).trim() || fallback;
const iso = now => (typeof now === 'function' ? now() : now || new Date()).toISOString();

const phaseFor = ({ status, message, phase }) => {
    if (ASSISTANT_WORK_PHASES.some(item => item.id === phase)) return phase;
    const text = `${status || ''} ${message || ''}`.toLowerCase();
    if (/check|verify|validat|inspect/.test(text)) return 'check';
    if (/analy|understand|research|resource|load/.test(text)) return 'understand';
    if (/plan|choos|decid/.test(text)) return 'plan';
    return 'draft';
};

const labelFor = ({ status, message, label }) => {
    const text = clean(label || message, 'Working on your request');
    if (/repair|correct|recover|retry/.test(`${status || ''} ${text}`.toLowerCase())) {
        return text.replace(/[.…]+$/, '') || 'Correcting the draft';
    }
    return text.replace(/[.…]+$/, '') || 'Working on your request';
};

export const createAssistantWork = ({ requestId, surface, title, now = new Date() } = {}) => {
    const startedAt = iso(now);
    return {
        requestId: clean(requestId, 'request'),
        surface: surface === 'form' ? 'form' : 'workflow',
        outcomeKind: null,
        status: 'drafting',
        title: clean(title, 'Preparing your request'),
        currentPhase: 'understand',
        currentActivityId: 'preparing',
        artifacts: [],
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
        activities: [{
            id: 'preparing', phase: 'understand', label: 'Preparing the request',
            detail: 'Setting up the context for this change', status: 'active',
            attempt: 1, startedAt, completedAt: null
        }]
    };
};

export const advanceAssistantWork = (work, progress = {}, now = new Date()) => {
    const current = work || createAssistantWork({ requestId: progress.requestId, surface: progress.surface, title: progress.title, now });
    const timestamp = iso(now);
    const phase = phaseFor(progress);
    const status = clean(progress.status, 'working');
    const label = labelFor(progress);
    const detail = clean(progress.detail || progress.message, label);
    const baseId = clean(progress.id || progress.type, `${phase}:${status}:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`);
    const activities = (current.activities || []).map(activity => ({ ...activity }));
    const matching = [...activities].reverse().find(activity => activity.id === baseId && activity.status === 'active');

    for (const activity of activities) {
        if (activity.status === 'active' && (!matching || activity.id !== matching.id)) {
            activity.status = 'completed';
            activity.completedAt = timestamp;
        }
    }

    if (matching) {
        matching.detail = detail;
        matching.updatedAt = timestamp;
    } else {
        activities.push({
            id: baseId,
            phase,
            label,
            detail,
            status: 'active',
            // Provider progress already describes its real attempt in `detail`.
            // Repeated transport/fallback events must not manufacture a second
            // user-facing attempt merely because the same activity ID reappears.
            attempt: Number.isInteger(progress.attempt) && progress.attempt > 0 ? progress.attempt : 1,
            startedAt: timestamp,
            completedAt: null
        });
    }

    const artifact = progress.artifact && typeof progress.artifact === 'object'
        ? {
            id: clean(progress.artifact.id, baseId),
            title: clean(progress.artifact.title, label),
            kind: clean(progress.artifact.kind, 'summary'),
            items: Array.isArray(progress.artifact.items)
                ? progress.artifact.items.map(item => clean(item)).filter(Boolean).slice(0, 6)
                : []
        }
        : null;
    const artifacts = artifact
        ? [...(current.artifacts || []).filter(item => item.id !== artifact.id), artifact].slice(-MAX_ARTIFACTS)
        : (current.artifacts || []);
    const outcomeKind = OUTCOME_KINDS.has(progress.outcomeKind)
        ? progress.outcomeKind
        : current.outcomeKind || null;

    return {
        ...current,
        outcomeKind,
        status: 'drafting',
        currentPhase: phase,
        currentActivityId: baseId,
        updatedAt: timestamp,
        completedAt: null,
        activities: activities.slice(-MAX_ACTIVITIES),
        artifacts,
        currentArtifact: artifact || current.currentArtifact || null
    };
};

export const finishAssistantWork = (work, { status = 'completed', title, detail } = {}, now = new Date()) => {
    const timestamp = iso(now);
    const activities = (work?.activities || []).map(activity => activity.status === 'active'
        ? { ...activity, status: 'completed', completedAt: timestamp }
        : activity);
    return {
        ...(work || createAssistantWork({ now })),
        ...(title ? { title } : {}),
        status,
        currentActivityId: null,
        updatedAt: timestamp,
        completedAt: timestamp,
        ...(detail ? { summary: detail } : {}),
        activities
    };
};

export const assistantWorkInternals = { phaseFor, labelFor, MAX_ACTIVITIES, MAX_ARTIFACTS, OUTCOME_KINDS };
