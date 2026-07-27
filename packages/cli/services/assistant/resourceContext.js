const MAX_INVARIANTS = 8;
const MAX_DECISIONS = 12;
const MAX_ENTRY_LENGTH = 200;
const MAX_BRIEF_LENGTH = 2000;

const cleanText = (value, limit = MAX_ENTRY_LENGTH) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
const unique = values => [...new Set(values.map(value => cleanText(value)).filter(Boolean))];

const compactList = (values, limit) => unique(Array.isArray(values) ? values : []).slice(0, limit);

export const normalizeContextDelta = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const set = Object.fromEntries(
        ['purpose', 'audience', 'tone']
            .filter(key => cleanText(value.set?.[key]))
            .map(key => [key, cleanText(value.set[key])])
    );
    const delta = {
        set,
        addInvariants: compactList(value.addInvariants, MAX_INVARIANTS),
        removeInvariants: compactList(value.removeInvariants, MAX_INVARIANTS),
        addDecisions: compactList(value.addDecisions, MAX_DECISIONS),
        removeDecisions: compactList(value.removeDecisions, MAX_DECISIONS)
    };
    return Object.keys(set).length || Object.values(delta).some(item => Array.isArray(item) && item.length) ? delta : null;
};

export const resourceBriefFor = context => context?.resourceBrief && typeof context.resourceBrief === 'object'
    ? context.resourceBrief
    : null;

export const buildResourceIdentity = ({ surface, resource = {} } = {}) => ({
    type: surface,
    name: cleanText(surface === 'workflow' ? resource.name : resource.title, 255) || (surface === 'workflow' ? 'Untitled workflow' : 'Untitled form'),
    description: cleanText(resource.description, 600),
    revision: surface === 'workflow' ? resource.revision ?? null : resource.updatedAt?.toISOString?.() || resource.updatedAt || null
});

const withinBriefBudget = brief => {
    const serialised = JSON.stringify(brief);
    if (serialised.length <= MAX_BRIEF_LENGTH) return brief;
    return {
        ...brief,
        acceptedDecisions: brief.acceptedDecisions.slice(0, Math.max(0, MAX_DECISIONS - 3))
    };
};

/**
 * Merge a reviewed proposal's durable context into the thread-local resource
 * brief. This is deliberately called only from proposal application
 * transactions; conversation turns alone cannot change remembered intent.
 */
export const applyResourceContextDelta = ({ context = {}, delta, identity }) => {
    const current = resourceBriefFor(context) || {};
    const normalized = normalizeContextDelta(delta);
    const existingInvariants = compactList(current.invariants, MAX_INVARIANTS);
    const existingDecisions = compactList(current.acceptedDecisions, MAX_DECISIONS);
    const removeInvariant = new Set(normalized?.removeInvariants || []);
    const removeDecision = new Set(normalized?.removeDecisions || []);

    const brief = withinBriefBudget({
        purpose: normalized?.set?.purpose || cleanText(current.purpose) || identity.description || identity.name,
        audience: normalized?.set?.audience || cleanText(current.audience),
        tone: normalized?.set?.tone || cleanText(current.tone),
        invariants: compactList([
            ...existingInvariants.filter(value => !removeInvariant.has(value)),
            ...(normalized?.addInvariants || [])
        ], MAX_INVARIANTS),
        acceptedDecisions: compactList([
            ...existingDecisions.filter(value => !removeDecision.has(value)),
            ...(normalized?.addDecisions || [])
        ], MAX_DECISIONS),
        updatedAt: new Date().toISOString(),
        resourceRevision: identity.revision
    });

    return { ...context, resourceBrief: brief };
};

export const resourceContextForPrompt = ({ identity, context = {} } = {}) => ({
    identity,
    // Even before the first accepted edit, the resource identity gives the
    // planner a stable anchor. It is prompt-only until a reviewed proposal
    // explicitly writes a durable brief.
    brief: resourceBriefFor(context) || (identity ? {
        purpose: identity.description || identity.name,
        audience: '',
        tone: '',
        invariants: [],
        acceptedDecisions: [],
        resourceRevision: identity.revision
    } : null),
    savedRules: compactList(context.savedRules, MAX_INVARIANTS)
});
