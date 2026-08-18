import { displayWorkflowActionLabel } from '../../utils/workflowLabels.js';

const FIELD_REFERENCE = /^([^{}.]+)\.fields\.([^{}.]+)$/;

const humanize = value => String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

const titleForNode = node => displayWorkflowActionLabel(node?.title || node?.subType || node?.type || node?.id || 'Unknown step');

const nodeForReference = (source, nodes) => {
    const byId = nodes.find(node => node?.id === source);
    if (byId) return byId;
    return nodes.find(node => node?.title === source) || null;
};

/**
 * Turns an execution reference into user-facing source and field labels without
 * changing the stored reference. Runtime node-ID paths and older title paths
 * are both supported.
 */
export const describeWorkflowVariable = (reference, nodes = [], formsById = {}) => {
    const cleanReference = String(reference || '').trim();
    const fieldMatch = cleanReference.match(FIELD_REFERENCE);
    const [source = '', ...rest] = cleanReference.split('.');
    const node = nodeForReference(source, nodes);
    const sourceLabel = node ? titleForNode(node) : (source ? `Unknown step (${source})` : 'Unknown step');

    if (fieldMatch) {
        const [, , fieldId] = fieldMatch;
        const form = node?.config?.formId ? formsById[node.config.formId] : null;
        const field = form?.fields?.find(item => item?.id === fieldId && !item.deleted);
        const fieldLabel = field?.label || `Unknown field (${fieldId})`;
        return {
            reference: cleanReference,
            sourceLabel,
            valueLabel: fieldLabel,
            displayLabel: `${sourceLabel} › ${fieldLabel}`,
            isResolved: Boolean(node && field),
            isField: true
        };
    }

    const valueKey = rest.at(-1) || cleanReference;
    const valueLabel = valueKey === 'success' ? 'Success' : humanize(valueKey);
    return {
        reference: cleanReference,
        sourceLabel,
        valueLabel,
        displayLabel: `${sourceLabel} › ${valueLabel}`,
        isResolved: Boolean(node),
        isField: false
    };
};

export const splitWorkflowVariableTokens = value => String(value ?? '').split(/(\{\{[^}]+\}\})/g);
