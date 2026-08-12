const EXPRESSION_KEY = '$expr';
const BINDING_KEY = '$binding';
const TEMPLATE_KEY = '$template';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPath = path => Array.isArray(path) && path.length > 0 && path.every(part => typeof part === 'string' && part.trim());

export const isWorkflowExpression = value => isObject(value)
    && ['reference', 'template'].includes(value[EXPRESSION_KEY])
    && value.v === 1;

export const isWorkflowBinding = value => isObject(value)
    && typeof value[BINDING_KEY] === 'string'
    && Object.keys(value).length === 1;

export const isWorkflowBindingTemplate = value => isObject(value) && Array.isArray(value[TEMPLATE_KEY]);

const formTrigger = nodes => (nodes || []).filter(node => node?.subType === 'form-submission');
const activeFields = formSchema => (formSchema?.fields || []).filter(field => field?.id && !field.deleted && field.type !== 'heading');
const normalized = value => String(value || '').trim().toLowerCase();

const roleForField = field => {
    if (field?.semanticRole) return field.semanticRole;
    if (field?.type === 'email') return 'email';
    const label = normalized(`${field?.label || ''} ${field?.name || ''}`);
    if (/\b(full )?name\b/.test(label)) return 'name';
    return null;
};

/** The only form-field vocabulary the AI is allowed to author. */
export const buildFormBindingCatalogue = formSchema => ({
    bindings: [
        { key: 'submission_submitted_at', path: ['submittedAt'], label: 'Submitted At', type: 'string', role: 'submission_metadata' },
        { key: 'submission_response_id', path: ['responseId'], label: 'Response ID', type: 'string', role: 'submission_metadata' },
        ...activeFields(formSchema).map((field, index) => ({
            key: `form_field_${index + 1}`,
            fieldId: field.id,
            path: ['fields', field.id],
            label: field.label || field.id,
            type: field.type || 'text',
            role: roleForField(field)
        }))
    ]
});

const issue = (code, path, message, details = {}) => ({ code, path, message, ...details });

export const formFieldReferenceExpression = (nodeId, fieldId) => ({
    [EXPRESSION_KEY]: 'reference',
    v: 1,
    nodeId,
    path: ['fields', fieldId]
});

const formBindingReferenceExpression = (nodeId, binding) => ({
    [EXPRESSION_KEY]: 'reference',
    v: 1,
    nodeId,
    path: binding.path || ['fields', binding.fieldId]
});

const compileValue = ({ value, path, bindings, trigger, issues, repairs }) => {
    if (isWorkflowBinding(value)) {
        const binding = bindings.get(value[BINDING_KEY]);
        if (!binding) {
            issues.push(issue('WORKFLOW_BINDING_UNKNOWN', path, `Choose a field from this form instead of '${value[BINDING_KEY]}'.`, { bindingKey: value[BINDING_KEY] }));
            return value;
        }
        if (!trigger) {
            issues.push(issue('WORKFLOW_FORM_TRIGGER_REQUIRED', path, 'A form field can only be used after one form-submission trigger is connected.'));
            return value;
        }
        repairs.push({ code: 'WORKFLOW_BINDING_COMPILED', path, bindingKey: binding.key, fieldId: binding.fieldId, nodeId: trigger.id });
        return formBindingReferenceExpression(trigger.id, binding);
    }

    if (isWorkflowBindingTemplate(value)) {
        const parts = value[TEMPLATE_KEY].map((part, index) => {
            if (typeof part === 'string') return { text: part };
            const compiled = compileValue({ value: part, path: `${path}.parts[${index}]`, bindings, trigger, issues, repairs });
            return isWorkflowExpression(compiled) ? { reference: compiled } : { text: '' };
        }).filter(part => part.text !== '' || part.reference);
        return { [EXPRESSION_KEY]: 'template', v: 1, parts };
    }

    if (Array.isArray(value)) return value.map((item, index) => compileValue({ value: item, path: `${path}[${index}]`, bindings, trigger, issues, repairs }));
    if (isObject(value) && !isWorkflowExpression(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        compileValue({ value: item, path: path ? `${path}.${key}` : key, bindings, trigger, issues, repairs })
    ]));
    return value;
};

/** Compiles AI binding objects into the canonical persisted workflow expression format. */
export const compileWorkflowBindings = ({ nodes = [], formSchema = null } = {}) => {
    const triggers = formTrigger(nodes);
    const trigger = triggers.length === 1 ? triggers[0] : null;
    const catalogue = buildFormBindingCatalogue(formSchema);
    const bindings = new Map(catalogue.bindings.map(binding => [binding.key, binding]));
    const issues = [];
    const repairs = [];
    const compiledNodes = nodes.map(node => ({
        ...node,
        config: compileValue({
            value: node?.config || {},
            path: `nodes.${node?.id || 'new'}.config`,
            bindings,
            trigger,
            issues,
            repairs
        })
    }));
    return { nodes: compiledNodes, catalogue, issues, repairs };
};

