import crypto from 'crypto';
import NodeRegistry from '../../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../engine/workflowValidator.js';
import nodeResourceService from '../../nodes/nodeResourceService.js';
import { normalizeNodeInputOptions, normalizeNodeResourceValue, resolveNodeResourceParams } from '../../../../shared/nodeConfigContract.js';
import { compileWorkflowBindings, formFieldReferenceExpression, isWorkflowExpression, validateWorkflowExpressions } from '../../../../shared/workflowExpressions.js';
import { layoutWorkflow } from '../../../../shared/workflowLayout.js';


const resourceVariantKey = params => JSON.stringify(Object.fromEntries(Object.entries(params || {}).sort(([left], [right]) => left.localeCompare(right))));

const resourceRequestsFor = specs => {
    const requests = new Map();
    for (const spec of specs || []) {
        const inputs = spec.schema?.inputs || [];
        const inputsByName = new Map(inputs.map(input => [input.name, input]));
        for (const input of inputs.filter(item => item.type === 'resource-select' && item.resource)) {
            let variants = [{}];
            for (const [paramName, binding] of Object.entries(input.resourceParams || {})) {
                if (typeof binding !== 'string' || !binding.startsWith('$')) {
                    variants = variants.map(params => ({ ...params, [paramName]: binding }));
                    continue;
                }
                const dependency = inputsByName.get(binding.slice(1));
                const options = normalizeNodeInputOptions(dependency, {}).filter(option => !option.disabled && option.value !== '').map(option => String(option.value));
                if (options.length === 0) {
                    variants = [];
                    break;
                }
                variants = variants.flatMap(params => options.map(value => ({ ...params, [paramName]: value })));
            }
            if (variants.length === 0) continue;
            for (const params of variants.slice(0, 100)) {
                const key = `${input.resource}:${resourceVariantKey(params)}`;
                requests.set(key, { resource: input.resource, params });
            }
        }
    }
    return [...requests.values()];
};

const resourceContextEntry = ({ resource, params, result }) => ({
    ...result,
    resource,
    ...(Object.keys(params).length > 0 ? { params } : {})
});

export const loadWorkflowResourceContext = async ({ userId, specs = [], resourceService = nodeResourceService } = {}) => {
    if (!userId) return {};
    const context = {};
    for (const { resource, params } of resourceRequestsFor(specs)) {
        const key = resourceVariantKey(params);
        try {
            const result = await resourceService.list({ userId, resource, params });
            if (Object.keys(params).length === 0) {
                context[resource] = resourceContextEntry({ resource, params, result });
            } else {
                context[resource] ||= { resource, options: [], variants: {} };
                context[resource].variants[key] = resourceContextEntry({ resource, params, result });
            }
        } catch (error) {
            const entry = {
                resource,
                options: [],
                error: {
                    code: error.code || 'NODE_RESOURCE_FAILED',
                    message: error.message || 'Resource could not be loaded.',
                    action: error.action || null
                }
            };
            if (Object.keys(params).length === 0) context[resource] = entry;
            else {
                context[resource] ||= { resource, options: [], variants: {} };
                context[resource].variants[key] = { ...entry, params };
            }
        }
    }
    return context;
};

const compactResource = value => ({
    account: value?.account || null,
    options: (value?.options || []).map(option => ({ value: option.value, label: option.label, description: option.description || null })),
    emptyMessage: value?.emptyMessage || null,
    error: value?.error || null
});

const resourceContextBlock = resourceContext => {
    const entries = Object.entries(resourceContext || {});
    if (entries.length === 0) return 'No account resources were loaded. Leave resource-select values empty rather than inventing IDs.';
    return entries.map(([resource, value]) => JSON.stringify({
        resource,
        ...compactResource(value),
        variants: Object.values(value.variants || {}).map(variant => ({ params: variant.params || {}, ...compactResource(variant) }))
    })).join('\n');
};

const resourceContextForInput = (input, node, resourceContext) => {
    const entry = resourceContext[input.resource];
    if (!entry) return null;
    const params = resolveNodeResourceParams(input, node.config || {});
    if (Object.keys(params).length === 0 || !entry.variants) return entry;
    return entry.variants[resourceVariantKey(params)] || null;
};

export const isProvisionedResourceReference = value => value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.$provision === 'string'
    && Object.keys(value).length === 1;

/**
 * Normalize resource values before compilation. AI output occasionally wraps an
 * existing resource ID in `$provision`; that syntax is reserved for resources
 * created by this proposal. We can safely unwrap it only when the ID exactly
 * matches an account resource supplied by the server.
 */
