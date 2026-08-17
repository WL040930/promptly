const EXPRESSION_KEY = '$expr';
const BINDING_KEY = '$binding';
const TEMPLATE_KEY = '$template';
const LEGACY_REFERENCE_RE = /\{\{([^{}]+)\}\}/g;
const UNSUPPORTED_INTERPOLATION_RE = /\$\{[^{}]+\}/g;
const PATH_SEGMENT_RE = /^[\w-]+$/;
const WORKFLOW_REFERENCE_HANDLES = new Set(['triggerData', 'inputData', 'event']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPath = path => Array.isArray(path)
    && path.length > 0
    && path.every(part => typeof part === 'string' && part.trim() && PATH_SEGMENT_RE.test(part));

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

export const findUnsupportedWorkflowReferenceTokens = value => {
    if (typeof value !== 'string') return [];
    return [...value.matchAll(UNSUPPORTED_INTERPOLATION_RE)].map(match => match[0]);
};

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

const cloneReference = ({ nodeId, path }) => ({
    [EXPRESSION_KEY]: 'reference',
    v: 1,
    nodeId,
    path: [...path]
});

const parsedLegacyReference = token => {
    const clean = String(token || '').trim();
    const segments = clean.split('.');
    const source = segments.shift() || '';
    return { source, path: segments };
};

const tokenIssue = (code, path, token, message, details = {}) => issue(code, path, message, { token, ...details });

const unsupportedInterpolationIssues = (value, path) => findUnsupportedWorkflowReferenceTokens(value).map(token => tokenIssue(
    'WORKFLOW_REFERENCE_UNSUPPORTED_SYNTAX',
    path,
    token,
    'Unsupported workflow interpolation syntax. Use a structured $binding or $template for workflow data.'
));

const normalizeLegacyValue = ({ value, path, resolveReference, rejectLegacy, issues, repairs }) => {
    if (typeof value === 'string') {
        const unsupportedIssues = unsupportedInterpolationIssues(value, path);
        if (unsupportedIssues.length > 0) {
            issues.push(...unsupportedIssues);
            return value;
        }
        const matches = [...value.matchAll(LEGACY_REFERENCE_RE)];
        if (matches.length === 0) return value;

        if (rejectLegacy) {
            issues.push(...matches.map(match => tokenIssue(
                'WORKFLOW_REFERENCE_LEGACY_FORBIDDEN',
                path,
                match[0],
                'Use the variable picker or a structured $binding/$template instead of a legacy double-brace workflow reference.'
            )));
            return value;
        }

        const parts = [];
        let cursor = 0;
        let invalid = false;
        for (const [index, match] of matches.entries()) {
            const token = match[0];
            const start = match.index ?? 0;
            if (start > cursor) parts.push({ text: value.slice(cursor, start) });
            const resolution = resolveReference?.({
                token,
                sourcePath: match[1].trim(),
                path: `${path}.references[${index}]`
            });
            if (!resolution?.nodeId || !Array.isArray(resolution.path)) {
                invalid = true;
                issues.push(resolution?.issue || tokenIssue(
                    'WORKFLOW_REFERENCE_INVALID',
                    `${path}.references[${index}]`,
                    token,
                    'This workflow reference is invalid.'
                ));
            } else {
                const reference = cloneReference(resolution);
                parts.push({ reference });
                repairs.push({
                    code: 'WORKFLOW_REFERENCE_NORMALIZED',
                    path,
                    token,
                    nodeId: reference.nodeId,
                    referencePath: reference.path
                });
            }
            cursor = start + token.length;
        }
        if (cursor < value.length) parts.push({ text: value.slice(cursor) });
        if (invalid) return value;
        if (matches.length === 1 && value === matches[0][0]) return parts[0].reference;
        return {
            [EXPRESSION_KEY]: 'template',
            v: 1,
            parts: parts.filter(part => part.text !== '' || part.reference)
        };
    }

    if (Array.isArray(value)) return value.map((item, index) => normalizeLegacyValue({
        value: item,
        path: `${path}[${index}]`,
        resolveReference,
        rejectLegacy,
        issues,
        repairs
    }));

    if (isWorkflowBinding(value)) return value;
    if (isWorkflowBindingTemplate(value)) {
        return {
            [TEMPLATE_KEY]: value[TEMPLATE_KEY].map((part, index) => normalizeLegacyValue({
                value: part,
                path: `${path}.parts[${index}]`,
                resolveReference,
                rejectLegacy,
                issues,
                repairs
            }))
        };
    }
    if (isWorkflowExpression(value)) {
        if (value[EXPRESSION_KEY] === 'template') {
            (value.parts || []).forEach((part, index) => {
                if (typeof part?.text === 'string') issues.push(...unsupportedInterpolationIssues(part.text, `${path}.parts[${index}]`));
            });
        }
        return value;
    }
    if (isObject(value) && !isWorkflowExpression(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeLegacyValue({
            value: item,
            path: path ? `${path}.${key}` : key,
            resolveReference,
            rejectLegacy,
            issues,
            repairs
        })]));
    }

    return value;
};

