const LABELS = Object.freeze({
    create_google_spreadsheet: 'Create Google Sheet',
    create_google_sheet: 'Create Google Sheet',
    create_sheet: 'Create Google Sheet',
    create_spreadsheet: 'Create Google Sheet',
    google_spreadsheet: 'Google Sheets',
    google_sheets: 'Google Sheets',
    google_sheets_action: 'Google Sheets',
    googlesheets: 'Google Sheets',
    form_submission: 'Form submission',
    form_trigger: 'Form submission',
    send_email: 'Send email',
    email: 'Send email',
    custom_code: 'Custom JavaScript',
    customcode: 'Custom JavaScript',
    add_approval_gate: 'Request approval',
    approval: 'Request approval',
    if_else: 'Condition',
    conditional: 'Condition',
    delay: 'Wait',
    http_request: 'HTTP request'
});

const SPREADSHEET_CREATION_RESOURCE_KEYS = new Set([
    'create_google_spreadsheet',
    'create_google_sheet',
    'create_sheet',
    'create_spreadsheet'
]);

const keyFor = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[:\s./-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const titleCase = value => String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
    .trim();

/** Converts internal workflow/action identifiers into display-only labels. */
export const displayWorkflowActionLabel = value => {
    const raw = String(value || '').trim();
    if (!raw) return 'Workflow step';
    if (/\s/.test(raw) && !/[_.:/-]/.test(raw)) return raw;
    const key = keyFor(raw);
    const namespacedKey = key.replace(/^(action|trigger|logic|node)_/, '');
    const suffix = key.includes('_') ? key.slice(key.lastIndexOf('_') + 1) : key;
    return LABELS[key] || LABELS[namespacedKey] || LABELS[suffix] || titleCase(raw);
};

export const displayWorkflowNodeLabel = node => displayWorkflowActionLabel(
    node?.title || node?.label || node?.name || node?.subType || node?.type || node?.id || 'Workflow step'
);

export const displayWorkflowResourceLabel = resource => displayWorkflowActionLabel(
    SPREADSHEET_CREATION_RESOURCE_KEYS.has(keyFor(resource?.type))
        ? resource.type
        : resource?.label || resource?.name || resource?.title || resource?.type || 'Workspace resource'
);

const isInstructionLikeResourceName = value => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 80) return true;
    const hasInstruction = /\b(?:save|store|record|write|append|create|send|notify|when|whenever|after|before|every|each|per)\b/i.test(name);
    const hasWorkflowSubject = /\b(?:submission|response|sheet|spreadsheet|form|email|approval)\b/i.test(name);
    return hasInstruction && hasWorkflowSubject;
};

export const displayWorkflowResourceDetail = resource => {
    const details = [];
    const name = resource?.title || resource?.name;
    if (name && !isInstructionLikeResourceName(name)) details.push(`Name: ${String(name).trim()}`);
    if (resource?.sheetTitle) details.push(`Tab: ${String(resource.sheetTitle).trim()}`);
    if (resource?.detail || resource?.description) details.push(String(resource.detail || resource.description).trim());
    return details.filter(Boolean).join(' · ') || null;
};
