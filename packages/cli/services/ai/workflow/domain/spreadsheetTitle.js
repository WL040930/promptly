const titleCaseWords = value => String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
    .trim();

export const normalizeSpreadsheetTitle = value => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();

export const isInstructionLikeSpreadsheetTitle = value => {
    const title = normalizeSpreadsheetTitle(value);
    if (!title || title.length > 80) return true;
    const hasInstruction = /\b(?:save|store|record|write|append|create|send|notify|when|whenever|after|before|every|each|per)\b/i.test(title);
    const hasWorkflowSubject = /\b(?:submission|response|sheet|spreadsheet|form|email|approval)\b/i.test(title);
    return hasInstruction && hasWorkflowSubject;
};

export const inferredFormTitleFromRequest = request => {
    const match = String(request || '').match(/\b(?:create|build|make)\s+(?:a|an|the)?\s*([^,.!?]+?\bform)\b/i);
    return match?.[1] ? titleCaseWords(match[1]) : null;
};

export const defaultSpreadsheetTitle = ({ workflow, formSchema, request } = {}) => {
    const candidates = [
        formSchema?.title,
        inferredFormTitleFromRequest(request),
        workflow?.name,
        workflow?.title
    ].map(normalizeSpreadsheetTitle)
        .filter(title => title && !/^((untitled|new)\s+)?form$/i.test(title) && !isInstructionLikeSpreadsheetTitle(title));
    const source = candidates[0] || 'Workflow';
    return `${source.replace(/\s+responses?$/i, '').trim()} Responses`;
};

export const safeSpreadsheetTitle = (value, fallback = 'Google Sheet Responses') => {
    const title = normalizeSpreadsheetTitle(value);
    return title && !isInstructionLikeSpreadsheetTitle(title) ? title : fallback;
};