/**
 * Convert a single user-authored legacy string using a caller-supplied source
 * resolver. The resolver is the policy boundary: the shared tokenizer never
 * guesses which node a title or handle refers to.
 */
export const normalizeWorkflowReferenceValue = ({ value, path = 'value', resolveReference, rejectLegacy = false } = {}) => {
    const issues = [];
    const repairs = [];
    const normalizedValue = normalizeLegacyValue({ value, path, resolveReference, rejectLegacy, issues, repairs });
    return { value: normalizedValue, issues, repairs };
};

const schemaForNodeFrom = ({ node, schemaForNode, schemasByNodeKey }) => {
    if (typeof schemaForNode === 'function') return schemaForNode(node) || {};
    if (node?.schema) return node.schema;
    const key = node?.nodeKey || `${node?.type || ''}:${node?.subType || ''}`;
    if (schemasByNodeKey instanceof Map) return schemasByNodeKey.get(key)?.schema || schemasByNodeKey.get(key) || {};
    if (Array.isArray(schemasByNodeKey)) return schemasByNodeKey.find(spec => (spec?.nodeKey || `${spec?.type || ''}:${spec?.subType || ''}`) === key)?.schema || {};
    return {};
};

const upstreamIdsFor = (targetId, edges = []) => {
    const upstream = new Set();
    const queue = [targetId];
    const incoming = new Map();
    for (const edge of edges || []) {
        if (!incoming.has(edge?.target)) incoming.set(edge.target, []);
        if (edge?.source) incoming.get(edge.target).push(edge.source);
    }
    while (queue.length > 0) {
        const current = queue.shift();
        for (const source of incoming.get(current) || []) {
            if (upstream.has(source)) continue;
            upstream.add(source);
            queue.push(source);
        }
    }
    return upstream;
};

const outputForPath = ({ source, sourceSchema, path }) => {
    if (path[0] === 'success') return null;
    if (path[0] === 'fields' && source?.subType === 'form-submission') return null;
    const outputs = (sourceSchema?.outputs || []).filter(output => output?.name);
    if (outputs.length === 0) return null;
    return outputs.find(output => output.name === path[0]) || undefined;
};