export const normalizeGeneratedResourceValues = ({ nodes = [], specs = [], resourceContext = {}, resourceChanges = [] } = {}) => {
    const specsByKey = new Map(specs.map(spec => [spec.nodeKey || `${spec.type}:${spec.subType}`, spec]));
    const provisionRefs = new Set((resourceChanges || [])
        .filter(change => change?.type === 'create_google_spreadsheet')
        .map(change => change.ref));
    const issues = [];
    const repairs = [];
    const normalizedNodes = nodes.map(node => ({ ...node, config: { ...(node.config || {}) } }));
    normalizedNodes.forEach((node, nodeIndex) => {
        const spec = specsByKey.get(node.nodeKey || `${node.type}:${node.subType}`);
        (spec?.schema?.inputs || []).filter(input => input.type === 'resource-select' && input.resource).forEach(input => {
            const value = node.config?.[input.name];
            if (value === undefined || value === null || value === '') return;
            if (isProvisionedResourceReference(value)) {
                if (input.resource === 'google-spreadsheets' && provisionRefs.has(value.$provision)) return;
                const resource = resourceContextForInput(input, node, resourceContext);
                const matchingOption = resource?.options?.find(option => String(option.value) === value.$provision);
                if (matchingOption) {
                    node.config[input.name] = matchingOption.value;
                    repairs.push({ code: 'WORKFLOW_RESOURCE_REFERENCE_UNWRAPPED', nodeId: node.id, field: input.name, resource: input.resource });
                    return;
                }
                issues.push({
                    code: 'WORKFLOW_PROVISION_REFERENCE_INVALID',
                    path: `nodes[${nodeIndex}].config.${input.name}`,
                    message: `${input.label || input.name} cannot use a proposed resource reference.`
                });
                return;
            }
            if (typeof value === 'object') {
                issues.push({
                    code: 'WORKFLOW_RESOURCE_REFERENCE_INVALID',
                    path: `nodes[${nodeIndex}].config.${input.name}`,
                    message: `${input.label || input.name} must use a resource ID from this account.`
                });
                return;
            }
            const dependsOnProvisionedSpreadsheet = Object.values(input.resourceParams || {}).some(binding => (
                typeof binding === 'string'
                && binding.startsWith('$')
                && isProvisionedResourceReference(node.config?.[binding.slice(1)])
            ));
            if (dependsOnProvisionedSpreadsheet) return;
            const resource = resourceContextForInput(input, node, resourceContext);
            if (!resource || resource.error) {
                issues.push({
                    code: 'WORKFLOW_RESOURCE_UNAVAILABLE',
                    path: `nodes[${nodeIndex}].config.${input.name}`,
                    message: `${input.label || input.name} could not be verified against an available account resource.`
                });
                return;
            }
            const options = Array.isArray(resource.options) ? resource.options : [];
            const normalizedValue = normalizeNodeResourceValue(input.valueFormat, value);
            const matchingOption = options.find(option => String(option.value) === normalizedValue);
            if (matchingOption) {
                node.config[input.name] = matchingOption.value;
                return;
            }
            if (input.allowCustom === true && normalizedValue) {
                node.config[input.name] = normalizedValue;
                return;
            }
            if (!matchingOption) {
                issues.push({
                    code: 'WORKFLOW_RESOURCE_NOT_FOUND',
                    path: `nodes[${nodeIndex}].config.${input.name}`,
                    message: `${input.label || input.name} must use one of the resources available in this account.`
                });
            }
        });
    });
    return { nodes: normalizedNodes, repairs, issues };
};

export const validateGeneratedResourceValues = (args = {}) => normalizeGeneratedResourceValues(args).issues;

const isEmailAction = node => node?.subType === 'email' || node?.nodeKey === 'action:email';

const respondentConfirmationPattern = /(?:\b(?:thank[- ]?you|confirmation|confirm|acknowledg)\b.{0,80}\b(?:email|message|respondent|user|applicant|submitter)\b|\b(?:email|notify|send)\b.{0,80}\b(?:respondent|user|applicant|submitter)\b)/i;
const applicationReviewPattern = /\b(?:approve|approval|reject|rejected|rejection)\b/i;

export const requiredCapabilitiesForRequest = message => {
    const text = String(message || '');
    const capabilities = [];
    if (respondentConfirmationPattern.test(text)) capabilities.push('respondent_confirmation');
    if (applicationReviewPattern.test(text) && /\b(form|submission|applicant|candidate|workflow|automation)\b/i.test(text)) {
        capabilities.push('owner_approval');
    }
    return capabilities;
};

const emailFieldsFor = formSchema => (Array.isArray(formSchema?.fields) ? formSchema.fields : [])
    .filter(field => field?.type === 'email' && field?.required === true && typeof field.id === 'string' && field.id.trim());

const normalizeFieldText = value => String(value || '').trim().toLowerCase();