const referenceIssues = ({ expression, path, nodesById, fieldIds }) => {
    if (expression[EXPRESSION_KEY] === 'reference') {
        if (!nodesById.has(expression.nodeId)) return [issue('WORKFLOW_REFERENCE_SOURCE_UNKNOWN', path, 'This value refers to a step that no longer exists.')];
        if (!validPath(expression.path)) return [issue('WORKFLOW_REFERENCE_PATH_INVALID', path, 'This workflow value has an invalid reference path.')];
        const source = nodesById.get(expression.nodeId);
        if (expression.path[0] === 'fields') {
            if (source?.subType !== 'form-submission') return [issue('WORKFLOW_REFERENCE_SOURCE_INVALID', path, 'A form field must come from the form-submission step.')];
            if (!fieldIds.has(expression.path[1])) return [issue('WORKFLOW_REFERENCE_FIELD_MISSING', path, 'The referenced form field no longer exists.')];
        }
        return [];
    }
    if (expression[EXPRESSION_KEY] === 'template') {
        if (!Array.isArray(expression.parts)) return [issue('WORKFLOW_TEMPLATE_INVALID', path, 'This workflow message has an invalid template.')];
        return expression.parts.flatMap((part, index) => part?.reference && isWorkflowExpression(part.reference)
            ? referenceIssues({ expression: part.reference, path: `${path}.parts[${index}]`, nodesById, fieldIds })
            : []);
    }
    return [issue('WORKFLOW_EXPRESSION_INVALID', path, 'This workflow value has an unsupported expression.')];
};

export const validateWorkflowExpressions = ({ nodes = [], formSchema = null } = {}) => {
    const nodesById = new Map((nodes || []).map(node => [node.id, node]));
    const fieldIds = new Set(activeFields(formSchema).map(field => field.id));
    const walk = (value, path) => {
        if (isWorkflowExpression(value)) return referenceIssues({ expression: value, path, nodesById, fieldIds });
        if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${path}[${index}]`));
        if (isObject(value)) return Object.entries(value).flatMap(([key, item]) => walk(item, path ? `${path}.${key}` : key));
        return [];
    };
    return (nodes || []).flatMap(node => walk(node?.config || {}, `nodes.${node?.id || 'new'}.config`));
};

const getContextValue = (context, nodeId, path) => path.reduce((current, key) => current === undefined || current === null ? undefined : current[key], context?.[nodeId]);

const isOmittedFormField = (expression, context) => {
    const path = expression.path;
    if (path.length !== 2 || path[0] !== 'fields') return false;

    // Form submissions may omit unanswered optional fields entirely. A
    // spreadsheet row should receive an empty cell for that case, while a
    // missing node, trigger metadata, or nested path must remain an error.
    const source = context?.[expression.nodeId];
    return source?.success === true
        && source?.triggerData?.fields
        && source?.fields
        && !Object.hasOwn(source.fields, path[1]);
};

export const resolveWorkflowExpression = (expression, context) => {
    if (!isWorkflowExpression(expression)) return { value: expression, unresolved: [] };
    if (expression[EXPRESSION_KEY] === 'reference') {
        const value = getContextValue(context, expression.nodeId, expression.path);
        if (value === undefined && isOmittedFormField(expression, context)) return { value: '', unresolved: [] };
        return value === undefined ? { value: expression, unresolved: [expression] } : { value, unresolved: [] };
    }
    const values = expression.parts.map(part => part?.reference ? resolveWorkflowExpression(part.reference, context) : { value: part?.text || '', unresolved: [] });
    const unresolved = values.flatMap(result => result.unresolved);
    return unresolved.length > 0
        ? { value: expression, unresolved }
        : { value: values.map(result => typeof result.value === 'object' ? JSON.stringify(result.value) : String(result.value)).join(''), unresolved: [] };
};

export const describeWorkflowExpression = (expression, { nodes = [], formsById = {} } = {}) => {
    if (!isWorkflowExpression(expression)) return null;
    const describeReference = reference => {
        const node = nodes.find(item => item?.id === reference.nodeId);
        const source = node?.title || node?.subType || 'Unknown step';
        const fieldId = reference.path?.[1];
        const field = node?.config?.formId ? formsById[node.config.formId]?.fields?.find(item => item.id === fieldId) : null;
        return { label: `${source} › ${field?.label || (fieldId ? `Unknown field (${fieldId})` : reference.path?.at(-1) || 'Value')}`, resolved: Boolean(node && (!fieldId || field)) };
    };
    if (expression[EXPRESSION_KEY] === 'reference') return { type: 'reference', parts: [describeReference(expression)] };
    return { type: 'template', parts: expression.parts.map(part => part.reference ? { reference: describeReference(part.reference) } : { text: part.text || '' }) };
};