const resolveServerReference = ({ token, sourcePath, targetNode, nodes, edges, formSchema, schemaForNode, schemasByNodeKey }) => {
    const { source, path } = parsedLegacyReference(sourcePath || token);
    const referencePath = `${sourcePath || token}`;
    if (WORKFLOW_REFERENCE_HANDLES.has(source)) {
        return {
            issue: tokenIssue(
                'WORKFLOW_REFERENCE_ROOT_HANDLE',
                referencePath,
                token,
                `'${source}' is a connection handle, not a workflow step. Choose a value from an upstream step.`
            )
        };
    }
    if (!source || path.length === 0 || path.some(part => !PATH_SEGMENT_RE.test(part))) {
        return {
            issue: tokenIssue(
                'WORKFLOW_REFERENCE_PATH_INVALID',
                referencePath,
                token,
                'Workflow references need a step ID and non-empty path segments.'
            )
        };
    }

    const idMatch = (nodes || []).find(node => node?.id === source);
    const titleMatches = (nodes || []).filter(node => node?.title === source);
    const candidates = idMatch ? [idMatch] : titleMatches;
    if (candidates.length === 0) {
        return {
            issue: tokenIssue(
                'WORKFLOW_REFERENCE_SOURCE_UNKNOWN',
                referencePath,
                token,
                `The workflow step '${source}' no longer exists.`,
                { source }
            )
        };
    }
    if (candidates.length > 1) {
        return {
            issue: tokenIssue(
                'WORKFLOW_REFERENCE_SOURCE_AMBIGUOUS',
                referencePath,
                token,
                `The workflow step title '${source}' is ambiguous. Choose the step from the variable picker.`,
                { source }
            )
        };
    }

    const sourceNode = candidates[0];
    const upstream = upstreamIdsFor(targetNode?.id, edges);
    if (Array.isArray(edges) && !upstream.has(sourceNode.id)) {
        return {
            issue: tokenIssue(
                'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
                referencePath,
                token,
                `The workflow step '${source}' is not connected upstream of this field.`,
                { source }
            )
        };
    }

    const sourceSchema = schemaForNodeFrom({ node: sourceNode, schemaForNode, schemasByNodeKey });
    if (path[0] === 'fields') {
        if (path.length !== 2 || sourceNode.subType !== 'form-submission') {
            return {
                issue: tokenIssue(
                    'WORKFLOW_REFERENCE_PATH_INVALID',
                    referencePath,
                    token,
                        'Form field references must point to a form step field ID.'
                )
            };
        }
        if (formSchema && (!sourceNode.config?.formId || !formSchema.id || sourceNode.config.formId === formSchema.id)) {
            const field = activeFields(formSchema).find(item => item.id === path[1]);
            if (!field) {
                return {
                    issue: tokenIssue(
                        'WORKFLOW_REFERENCE_FIELD_MISSING',
                        referencePath,
                        token,
                        `The form field '${path[1]}' no longer exists.`,
                        { fieldId: path[1] }
                    )
                };
            }
        }
    } else {
        const output = outputForPath({ source: sourceNode, sourceSchema, path });
        if (output === undefined) {
            return {
                issue: tokenIssue(
                    'WORKFLOW_REFERENCE_PATH_INVALID',
                    referencePath,
                    token,
                    `The workflow step '${source}' does not expose '${path[0]}' as a data value.`
                )
            };
        }
        if (output?.isConnection) {
            return {
                issue: tokenIssue(
                    'WORKFLOW_REFERENCE_PATH_INVALID',
                    referencePath,
                    token,
                    `'${path[0]}' is a connection handle. Choose a data output from the step instead.`
                )
            };
        }
    }

    return { nodeId: sourceNode.id, path };
};

/**
 * Normalize workflow-reference fields on a graph. Only inputs explicitly
 * marked `workflow-expression` are touched; node-owned templates continue to
 * use the runtime's legacy parser until their own contract changes.
 */
export const normalizeWorkflowReferences = ({
    nodes = [],
    edges = [],
    formSchema = null,
    schemaForNode,
    schemasByNodeKey,
    rejectLegacy = false
} = {}) => {
    const issues = [];
    const repairs = [];
    const normalizedNodes = (nodes || []).map(node => {
        const schema = schemaForNodeFrom({ node, schemaForNode, schemasByNodeKey });
        const workflowInputs = new Set((schema?.inputs || [])
            .filter(input => input?.valueSyntax === 'workflow-expression')
            .map(input => input.name));
        if (workflowInputs.size === 0) return node;
        const config = { ...(node?.config || {}) };
        for (const inputName of workflowInputs) {
            if (!Object.hasOwn(config, inputName)) continue;
            const result = normalizeWorkflowReferenceValue({
                value: config[inputName],
                path: `nodes.${node?.id || 'new'}.config.${inputName}`,
                rejectLegacy,
                resolveReference: ({ token, sourcePath }) => resolveServerReference({
                    token,
                    sourcePath,
                    targetNode: node,
                    nodes,
                    edges,
                    formSchema,
                    schemaForNode,
                    schemasByNodeKey
                })
            });
            config[inputName] = result.value;
            issues.push(...result.issues);
            repairs.push(...result.repairs);
        }
        return { ...node, config };
    });
    return { nodes: normalizedNodes, issues, repairs };
};

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