const isExplicitRespondentEmail = field => field?.isRespondentEmail === true
    || field?.role === 'respondent_email'
    || field?.semanticRole === 'respondent_email';

const respondentEmailScore = field => {
    const label = normalizeFieldText(`${field?.label || ''} ${field?.name || ''}`);
    const id = normalizeFieldText(field?.id);
    let score = 0;
    if (label === 'email' || label === 'e-mail') score += 100;
    if (/(?:applicant|candidate|respondent|contact|primary)\s+.*email|email\s+.*(?:applicant|candidate|respondent|contact|primary)/.test(label)) score += 45;
    if (/\bemail(?:\s+address)?\b|\be-mail\b/.test(label)) score += 25;
    if (/(?:^|[_-])email(?:$|[_-])/.test(id)) score += 5;
    if (/\b(?:confirm(?:ation)?|retype|repeat|cc|bcc|owner|internal|recruiter|secondary|alternate)\b/.test(label)) score -= 60;
    if (/\b(?:confirm|retype|repeat|cc|bcc|owner|internal|recruiter|secondary|alternate)\b/.test(id)) score -= 40;
    return score;
};

/**
 * Resolve the form field that represents the respondent's delivery address.
 * Multiple email fields are allowed; only genuinely tied candidates remain
 * ambiguous. This keeps the workflow flexible without making the model guess
 * runtime bindings.
 */
export const resolveRespondentEmailField = ({ formSchema = null, preferredFieldId = null } = {}) => {
    const candidates = emailFieldsFor(formSchema);
    if (candidates.length === 0) return { field: null, candidates: [], ambiguous: false, reason: 'missing' };

    const explicitId = preferredFieldId
        || formSchema?.respondentEmailFieldId
        || formSchema?.settings?.respondentEmailFieldId;
    const explicit = candidates.find(field => field.id === explicitId);
    if (explicit) return { field: explicit, candidates: [explicit], ambiguous: false, reason: 'explicit' };

    const marked = candidates.filter(isExplicitRespondentEmail);
    if (marked.length === 1) return { field: marked[0], candidates: marked, ambiguous: false, reason: 'marked' };

    const scored = candidates
        .map(field => ({ field, score: respondentEmailScore(field) }))
        .sort((left, right) => right.score - left.score);
    const [best, second] = scored;
    const hasClearWinner = scored.length === 1
        || (best.score > second.score && (best.score >= 20 || best.score - second.score >= 15));
    if (hasClearWinner) return { field: best.field, candidates: scored, ambiguous: false, reason: 'label' };

    return { field: null, candidates: scored, ambiguous: true, reason: 'ambiguous' };
};

const dynamicPathsIn = value => {
    if (isWorkflowExpression(value)) {
        if (value.$expr === 'reference') return [{ nodeId: value.nodeId, path: value.path }];
        return (value.parts || []).flatMap(part => part.reference ? dynamicPathsIn(part.reference) : []);
    }
    return typeof value === 'string'
        ? [...value.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => {
            const [nodeId, ...path] = match[1].trim().split('.');
            return { nodeId, path };
        })
        : [];
};

const reachableFrom = (sources, edges) => {
    const adjacency = new Map();
    for (const edge of edges || []) {
        if (!adjacency.has(edge?.source)) adjacency.set(edge.source, []);
        if (edge?.target) adjacency.get(edge.source).push(edge.target);
    }
    const reachable = new Set(sources.map(node => node.id));
    const queue = [...reachable];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const target of adjacency.get(current) || []) {
            if (reachable.has(target)) continue;
            reachable.add(target);
            queue.push(target);
        }
    }
    return reachable;
};

const recipientPathFor = (trigger, field) => formFieldReferenceExpression(trigger.id, field.id);

/**
 * Compile only machine-level capability bindings. The model remains free to
 * choose workflow topology, extra nodes, providers, and message content.
 */
