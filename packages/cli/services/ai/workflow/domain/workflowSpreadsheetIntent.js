const spreadsheetWords = /\b(?:google\s*sheets?|spreadsheets?|sheets?)\b/i;
const spreadsheetSavePattern = /\b(?:save|store|record|write|append|add)\b[\s\S]{0,120}\b(?:excel|spreadsheets?|google\s*sheets?|sheets?)\b|\b(?:excel|spreadsheets?|google\s*sheets?|sheets?)\b[\s\S]{0,120}\b(?:save|store|record|write|append|add)\b/i;
const explicitCreatePattern = /\b(?:create|new)\b[\s\S]{0,40}\b(?:google\s*)?(?:spreadsheets?|sheets?)\b/i;
const rejectCreatePattern = /\b(?:do\s+not|don't|dont|no\s+need|without|why\s+need)\b[\s\S]{0,80}\b(?:create|new)\b[\s\S]{0,40}\b(?:google\s*)?(?:spreadsheets?|sheets?)\b/i;
const genericDestinationNames = new Set(['sheet', 'sheets', 'spreadsheet', 'spreadsheets', 'google', 'google sheet', 'google sheets', 'new']);

const text = value => String(value || '').trim();

const normalizedName = value => text(value)
    .replace(/^["“']|["”']$/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const namedSheetPatterns = [
    /\bcreate\s+(?:a|an)?\s*(?:new\s+)?(.+?)\s+(?:google\s*sheet|spreadsheet|sheet)\b/i,
    /\b(?:save|store|record|write|append|add)\b[\s\S]{0,120}?\b(?:to|into|in)\s+(?:the\s+)?(.+?)\s+(?:google\s*sheet|spreadsheet|sheet)\b/i,
    /\b(?:google\s*sheet|spreadsheet|sheet)\s+(?:named|called)\s+["“']?([^"”'.,!?]+)["”']?/i,
    /\b(?:named|called)\s+["“']?([^"”'.,!?]+)["”']?\s+(?:google\s*sheet|spreadsheet|sheet)\b/i
];

export const namedSpreadsheetFromText = value => {
    const source = text(value);
    if (!source || !spreadsheetWords.test(source)) return null;
    for (const pattern of namedSheetPatterns) {
        const match = source.match(pattern);
        const name = normalizedName(match?.[1]);
        if (name && !genericDestinationNames.has(name.toLocaleLowerCase())) return name;
    }
    return null;
};

export const spreadsheetIdFromValue = value => {
    const source = text(value);
    if (!source) return null;
    const urlMatch = source.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch?.[1]) return urlMatch[1];
    return /\s/.test(source) ? null : source;
};

const pendingIntent = pendingProposal => {
    const payload = pendingProposal?.payload || pendingProposal?.proposal || pendingProposal || {};
    if (payload.resourceIntent?.mode) return payload.resourceIntent;
    if ((payload.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet')) {
        return { mode: 'create', source: 'pending_proposal' };
    }
    return null;
};

const latestNamedHistory = history => [...(history || [])]
    .reverse()
    .filter(message => message?.sender === 'user')
    .map(message => namedSpreadsheetFromText(message?.text))
    .find(Boolean) || null;

const createIntent = ({ source, name = null } = {}) => ({ mode: 'create', source, ...(name ? { name } : {}) });
const namedIntent = ({ source, name, replacesProvisioning = false } = {}) => ({ mode: 'existing_named', source, name, ...(replacesProvisioning ? { replacesProvisioning: true } : {}) });
const selectedIntent = ({ source, spreadsheetId, name = null } = {}) => ({ mode: 'existing_selected', source, spreadsheetId, ...(name ? { name } : {}) });

/**
 * Determines whether a workflow turn must use an existing Sheet, may create
 * one, or has no spreadsheet destination at all. It intentionally operates on
 * conversational data only; ownership and account-resource checks happen in
 * the pipeline before the planner is called.
 */
export const resolveSpreadsheetIntent = ({ request = '', clarificationState = {}, pendingProposal = null, history = [] } = {}) => {
    const current = text(request);
    const selectedValue = clarificationState?.spreadsheetId;
    const selectedId = spreadsheetIdFromValue(selectedValue);
    const createChoice = clarificationState?.createSpreadsheet === 'create'
        || explicitCreatePattern.test(text(clarificationState?.createSpreadsheet))
        || explicitCreatePattern.test(text(selectedValue));

    if (selectedId && !explicitCreatePattern.test(selectedId)) {
        return selectedIntent({ source: 'clarification', spreadsheetId: selectedId });
    }
    if (createChoice) return createIntent({ source: 'clarification' });

    const rejectsCreation = rejectCreatePattern.test(current);
    if (!rejectsCreation && explicitCreatePattern.test(current)) {
        return createIntent({ source: 'request', name: namedSpreadsheetFromText(current) });
    }
    const currentName = namedSpreadsheetFromText(current);
    if (currentName) return namedIntent({ source: 'request', name: currentName });

    const priorIntent = pendingIntent(pendingProposal);
    if (!rejectsCreation && priorIntent?.mode === 'existing_selected' && priorIntent.spreadsheetId) {
        return selectedIntent({ source: 'pending_proposal', spreadsheetId: priorIntent.spreadsheetId, name: priorIntent.name || null });
    }
    if (!rejectsCreation && priorIntent?.mode === 'existing_named' && priorIntent.name) {
        return namedIntent({ source: 'pending_proposal', name: priorIntent.name });
    }
    if (!rejectsCreation && priorIntent?.mode === 'create') return createIntent({ source: 'pending_proposal', name: priorIntent.name || null });

    const historyName = latestNamedHistory(history);
    if (historyName) return namedIntent({ source: 'history', name: historyName, replacesProvisioning: rejectsCreation });

    if (rejectsCreation) return { mode: 'requires_existing', source: 'request', replacesProvisioning: true };
    if (spreadsheetSavePattern.test(current)) return { mode: 'unnamed', source: 'request' };
    return { mode: 'none', source: 'none' };
};

export const spreadsheetIntentInternals = Object.freeze({
    spreadsheetSavePattern,
    explicitCreatePattern,
    rejectCreatePattern,
    pendingIntent
});