const referenceIssues = ({ expression, path, nodesById, fieldIds, targetNodeId = null, upstreamByTarget = null }) => {
    if (expression[EXPRESSION_KEY] === 'reference') {
        if (WORKFLOW_REFERENCE_HANDLES.has(expression.nodeId)) return [issue('WORKFLOW_REFERENCE_ROOT_HANDLE', path, `'${expression.nodeId}' is a connection handle, not a workflow step.`)];
        if (!nodesById.has(expression.nodeId)) return [issue('WORKFLOW_REFERENCE_SOURCE_UNKNOWN', path, 'This value refers to a step that no longer exists.')];
        if (upstreamByTarget && targetNodeId && !upstreamByTarget.get(targetNodeId)?.has(expression.nodeId)) {
            return [issue('WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM', path, 'This value refers to a step that is not connected upstream.')];
        }
        if (!validPath(expression.path)) return [issue('WORKFLOW_REFERENCE_PATH_INVALID', path, 'This workflow value has an invalid reference path.')];
        const source = nodesById.get(expression.nodeId);
        if (expression.path[0] === 'fields') {
            if (expression.path.length !== 2) return [issue('WORKFLOW_REFERENCE_PATH_INVALID', path, 'A form field reference must contain exactly one field ID.')];
            if (source?.subType !== 'form-submission') return [issue('WORKFLOW_REFERENCE_SOURCE_INVALID', path, 'A form field must come from the form-submission step.')];
            if (!fieldIds.has(expression.path[1])) return [issue('WORKFLOW_REFERENCE_FIELD_MISSING', path, 'The referenced form field no longer exists.')];
        }
        return [];
    }
    if (expression[EXPRESSION_KEY] === 'template') {
        if (!Array.isArray(expression.parts)) return [issue('WORKFLOW_TEMPLATE_INVALID', path, 'This workflow message has an invalid template.')];
        return expression.parts.flatMap((part, index) => {
            const partPath = `${path}.parts[${index}]`;
            if (isObject(part) && typeof part.text === 'string' && !Object.hasOwn(part, 'reference')) return [];
            if (isObject(part) && part.reference && isWorkflowExpression(part.reference) && !Object.hasOwn(part, 'text')) {
                return referenceIssues({ expression: part.reference, path: partPath, nodesById, fieldIds, targetNodeId, upstreamByTarget });
            }
            return [issue('WORKFLOW_TEMPLATE_INVALID', partPath, 'Each workflow template part must be literal text or a reference.')];
        });
    }
    return [issue('WORKFLOW_EXPRESSION_INVALID', path, 'This workflow value has an unsupported expression.')];
};

export const validateWorkflowExpressions = ({ nodes = [], edges = null, formSchema = null } = {}) => {
    const nodesById = new Map((nodes || []).map(node => [node.id, node]));
    const fieldIds = new Set(activeFields(formSchema).map(field => field.id));
    const upstreamByTarget = Array.isArray(edges)
        ? new Map((nodes || []).map(node => [node.id, upstreamIdsFor(node.id, edges)]))
        : null;
    const walk = (value, path, targetNodeId) => {
        if (isWorkflowExpression(value)) return referenceIssues({ expression: value, path, nodesById, fieldIds, targetNodeId, upstreamByTarget });
        if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${path}[${index}]`, targetNodeId));
        if (isObject(value)) return Object.entries(value).flatMap(([key, item]) => walk(item, path ? `${path}.${key}` : key, targetNodeId));
        return [];
    };
    return (nodes || []).flatMap(node => walk(node?.config || {}, `nodes.${node?.id || 'new'}.config`, node?.id));
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

/** Convert a canonical expression to a temporary editable legacy string. */
export const workflowExpressionToLegacyText = expression => {
    if (!isWorkflowExpression(expression)) return typeof expression === 'string' ? expression : '';
    if (expression[EXPRESSION_KEY] === 'reference') return `{{${expression.nodeId}.${(expression.path || []).join('.')}}}`;
    return (expression.parts || []).map(part => part?.reference
        ? workflowExpressionToLegacyText(part.reference)
        : part?.text || '').join('');
};