export const compileWorkflowDraft = ({
    requiredCapabilities = [],
    formSchema = null,
    respondentEmailFieldId = null,
    nodes = [],
    edges = []
} = {}) => {
    const copiedNodes = nodes.map(node => ({ ...node, config: { ...(node.config || {}) } }));
    const compiledBindings = compileWorkflowBindings({ nodes: copiedNodes, formSchema });
    const nextNodes = compiledBindings.nodes;
    const nextEdges = edges.map(edge => ({ ...edge }));
    const repairs = [...compiledBindings.repairs];
    let bindingIssues = [...compiledBindings.issues];
    const wantsRespondentConfirmation = requiredCapabilities.includes('respondent_confirmation');
    const wantsLegacyApplicationReview = requiredCapabilities.includes('application_review_decision');
    const wantsOwnerApproval = wantsLegacyApplicationReview || requiredCapabilities.includes('owner_approval');
    const formTriggers = nextNodes.filter(node => node?.subType === 'form-submission');
    const emailActions = nextNodes.filter(isEmailAction);
    const respondentEmail = resolveRespondentEmailField({ formSchema, preferredFieldId: respondentEmailFieldId });

    // Correct only the runtime binding when the workflow has one clear
    // confirmation action. Leave all other model-authored decisions untouched.
    if (wantsRespondentConfirmation && formTriggers.length === 1 && respondentEmail.field
        && (emailActions.length === 1 || wantsOwnerApproval)) {
        const expected = recipientPathFor(formTriggers[0], respondentEmail.field);
        for (const emailAction of emailActions) {
            if (JSON.stringify(emailAction.config.to) !== JSON.stringify(expected)) {
                emailAction.config.to = expected;
                repairs.push({ code: 'RESPONDENT_RECIPIENT_BOUND', nodeId: emailAction.id, fieldId: respondentEmail.field.id });
            }
        }
        // The compiler can now safely discard a bad AI binding only where the
        // capability layer replaced it with the verified respondent address.
        const repairedRecipientPaths = new Set(emailActions.map(action => `nodes.${action.id}.config.to`));
        bindingIssues = bindingIssues.filter(item => !(
            item.code === 'WORKFLOW_BINDING_UNKNOWN' && repairedRecipientPaths.has(item.path)
        ));
    }

    if (wantsOwnerApproval) {
        const approvals = nextNodes.filter(node => node?.subType === 'approval');
        if (approvals.length === 1) {
            delete approvals[0].config.assigneeType;
            delete approvals[0].config.assigneeEmail;
            delete approvals[0].config.expiresAfterHours;
            repairs.push({ code: 'APPROVER_DEFAULTED_TO_OWNER', nodeId: approvals[0].id });
        }
    }

    bindingIssues.push(...validateWorkflowExpressions({ nodes: nextNodes, formSchema }));
    return { nodes: nextNodes, edges: nextEdges, repairs, bindingIssues, bindingCatalogue: compiledBindings.catalogue };
};

/**
 * Validate the data-flow contract for capabilities that address a form
 * respondent. The validator intentionally accepts arbitrary IDs, labels,
 * copy, and supported email providers; it only enforces the user-visible
 * capability and safe dynamic data flow.
 */
