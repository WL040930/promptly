import { describeWorkflowExpression, isWorkflowExpression } from '../../../../shared/workflowExpressions.js';

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

const runtimeReferenceFor = expression => expression?.$expr === 'reference'
    && expression.nodeId
    && Array.isArray(expression.path)
    ? `${expression.nodeId}.${expression.path.join('.')}`
    : '';

const referencePreviewParts = (reference, { nodes, formsById, availableVars }) => {
    const runtimeReference = runtimeReferenceFor(reference);
    const selected = availableVars.find(variable => variable.runtimePath === runtimeReference);
    if (selected) {
        return [{
            reference: {
                label: `${selected.nodeTitle || 'Previous step'} › ${selected.label || runtimeReference}`,
                sourceLabel: selected.nodeTitle || 'Previous step',
                valueLabel: selected.label || runtimeReference,
                resolved: true,
                runtimeReference
            }
        }];
    }

    const description = describeWorkflowExpression(reference, { nodes, formsById });
    return expressionPreviewParts(description).map(part => part.reference
        ? {
            reference: {
                ...part.reference,
                valueLabel: part.reference.label?.split('›').at(-1)?.trim() || part.reference.label,
                runtimeReference
            }
        }
        : part);
};

/** Turns a canonical expression into human-readable text and variable pills. */
export const workflowExpressionPreviewParts = (expression, {
    nodes = [],
    formsById = {},
    availableVars = []
} = {}) => {
    if (!isWorkflowExpression(expression)) return [];
    const parts = expression.$expr === 'reference'
        ? [{ reference: expression }]
        : expression.parts || [];

    return parts.flatMap(part => {
        if (typeof part?.text === 'string') return part.text ? [{ text: part.text }] : [];
        if (part?.reference) return referencePreviewParts(part.reference, { nodes, formsById, availableVars });
        return [];
    });
};

/** Converts a grid cell to readable text while leaving its stored value intact. */
export const workflowPreviewDisplayText = (value, { compact = false, ...options } = {}) => {
    if (value === undefined || value === null || value === '') return '';
    if (isWorkflowExpression(value)) {
        const parts = workflowExpressionPreviewParts(value, options);
        return parts.map(part => compact
            ? part.reference?.valueLabel || part.reference?.label?.split('›').at(-1)?.trim() || part.text || ''
            : part.reference?.label || part.text || '').join('') || 'Workflow reference';
    }
    if (Array.isArray(value)) return value.map(item => workflowPreviewDisplayText(item, { compact, ...options })).join(', ');
    if (typeof value === 'object') return workflowPreviewFallbackText(value);
    return String(value);
};

/**
 * Gives text controls a safe display value without corrupting canonical AI
 * expressions. Expressions remain objects so the rich token renderer can
 * explain them; unexpected objects become readable JSON instead of
 * "[object Object]".
 */
export const workflowTextFieldValue = value => {
    if (isWorkflowExpression(value)) return value;
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return workflowPreviewFallbackText(value);
    return String(value);
};
