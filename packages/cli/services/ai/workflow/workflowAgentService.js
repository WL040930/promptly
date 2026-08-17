import nodeResourceService from '../../nodes/nodeResourceService.js';
import { normalizeNodeInputOptions, normalizeNodeResourceValue, resolveNodeResourceParams } from '../../../../shared/nodeConfigContract.js';
import { compileWorkflowBindings, formFieldReferenceExpression, isWorkflowExpression, validateWorkflowExpressions } from '../../../../shared/workflowExpressions.js';


const resourceVariantKey = params => JSON.stringify(Object.fromEntries(Object.entries(params || {}).sort(([left], [right]) => left.localeCompare(right))));

const resourceRequestsFor = (specs, nodes = [], selections = {}) => {
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
                const schemaOptions = normalizeNodeInputOptions(dependency, {}).filter(option => !option.disabled && option.value !== '').map(option => String(option.value));
                const existingValues = (nodes || []).filter(node => (node.nodeKey || `${node.type}:${node.subType}`) === spec.nodeKey)
                    .map(node => node.config?.[binding.slice(1)]).filter(value => typeof value === 'string' && value);
                const selectedValue = selections?.[dependency?.resource];
                const options = [...new Set([...schemaOptions, ...existingValues, ...(selectedValue ? [selectedValue] : [])])];
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

export const loadWorkflowResource = async ({ userId, resource, params = {}, resourceService = nodeResourceService } = {}) => resourceService.list({ userId, resource, params });

export const loadWorkflowResourceContext = async ({ userId, specs = [], nodes = [], selections = {}, resourceService = nodeResourceService } = {}) => {
    if (!userId) return {};
    const context = {};
    for (const { resource, params } of resourceRequestsFor(specs, nodes, selections)) {
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

const provisionedSpreadsheetChangeFor = (reference, resourceChanges = []) => (resourceChanges || []).find(change => (
    change?.type === 'create_google_spreadsheet' && change.ref === reference
));

const rangeForProvisionedSpreadsheet = change => {
    const sheetTitle = String(change?.sheetTitle || 'Responses').replaceAll("'", "''");
    return `'${sheetTitle}'!A1`;
};

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
            const provisionedDependency = Object.values(input.resourceParams || {})
                .map(binding => (typeof binding === 'string' && binding.startsWith('$') ? node.config?.[binding.slice(1)] : null))
                .find(isProvisionedResourceReference);
            const expressionDependency = Object.values(input.resourceParams || {})
                .map(binding => (typeof binding === 'string' && binding.startsWith('$') ? node.config?.[binding.slice(1)] : null))
                .find(isWorkflowExpression);
            if (provisionedDependency && input.resource === 'google-sheet-ranges') {
                const change = provisionedSpreadsheetChangeFor(provisionedDependency.$provision, resourceChanges);
                if (!change) {
                    issues.push({
                        code: 'WORKFLOW_PROVISION_REFERENCE_INVALID',
                        path: `nodes[${nodeIndex}].config.${input.name}`,
                        message: `${input.label || input.name} depends on a proposed spreadsheet that does not exist.`
                    });
                    return;
                }
                const expectedRange = rangeForProvisionedSpreadsheet(change);
                if (node.config[input.name] !== expectedRange) {
                    node.config[input.name] = expectedRange;
                    repairs.push({
                        code: 'WORKFLOW_PROVISIONED_SHEET_RANGE_RESOLVED',
                        nodeId: node.id,
                        field: input.name,
                        resourceRef: provisionedDependency.$provision,
                        range: expectedRange
                    });
                }
                return;
            }
            if (value === undefined || value === null || value === '') return;
            // A preceding runtime node may create the spreadsheet during this
            // execution. Its canonical expression is not an account resource
            // and must not be rejected as an invented ID.
            if (isWorkflowExpression(value)) return;
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
            if (provisionedDependency || expressionDependency) return;
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
    if (applicationReviewPattern.test(text) && /\b(form|submission|response|applicant|candidate|workflow|automation|email|message|notification|save|send)\b/i.test(text)) {
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
    const wantsOwnerApproval = requiredCapabilities.includes('owner_approval');
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

    bindingIssues.push(...validateWorkflowExpressions({ nodes: nextNodes, edges: nextEdges, formSchema }));
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
    const wantsOwnerApproval = requiredCapabilities.includes('owner_approval');
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
    }

    return issues;
};
