const SEMANTIC_TOKEN = /\{\{formField:([^{}]+)\}\}/g;
const LEGACY_TOKEN = /\{\{fields\.([^{}]+)\}\}/g;
const RUNTIME_FIELD_TOKEN = /\{\{([^{}.]+)\.fields\.([^{}]+)\}\}/g;

export const formFieldSemanticToken = fieldId => `{{formField:${fieldId}}}`;
export const formFieldRuntimeToken = (nodeId, fieldId) => `{{${nodeId}.fields.${fieldId}}}`;

const formTriggersFor = nodes => (nodes || []).filter(node => node?.subType === 'form-submission');
const fieldIdsFor = formSchema => new Set((formSchema?.fields || [])
    .map(field => field?.id)
    .filter(fieldId => typeof fieldId === 'string' && fieldId.trim()));

const issueFor = ({ code, path, fieldId, triggerCount }) => ({
    code,
    path,
    message: code === 'FORM_FIELD_REFERENCE_UNKNOWN'
        ? `The form does not contain field '${fieldId}'. Choose a field from the attached form.`
        : triggerCount === 0
            ? 'A form field was used, but this workflow has no form-submission trigger.'
            : 'A form field was used, but its source form trigger is ambiguous.'
});

const rewriteConfig = ({ value, path, trigger, fieldIds, triggerCount, repairs, issues }) => {
    if (typeof value === 'string') {
        const rewrite = (match, fieldId, source) => {
            if (!fieldIds.has(fieldId)) {
                issues.push(issueFor({ code: 'FORM_FIELD_REFERENCE_UNKNOWN', path, fieldId, triggerCount }));
                return match;
            }
            if (!trigger) {
                issues.push(issueFor({ code: 'FORM_FIELD_REFERENCE_SOURCE_AMBIGUOUS', path, fieldId, triggerCount }));
                return match;
            }
            repairs.push({
                code: source === 'semantic' ? 'FORM_FIELD_BINDING_RESOLVED' : 'FORM_FIELD_BINDING_NORMALIZED',
                path,
                fieldId,
                nodeId: trigger.id
            });
            return formFieldRuntimeToken(trigger.id, fieldId);
        };
        return value
            .replace(SEMANTIC_TOKEN, (match, fieldId) => rewrite(match, fieldId.trim(), 'semantic'))
            .replace(LEGACY_TOKEN, (match, fieldId) => rewrite(match, fieldId.trim(), 'legacy'));
    }
    if (Array.isArray(value)) return value.map((item, index) => rewriteConfig({ value: item, path: `${path}[${index}]`, trigger, fieldIds, triggerCount, repairs, issues }));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        rewriteConfig({ value: item, path: path ? `${path}.${key}` : key, trigger, fieldIds, triggerCount, repairs, issues })
    ]));
    return value;
};

/**
 * Converts AI-only form-field selectors and the legacy unrooted selector into
 * actual runtime paths after the final form-trigger node ID is known.
 */
export const normalizeFormFieldBindings = ({ nodes = [], formSchema = null } = {}) => {
    const triggers = formTriggersFor(nodes);
    const trigger = triggers.length === 1 ? triggers[0] : null;
    const fieldIds = fieldIdsFor(formSchema);
    const repairs = [];
    const issues = [];
    const normalizedNodes = nodes.map(node => ({
        ...node,
        config: rewriteConfig({
            value: node?.config || {},
            path: `nodes.${node?.id || 'new'}.config`,
            trigger,
            fieldIds,
            triggerCount: triggers.length,
            repairs,
            issues
        })
    }));

    const formTriggerIds = new Set(triggers.map(node => node.id));
    normalizedNodes.forEach(node => {
        const checkRuntimePaths = (value, path) => {
            if (typeof value === 'string') {
                for (const match of value.matchAll(RUNTIME_FIELD_TOKEN)) {
                    const [, sourceNodeId, fieldId] = match;
                    if (!formTriggerIds.has(sourceNodeId)) {
                        issues.push({
                            code: 'FORM_FIELD_REFERENCE_SOURCE_INVALID',
                            path,
                            message: 'A form field reference must start with this workflow’s form-submission trigger.'
                        });
                    } else if (!fieldIds.has(fieldId)) {
                        issues.push(issueFor({ code: 'FORM_FIELD_REFERENCE_UNKNOWN', path, fieldId, triggerCount: triggers.length }));
                    }
                }
                return;
            }
            if (Array.isArray(value)) value.forEach((item, index) => checkRuntimePaths(item, `${path}[${index}]`));
            else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => checkRuntimePaths(item, `${path}.${key}`));
        };
        checkRuntimePaths(node.config || {}, `nodes.${node.id}.config`);
    });

    return { nodes: normalizedNodes, repairs, issues };
};

export const formFieldBindingsForWorker = ({ workflow = {}, formSchema = null } = {}) => {
    const trigger = formTriggersFor(workflow.nodes).at(0) || null;
    return (formSchema?.fields || []).map(field => ({
        id: field.id,
        label: field.label || field.id,
        semanticToken: formFieldSemanticToken(field.id),
        ...(trigger ? { runtimeToken: formFieldRuntimeToken(trigger.id, field.id) } : {})
    }));
};