export const validateGeneratedWorkflowCapabilities = ({
    requiredCapabilities = [],
    formSchema = null,
    respondentEmailFieldId = null,
    nodes = [],
    edges = []
} = {}) => {
    const wantsRespondentConfirmation = requiredCapabilities.includes('respondent_confirmation');
    const wantsLegacyApplicationReview = requiredCapabilities.includes('application_review_decision');
    const wantsOwnerApproval = wantsLegacyApplicationReview || requiredCapabilities.includes('owner_approval');
    if (!wantsRespondentConfirmation && !wantsOwnerApproval) return [];

    const issues = [];
    const formTriggers = nodes.filter(node => node?.subType === 'form-submission');
    const emailActions = nodes.filter(isEmailAction);
    const contactFields = emailFieldsFor(formSchema);
    const respondentEmail = resolveRespondentEmailField({ formSchema, preferredFieldId: respondentEmailFieldId });

    if (wantsRespondentConfirmation && formTriggers.length === 0) {
        issues.push({ code: 'FORM_SUBMISSION_TRIGGER_MISSING', path: 'nodes', message: 'A form-submission trigger is required for respondent confirmation.' });
    }
    if (wantsRespondentConfirmation && contactFields.length === 0) {
        issues.push({ code: 'RESPONDENT_CONTACT_FIELD_MISSING', path: 'form.fields', message: 'The form must contain a required email field for respondent confirmation.' });
    }
    if (wantsRespondentConfirmation && emailActions.length === 0) {
        issues.push({ code: 'EMAIL_ACTION_MISSING', path: 'nodes', message: 'An email action is required for respondent confirmation.' });
    }

    const contactFieldIds = new Set(contactFields.map(field => field.id));
    const reachable = reachableFrom(formTriggers, edges);
    const reachableEmailActions = emailActions.filter(action => reachable.has(action.id));
    if (wantsRespondentConfirmation && reachableEmailActions.length === 0) {
        issues.push({ code: 'RESPONDENT_CONFIRMATION_DISCONNECTED', path: 'nodes', message: 'At least one confirmation email must be reachable from the form-submission trigger.' });
    }

    const hasValidRecipient = reachableEmailActions.some(emailAction => dynamicPathsIn(emailAction.config?.to).some(reference => {
        const parts = reference.path;
        return formTriggers.some(trigger => (
            reference.nodeId === trigger.id
            && parts[0] === 'fields'
            && contactFieldIds.has(parts[1])
        ));
    }));
    if (wantsRespondentConfirmation && !hasValidRecipient) {
        const paths = emailActions.flatMap(emailAction => dynamicPathsIn(emailAction.config?.to));
        issues.push({
            code: paths.length > 0
                ? 'RESPONDENT_RECIPIENT_FIELD_INVALID'
                : respondentEmail.ambiguous
                    ? 'RESPONDENT_RECIPIENT_FIELD_AMBIGUOUS'
                    : 'RESPONDENT_RECIPIENT_NOT_DYNAMIC',
            path: `nodes.${emailActions[0]?.id || 'email'}.config.to`,
            message: respondentEmail.ambiguous
                ? 'Multiple required email fields could receive the confirmation email. Choose the respondent email field.'
                : 'At least one confirmation email recipient must come from a required email field submitted by the form.',
            ...(respondentEmail.ambiguous ? {
                candidates: respondentEmail.candidates.map(candidate => ({
                    id: candidate.field.id,
                    label: candidate.field.label || candidate.field.name || candidate.field.id
                }))
            } : {})
        });
    }

    if (wantsOwnerApproval) {
        const approvalNodes = nodes.filter(node => node?.subType === 'approval');
        if (approvalNodes.length === 0) issues.push({ code: 'APPROVAL_NODE_MISSING', path: 'nodes', message: 'An approval node is required to review each application.' });
        if (wantsLegacyApplicationReview && formTriggers.length === 0) issues.push({ code: 'FORM_SUBMISSION_TRIGGER_MISSING', path: 'nodes', message: 'A form-submission trigger is required before application review.' });
        if (wantsLegacyApplicationReview && emailActions.length < 2) issues.push({ code: 'APPROVAL_BRANCH_EMAILS_MISSING', path: 'nodes', message: 'Approved and rejected branches each need an email action.' });
        if (wantsLegacyApplicationReview && approvalNodes.length > 0) {
            const approval = approvalNodes[0];
            const approvedReachable = reachableFrom([approval], edges.filter(edge => !edge.sourceHandle || edge.sourceHandle === 'approved'));
            const rejectedReachable = reachableFrom([approval], edges.filter(edge => !edge.sourceHandle || edge.sourceHandle === 'rejected'));
            if (!emailActions.some(action => approvedReachable.has(action.id))) issues.push({ code: 'APPROVED_BRANCH_EMAIL_MISSING', path: 'edges', message: 'The approved branch must reach an interview email.' });
            if (!emailActions.some(action => rejectedReachable.has(action.id))) issues.push({ code: 'REJECTED_BRANCH_EMAIL_MISSING', path: 'edges', message: 'The rejected branch must reach a thank-you email.' });
        }
    }

    return issues;
};

const normalizeConfig = (config, schema) => {
    const inputNames = new Set((schema?.inputs || []).map(input => input.name));
    const next = {};
    for (const [name, value] of Object.entries(config || {})) {
        if (inputNames.has(name)) next[name] = value;
    }
    return next;
};

const nodeUiFields = (spec) => ({
    schema: spec.schema,
    icon: spec.ui?.icon,
    bgColor: spec.ui?.bgColor || spec.ui?.iconBg,
    color: spec.ui?.color || spec.ui?.iconColor,
    iconColor: spec.ui?.iconColor || spec.ui?.color
});

