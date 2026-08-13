const activeFields = form => (form?.fields || []).filter(field => field?.id && !field.deleted && field.type !== 'heading');

const reference = (nodeId, path) => ({ $expr: 'reference', v: 1, nodeId, path });

/**
 * A new response sheet has one server-owned column contract. Keeping headers
 * and values together prevents an AI-authored row from drifting out of order.
 */
export const buildFormResponseSpreadsheetContract = ({ form, triggerNodeId } = {}) => {
    if (!form || !triggerNodeId) return null;
    const fields = activeFields(form);
    return {
        headers: ['Submitted At', 'Response ID', ...fields.map(field => field.label || field.name || field.id)],
        values: [[
            reference(triggerNodeId, ['submittedAt']),
            reference(triggerNodeId, ['responseId']),
            ...fields.map(field => reference(triggerNodeId, ['fields', field.id]))
        ]]
    };
};

/**
 * Applies the response-value contract to a newly created Sheet and, when the
 * destination was deterministically selected by the user, to an otherwise
 * unconfigured existing Sheet. Existing custom mappings are preserved.
 */
export const applyFormResponseSpreadsheetContract = ({ nodes = [], resourceChanges = [], form = null, bindExistingFormResponseValues = false } = {}) => {
    const trigger = (nodes || []).filter(node => node?.subType === 'form-submission').at(0);
    const hasOneFormTrigger = (nodes || []).filter(node => node?.subType === 'form-submission').length === 1;
    const contract = hasOneFormTrigger ? buildFormResponseSpreadsheetContract({ form, triggerNodeId: trigger?.id }) : null;
    if (!contract) return { nodes, resourceChanges, applied: false };
    const provisionRefs = new Set((resourceChanges || [])
        .filter(change => change?.type === 'create_google_spreadsheet' && change?.ref)
        .map(change => change.ref));
    const matchedRefs = new Set((nodes || []).filter(node => (
        node?.subType === 'googleSheets' && provisionRefs.has(node.config?.spreadsheetId?.$provision)
    )).map(node => node.config.spreadsheetId.$provision));
    const runtimeCreators = (nodes || []).filter(node => node?.subType === 'googleSheetsCreate');
    const runtimeCreator = runtimeCreators.length === 1 ? runtimeCreators[0] : null;
    const runtimeAppends = runtimeCreator
        ? (nodes || []).filter(node => node?.subType === 'googleSheets' && node.config?.spreadsheetId?.nodeId === runtimeCreator.id)
        : [];
    const selectedExistingAppends = bindExistingFormResponseValues
        ? (nodes || []).filter(node => node?.subType === 'googleSheets'
            && typeof node.config?.spreadsheetId === 'string'
            && (!Array.isArray(node.config?.values) || node.config.values.length === 0))
        : [];
    if (matchedRefs.size === 0 && runtimeAppends.length === 0 && selectedExistingAppends.length === 0) return { nodes, resourceChanges, applied: false };
    return {
        nodes: nodes.map(node => {
            if (matchedRefs.has(node?.config?.spreadsheetId?.$provision)
                || runtimeAppends.some(append => append.id === node.id)
                || selectedExistingAppends.some(append => append.id === node.id)) {
                return {
                    ...node,
                    config: {
                        ...(node.config || {}),
                        values: contract.values,
                        valueInputOption: 'RAW'
                    }
                };
            }
            if (node.id === runtimeCreator?.id) {
                return { ...node, config: { ...(node.config || {}), headers: contract.headers } };
            }
            return node;
        }),
        resourceChanges: resourceChanges.map(change => matchedRefs.has(change?.ref)
            ? { ...change, headers: contract.headers }
            : change),
        applied: true
    };
};
