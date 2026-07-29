export const previewValueItems = value => Array.isArray(value) ? value : [value];

/** Normalizes direct reference descriptions and template parts for the preview renderer. */
export const expressionPreviewParts = description => (description?.parts || []).flatMap(part => {
    if (part?.reference) return [{ reference: part.reference }];
    if (typeof part?.label === 'string') return [{ reference: part }];
    if (part?.text) return [{ text: part.text }];
    return [];
});

export const workflowPreviewFallbackText = value => {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'object') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return '[Unserializable value]';
    }
};