const assertWorkflowDefinition = (nodes, edges, isActive = false, registry = NodeRegistry, requireConnected = false) => {
    const validation = validateWorkflow({ nodes, edges, isActive, requireConnected, registry });
    if (!validation.valid) {
        const error = new Error(`AI workflow proposal failed validation: ${validation.issues.map(item => item.message).join('; ')}`);
        error.code = 'WORKFLOW_PROPOSAL_INVALID';
        error.issues = validation.issues;
        throw error;
    }
    return validation;
};

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const mergeUsage = (...usages) => usages.reduce((total, usage) => ({
    promptTokens: total.promptTokens + (usage?.promptTokens || 0),
    completionTokens: total.completionTokens + (usage?.completionTokens || 0),
    totalTokens: total.totalTokens + (usage?.totalTokens || 0)
}), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

const throwEditError = (operation, message, details = {}) => {
    const error = new Error(message);
    error.code = details.code || 'WORKFLOW_EDIT_INVALID';
    error.operation = operation;
    error.issues = [{
        code: error.code,
        operation,
        message,
        ...(details.path ? { path: details.path } : {})
    }];
    throw error;
};

const assertConnectionHandle = (node, handle, direction, operation) => {
    if (handle === null || handle === undefined || !Array.isArray(node?.schema?.[direction])) return;
    const validHandles = node.schema[direction]
        .filter(item => item?.isConnection)
        .map(item => item.name)
        .filter(Boolean);
    if (!validHandles.includes(handle)) {
        throwEditError(operation, `Unknown ${direction === 'outputs' ? 'source' : 'target'} handle '${handle}'.`, {
            code: 'WORKFLOW_HANDLE_INVALID'
        });
    }
};

const nodeKeyFor = node => node.nodeKey || `${node.type}:${node.subType}`;

const connectionKey = ({ source, sourceHandle = null, target, targetHandle = null }) => JSON.stringify({
    source,
    sourceHandle: sourceHandle || null,
    target,
    targetHandle: targetHandle || null
});

const connectionFor = ({ source, sourceHandle = null, target, targetHandle = null, id = null, type = 'deletable' }) => ({
    id: id || newId('edge'),
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: targetHandle || null,
    type
});

const createEditView = workflow => {
    const nodes = workflow?.nodes || [];
    const refsById = new Map(nodes.map((node, index) => [node.id, `n${index + 1}`]));
    return {
        revision: workflow?.revision ?? null,
        nodes: nodes.map(node => ({
            ref: refsById.get(node.id),
            title: node.title,
            type: node.type,
            subType: node.subType,
            nodeKey: nodeKeyFor(node),
            config: node.config || {},
            position: node.position || null
        })),
        connections: (workflow?.edges || []).map(edge => ({
            from: { nodeRef: refsById.get(edge.source), handle: edge.sourceHandle || null },
            to: { nodeRef: refsById.get(edge.target), handle: edge.targetHandle || null }
        })).filter(connection => connection.from.nodeRef && connection.to.nodeRef)
    };
};

export const buildWorkflowEditView = createEditView;

const normalizeEndpoint = (endpoint, refs, operation, label) => {
    if (!endpoint || typeof endpoint !== 'object' || typeof endpoint.nodeRef !== 'string') {
        throwEditError(operation, `${label} must identify a nodeRef and optional handle.`, { code: 'WORKFLOW_ENDPOINT_INVALID' });
    }
    const nodeId = refs.get(endpoint.nodeRef);
    if (!nodeId) throwEditError(operation, `${label} references an unknown nodeRef '${endpoint.nodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
    return { nodeId, handle: endpoint.handle || null };
};

const addNodeFromEdit = ({ operation, nodeDefinition, nodes, refs, specsByNodeKey }) => {
    if (!nodeDefinition || typeof nodeDefinition !== 'object' || typeof nodeDefinition.ref !== 'string') {
        throwEditError(operation, 'create_node requires a new node ref.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    }
    if (refs.has(nodeDefinition.ref)) {
        throwEditError(operation, `Node ref '${nodeDefinition.ref}' is already in use.`, { code: 'WORKFLOW_NODE_REF_DUPLICATE' });
    }
    const spec = specsByNodeKey.get(nodeDefinition.nodeKey);
    if (!spec) throwEditError(operation, `Unknown nodeKey '${nodeDefinition.nodeKey}'.`, { code: 'WORKFLOW_NODE_KEY_INVALID' });
    const after = nodeDefinition.afterNodeRef ? refs.get(nodeDefinition.afterNodeRef) : null;
    if (nodeDefinition.afterNodeRef && !after) {
        throwEditError(operation, `afterNodeRef '${nodeDefinition.afterNodeRef}' does not exist.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
    }
    const afterNode = after ? nodes.find(node => node.id === after) : null;
    const x = afterNode
        ? (afterNode.position?.x || 100) + 350
        : Math.max(0, ...nodes.map(node => node.position?.x || 0)) + 350;
    const id = newId('node');
    refs.set(nodeDefinition.ref, id);
    const node = {
        id,
        type: spec.type,
        subType: spec.subType,
        nodeKey: spec.nodeKey || `${spec.type}:${spec.subType}`,
        title: nodeDefinition.title || spec.title,
        description: nodeDefinition.description || spec.description,
        config: normalizeConfig(nodeDefinition.config, spec.schema),
        position: { x, y: afterNode?.position?.y || 150 },
        layoutPinned: false,
        ...nodeUiFields(spec)
    };
    nodes.push(node);
    return node;
};

const findConnection = (edges, from, to) => edges.find(edge => connectionKey({
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle
}) === connectionKey({
    source: from.nodeId,
    sourceHandle: from.handle,
    target: to.nodeId,
    targetHandle: to.handle
}));

const connectNodes = ({ operation, edges, from, to, sourceNode, targetNode }) => {
    assertConnectionHandle(sourceNode, from.handle, 'outputs', operation);
    assertConnectionHandle(targetNode, to.handle, 'inputs', operation);
    if (findConnection(edges, from, to)) return;
    edges.push(connectionFor({ source: from.nodeId, sourceHandle: from.handle, target: to.nodeId, targetHandle: to.handle }));
};

/**
 * Insert a node after a known route without requiring the model to repeat the
 * destination edge. The compiler owns the fragile "find, replace, reconnect"
 * work, which makes a proposal resilient to generated edge IDs and ordering.
 */
const insertAfterRoute = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const from = normalizeEndpoint(operation.from, refs, operation.op, 'from');
    const sourceNode = nodes.find(node => node.id === from.nodeId);
    if (!sourceNode) throwEditError(operation.op, 'Route source references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    assertConnectionHandle(sourceNode, from.handle, 'outputs', operation.op);

    let matches = edges.filter(edge => edge.source === from.nodeId && (edge.sourceHandle || null) === from.handle);
    if (operation.beforeNodeRef) {
        const beforeNodeId = refs.get(operation.beforeNodeRef);
        if (!beforeNodeId) throwEditError(operation.op, `Unknown beforeNodeRef '${operation.beforeNodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
        matches = matches.filter(edge => edge.target === beforeNodeId);
    }
    if (matches.length === 0) {
        throwEditError(operation.op, 'The selected route has no connection to extend.', { code: 'WORKFLOW_ROUTE_NOT_FOUND' });
    }
    if (matches.length > 1) {
        throwEditError(operation.op, 'The selected route has multiple destinations. Identify which existing step should follow the new one.', { code: 'WORKFLOW_ROUTE_AMBIGUOUS' });
    }

    const match = matches[0];
    const to = { nodeId: match.target, handle: match.targetHandle || null };
    const targetNode = nodes.find(node => node.id === to.nodeId);
    if (!targetNode) throwEditError(operation.op, 'Route destination references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    const inserted = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: { ...operation.node, afterNodeRef: operation.node?.afterNodeRef || operation.from?.nodeRef },
        nodes,
        refs,
        specsByNodeKey
    });
    const insertedSpec = specsByNodeKey.get(nodeKeyFor(inserted));
    const inputHandles = (insertedSpec?.schema?.inputs || []).filter(input => input.isConnection);
    const outputHandles = (insertedSpec?.schema?.outputs || []).filter(output => output.isConnection);
    const inputHandle = operation.inputHandle || (inputHandles.length === 1 ? inputHandles[0].name : null);
    const outputHandle = operation.outputHandle || (outputHandles.length === 1 ? outputHandles[0].name : null);
    if (!inputHandle && inputHandles.length > 1) throwEditError(operation.op, 'insert_after_route requires an inputHandle when the node has multiple inputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
    if (!outputHandle && outputHandles.length > 1) throwEditError(operation.op, 'insert_after_route requires an outputHandle when the node has multiple outputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });

    edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
    const insertedId = refs.get(operation.node.ref);
    connectNodes({ operation: operation.op, edges, from, to: { nodeId: insertedId, handle: inputHandle }, sourceNode, targetNode: inserted });
    connectNodes({ operation: operation.op, edges, from: { nodeId: insertedId, handle: outputHandle }, to, sourceNode: inserted, targetNode });
};

export const compileWorkflowEdits = ({ currentWorkflow = {}, operations = [], specs = [], registry = NodeRegistry }) => {
    if (!Array.isArray(operations)) throwEditError('plan', 'Workflow edit plan must contain an operations array.', { code: 'WORKFLOW_EDIT_PLAN_INVALID' });
    if (operations.length > 50) throwEditError('plan', 'A workflow edit plan may contain at most 50 operations.', { code: 'WORKFLOW_EDIT_PLAN_TOO_LARGE' });
    const nodes = JSON.parse(JSON.stringify(currentWorkflow.nodes || []));
    const edges = JSON.parse(JSON.stringify(currentWorkflow.edges || []));
    const originalNodes = JSON.parse(JSON.stringify(nodes));
    const originalEdges = JSON.parse(JSON.stringify(edges));
    const specsByNodeKey = new Map(specs.map(spec => [spec.nodeKey || `${spec.type}:${spec.subType}`, spec]));
    const refs = new Map(currentWorkflow.nodes?.map((node, index) => [`n${index + 1}`, node.id]) || []);
    for (const operation of operations) {
        if (!operation || typeof operation.op !== 'string') throwEditError('plan', 'Every workflow edit requires an operation.', { code: 'WORKFLOW_EDIT_OPERATION_INVALID' });
        if (operation.op === 'create_node') {
            addNodeFromEdit({ operation: operation.op, nodeDefinition: operation.node, nodes, refs, specsByNodeKey });
        } else if (operation.op === 'remove_node') {
            const nodeId = refs.get(operation.nodeRef);
            if (!nodeId) throwEditError(operation.op, `Unknown nodeRef '${operation.nodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
            nodes.splice(0, nodes.length, ...nodes.filter(node => node.id !== nodeId));
            edges.splice(0, edges.length, ...edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
            refs.delete(operation.nodeRef);
        } else if (operation.op === 'update_node') {
            const nodeId = refs.get(operation.nodeRef);
            const index = nodes.findIndex(node => node.id === nodeId);
            if (index === -1) throwEditError(operation.op, `Unknown nodeRef '${operation.nodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
            const updates = operation.updates || {};
            if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
                throwEditError(operation.op, 'update_node requires an updates object.', { code: 'WORKFLOW_EDIT_UPDATES_INVALID' });
            }
            nodes[index] = {
                ...nodes[index],
                ...Object.fromEntries(Object.entries(updates).filter(([key]) => !['id', 'type', 'subType', 'nodeKey', 'schema', 'position', 'layoutPinned'].includes(key))),
                config: updates.config ? { ...(nodes[index].config || {}), ...updates.config } : nodes[index].config
            };
        } else if (operation.op === 'connect' || operation.op === 'disconnect') {
            const from = normalizeEndpoint(operation.from, refs, operation.op, 'from');
            const to = normalizeEndpoint(operation.to, refs, operation.op, 'to');
            const sourceNode = nodes.find(node => node.id === from.nodeId);
            const targetNode = nodes.find(node => node.id === to.nodeId);
            if (!sourceNode || !targetNode) throwEditError(operation.op, 'Connection references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
            if (operation.op === 'connect') {
                connectNodes({ operation: operation.op, edges, from, to, sourceNode, targetNode });
            } else {
                const match = findConnection(edges, from, to);
                if (!match) throwEditError(operation.op, 'The requested connection does not exist.', { code: 'WORKFLOW_CONNECTION_NOT_FOUND' });
                edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
            }
        } else if (operation.op === 'insert_between') {
            const from = normalizeEndpoint(operation.connection?.from, refs, operation.op, 'connection.from');
            const to = normalizeEndpoint(operation.connection?.to, refs, operation.op, 'connection.to');
            const match = findConnection(edges, from, to);
            if (!match) throwEditError(operation.op, 'The requested connection does not exist.', { code: 'WORKFLOW_CONNECTION_NOT_FOUND' });
            const inserted = addNodeFromEdit({ operation: operation.op, nodeDefinition: operation.node, nodes, refs, specsByNodeKey });
            const insertedSpec = specsByNodeKey.get(nodeKeyFor(inserted));
            const inputHandles = (insertedSpec?.schema?.inputs || []).filter(input => input.isConnection);
            const outputHandles = (insertedSpec?.schema?.outputs || []).filter(output => output.isConnection);
            const inputHandle = operation.inputHandle || (inputHandles.length === 1 ? inputHandles[0].name : null);
            const outputHandle = operation.outputHandle || (outputHandles.length === 1 ? outputHandles[0].name : null);
            if (!inputHandle && inputHandles.length > 1) {
                throwEditError(operation.op, 'insert_between requires an inputHandle when the node has multiple inputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
            }
            if (!outputHandle && outputHandles.length > 1) {
                throwEditError(operation.op, 'insert_between requires an outputHandle when the node has multiple outputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
            }
            edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
            const insertedRef = operation.node.ref;
            const insertedEndpoint = { nodeId: refs.get(insertedRef), handle: inputHandle };
            connectNodes({ operation: operation.op, edges, from, to: insertedEndpoint, sourceNode: nodes.find(node => node.id === from.nodeId), targetNode: inserted });
            connectNodes({ operation: operation.op, edges, from: { nodeId: refs.get(insertedRef), handle: outputHandle }, to, sourceNode: inserted, targetNode: nodes.find(node => node.id === to.nodeId) });
        } else if (operation.op === 'insert_after_route') {
            insertAfterRoute({ operation, nodes, edges, refs, specsByNodeKey });
        } else {
            throwEditError(operation.op, `Unsupported workflow edit operation '${operation.op}'.`, { code: 'WORKFLOW_EDIT_OPERATION_INVALID' });
        }
    }
    nodes.splice(0, nodes.length, ...layoutWorkflow({ nodes, edges, mode: 'respect-pins' }));
    const validation = assertWorkflowDefinition(nodes, edges, Boolean(currentWorkflow.isActive), registry, true);
    if (!validation.valid && validation.issues?.length) {
        throwEditError('validate', 'The edit plan produced an invalid workflow graph. Review the node refs and connection handles.', { code: 'WORKFLOW_EDIT_GRAPH_INVALID' });
    }
    return { nodes, edges, originalNodes, originalEdges, refs };
};
