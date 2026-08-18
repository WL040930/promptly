import NodeRegistry from '../../../../utils/NodeRegistry.js';
import { CLARIFICATION_MODES, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { validateWorkflow } from '../../../engine/workflowValidator.js';
import { recordAiDiagnostic } from '../../core/diagnosticsLogger.js';
import {
    compileWorkflowDraft,
    loadWorkflowResource,
    loadWorkflowResourceContext,
    normalizeGeneratedResourceValues,
    validateGeneratedResourceValues,
    validateGeneratedWorkflowCapabilities,
    requiredCapabilitiesForRequest,
    resolveRespondentEmailField
} from '../workflowAgentService.js';
import { buildWorkflowEditView, compileWorkflowEdits } from '../domain/editCompiler/index.js';
import { explicitRunIdFromRequest } from '../runDiagnostics.js';
import { applyFormResponseSpreadsheetContract } from '../formSpreadsheetContract.js';
import { discoverResource } from '../resourceDiscovery.js';
import {
    isExplicitPerSubmissionSpreadsheetRequest,
    resolveSpreadsheetIntent
} from '../domain/workflowSpreadsheetIntent.js';
import {
    fieldBindingKey,
    formPrerequisiteDecision,
    isFormSubmissionRequest,
    validateSummaryWorkflowContract
} from '../domain/workflowPrerequisites.js';
import {
    resolveGoogleFormResponseSource,
    resolveGoogleSheetRowSource
} from '../domain/resourceResolution.js';
import { assembleLinearWorkflow } from '../domain/linearWorkflowAssembler.js';
import { normalizeSemanticWorkflowOperations } from '../domain/semanticOperationNormalizer.js';
import {
    defaultSpreadsheetTitle,
    isInstructionLikeSpreadsheetTitle,
    normalizeSpreadsheetTitle
} from '../domain/spreadsheetTitle.js';
import {
    FORM_RESPONSE_SHEET_DESTINATIONS,
    resolveFormResponseSheetDestination,
    validateFormResponseSheetDestination
} from '../domain/formResponseSheetDestination.js';
import { normalizeWorkflowReferences, validateWorkflowExpressions } from '../../../../../shared/workflowExpressions.js';
import {
    buildWorkflowOutputRepairContext,
    buildWorkflowPlannerContext,
    buildWorkflowVerifierContext,
    buildWorkflowWorkerContext
} from '../context/workflowContext.js';
import {
    normalizeWorkflowPlannerResult,
    validateWorkflowPlannerResult,
    validateWorkflowVerifierResult,
    validateWorkflowWorkerResult
} from '../domain/workflowOutputValidator.js';
import { requestWorkflowJson, workflowOutputIssues } from '../provider/request.js';
import { DEFAULT_AI_PROVIDER_ATTEMPTS } from '../../core/taskPolicies.js';
import {
    workflowPlannerInstruction,
    workflowVerifierInstruction,
    workflowWorkerInstruction
} from '../shared/instructions.js';
import { addWorkflowUsage } from '../shared/usage.js';

// A workflow turn should yield a reviewable outcome quickly. Deterministic
// compiler fixes do not consume this budget; only model calls do.
// Reserve two planner requests (initial + repair), then one worker and one
// verifier request for each draft attempt. Every request can use all four
// provider routes before the turn is considered unavailable.
const WORKFLOW_PLANNER_REQUESTS = 2;
const WORKFLOW_DRAFT_REQUESTS = 2;
const workflowProviderCallBudget = buildAttempts => DEFAULT_AI_PROVIDER_ATTEMPTS * (
    WORKFLOW_PLANNER_REQUESTS + (WORKFLOW_DRAFT_REQUESTS * buildAttempts)
);

const WORKFLOW_COMPLEXITY_BUDGETS = Object.freeze({
    simple: Object.freeze({ id: 'simple', label: 'Simple workflow', providerAttempts: DEFAULT_AI_PROVIDER_ATTEMPTS, buildAttempts: 2, maxProviderCalls: workflowProviderCallBudget(2) }),
    standard: Object.freeze({ id: 'standard', label: 'Standard workflow', providerAttempts: DEFAULT_AI_PROVIDER_ATTEMPTS, buildAttempts: 3, maxProviderCalls: workflowProviderCallBudget(3) }),
    complex: Object.freeze({ id: 'complex', label: 'Complex workflow', providerAttempts: DEFAULT_AI_PROVIDER_ATTEMPTS, buildAttempts: 4, maxProviderCalls: workflowProviderCallBudget(4) })
});

const workflowComplexityFor = ({ workflow = {}, plan = {}, formSchema = null }) => {
    const selectedNodeKeys = plan.selectedNodeKeys || [];
    const requirements = plan.requirements || [];
    const hasForm = Boolean(formSchema) || selectedNodeKeys.includes('trigger:form-submission');
    const hasResources = (plan.resourceChanges || []).length > 0;
    const hasBranching = selectedNodeKeys.some(key => /(?:approval|branch|condition|switch|router)/i.test(key))
        || (plan.capabilities || []).some(capability => /(?:approval|branch|condition|routing)/i.test(capability));
    const graphSize = (workflow.nodes || []).length;
    const deterministicFormResponseSheet = plan.type === 'plan_complete'
        && hasForm
        && Array.isArray(plan.linearSteps)
        && plan.linearSteps.length >= 2
        && plan.linearSteps.length <= 3
        && plan.linearSteps.every(step => ['trigger:form-submission', 'action:googleSheets'].includes(step?.nodeKey))
        && selectedNodeKeys.every(key => ['trigger:form-submission', 'action:googleSheets'].includes(key))
        && !selectedNodeKeys.includes('action:googleSheetsCreate')
        && !((plan.capabilities || []).includes('per_submission_spreadsheet'))
        && !hasBranching;
    if (deterministicFormResponseSheet) return WORKFLOW_COMPLEXITY_BUDGETS.simple;
    if (hasResources || hasBranching || (hasForm && selectedNodeKeys.length >= 2)) return WORKFLOW_COMPLEXITY_BUDGETS.complex;
    const score =
        (selectedNodeKeys.length >= 3 ? 1 : 0)
        + (requirements.length >= 3 ? 1 : 0)
        + (graphSize >= 4 ? 2 : 0)
        + (hasForm ? 2 : 0)
        + (hasResources ? 2 : 0)
        + (hasBranching ? 2 : 0);
    if (score >= 4) return WORKFLOW_COMPLEXITY_BUDGETS.complex;
    if (score >= 2) return WORKFLOW_COMPLEXITY_BUDGETS.standard;
    return WORKFLOW_COMPLEXITY_BUDGETS.simple;
};

const workflowRenameFromRequest = request => {
    const text = String(request || '').trim();
    const match = text.match(/^(?:please\s+)?(?:rename|change)\s+(?:this\s+|the\s+)?(?:workflow|automation)(?:\s+name)?\s+to\s+["“]?(.+?)["”]?\s*[.!?]?$/i);
    if (!match) return null;
    const name = String(match[1] || '').trim().replace(/\s+/g, ' ');
    return name && name.length <= 255 ? name : null;
};

const conditionalBranchRequestPattern = /\bif\b[\s\S]{0,320}\b(?:otherwise|else|if\s+not)\b/i;
const notificationActionPattern = /\b(?:send|email|notify|message)\b/i;
const switchRouteRequestPattern = /\b(?:switch|router|routing)\b[\s\S]{0,200}\b(?:case|cases|default|otherwise|route)\b/i;
const errorHandlerRequestPattern = /\b(?:catch|handle)\s+(?:an?\s+)?(?:error|failure)\b|\b(?:on|if|when)\s+(?:an?\s+)?(?:error|failure|failure occurs|step fails)\b/i;
const branchJoinRequestPattern = /\b(?:join|merge|combine)\s+(?:the\s+)?(?:branches|paths|routes)\b/i;
const isConditionalBranchRequest = request => conditionalBranchRequestPattern.test(String(request || ''));
const isConditionalNotificationRequest = request => isConditionalBranchRequest(request)
    && notificationActionPattern.test(String(request || ''));
const isSwitchRouteRequest = request => switchRouteRequestPattern.test(String(request || ''));
const isErrorHandlerRequest = request => errorHandlerRequestPattern.test(String(request || ''));
const isBranchJoinRequest = request => branchJoinRequestPattern.test(String(request || ''));

const workflowRenameProposal = ({ workflow, name, usage = {} }) => {
    if (name === String(workflow?.name || '').trim()) {
        return {
            type: 'reply',
            message: `This workflow is already named “${name}”.`,
            tokenUsage: { ...usage, requestCalls: usage.requestCalls || 0 }
        };
    }
    const diff = {
        addedNodes: [],
        updatedNodes: [],
        removedNodes: [],
        edges: [],
        metadata: { name: { from: workflow?.name || '', to: name } }
    };
    return {
        type: 'proposal',
        message: `Rename this workflow to “${name}”.`,
        requirements: [{ id: 'req_rename_workflow', description: `Rename the workflow to “${name}”.` }],
        capabilities: [],
        operations: [{ op: 'update_workflow', updates: { name } }],
        workflowUpdates: { name },
        nodes: workflow?.nodes || [],
        edges: workflow?.edges || [],
        diff,
        plan: [{ title: `Rename workflow to ${name}` }],
        readiness: { ready: true, status: 'ready', canApply: true, issues: [], setupActions: [] },
        verification: { status: 'pass', issues: [], fulfilledRequirements: ['req_rename_workflow'] },
        warnings: [],
        resourceChanges: [],
        tokenUsage: { ...usage, requestCalls: usage.requestCalls || 0 },
        contextDelta: null,
        diagnosis: null
    };
};

export const workflowPipelineInternals = Object.freeze({
    WORKFLOW_COMPLEXITY_BUDGETS,
    workflowComplexityFor,
    workflowRenameFromRequest,
    isConditionalBranchRequest,
    isConditionalNotificationRequest,
    isSwitchRouteRequest,
    isErrorHandlerRequest,
    isBranchJoinRequest
});

const mergeRepairIssues = (first = [], latest = []) => {
    const seen = new Set();
    return [...first, ...latest].filter(item => {
        const key = JSON.stringify([item?.code || '', item?.path || '', item?.value || '', item?.message || '']);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const createPipelineError = (message, code, issues = []) => {
    const error = new Error(message);
    error.code = code;
    error.issues = issues;
    return error;
};

// Resource lookups are user-facing outcomes, not planner failures. Preserve
// their stable error metadata so the assistant can render the right recovery
// action (for example, a direct Google connection button) instead of reducing
// everything to an un-actionable reply string.
const resourceErrorReply = (error, tokenUsage, fallbackMessage = 'The account resource could not be loaded right now.') => {
    const code = String(error?.code || 'WORKFLOW_RESOURCE_UNAVAILABLE');
    const message = String(error?.message || fallbackMessage);
    return {
        type: 'reply',
        message,
        errorMetadata: {
            code,
            issues: [{ code, message }],
            ...(error?.action ? { action: error.action } : {})
        },
        tokenUsage
    };
};

const unique = values => [...new Set(values.filter(Boolean))];
const nodeKeyFor = node => node?.nodeKey || (node?.type && node?.subType ? `${node.type}:${node.subType}` : null);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Rejection is optional: without a rejection action the run simply ends.
// Some providers emit an empty object for an omitted optional object field;
// normalize only that exact harmless shape. Any meaningful but incomplete
// rejection action remains visible to strict validation.
const normalizeWorkflowOperations = ({ operations = [], knownNodeKeys = [] } = {}) => {
    const semantic = normalizeSemanticWorkflowOperations({ operations, knownNodeKeys });
    return {
        ...semantic,
        operations: semantic.operations.map(operation => {
            if (operation?.op !== 'add_approval_gate' || !Object.hasOwn(operation, 'whenRejected')) return operation;
            const rejected = operation.whenRejected;
            if (rejected !== null && !(isObject(rejected) && Object.keys(rejected).length === 0)) return operation;
            const { whenRejected: _whenRejected, ...normalized } = operation;
            return normalized;
        })
    };
};

const withTrustedFormResource = (resourceContext, formSchema) => {
    if (!formSchema?.id) return resourceContext || {};
    const context = resourceContext || {};
    const forms = context.forms || { resource: 'forms', options: [] };
    const options = Array.isArray(forms.options) ? forms.options : [];
    if (options.some(option => option?.value === formSchema.id) && !forms.error) return context;
    return {
        ...context,
        forms: {
            ...forms,
            resource: forms.resource || 'forms',
            // The selected form has already been loaded through an
            // ownership-checked server path, so it remains trusted even if a
            // broad resource listing is temporarily unavailable.
            error: null,
            options: [...options, { value: formSchema.id, label: formSchema.title || 'Selected form' }]
        }
    };
};

const configuredSpreadsheetBindings = spreadsheetIntent => spreadsheetIntent?.source === 'current_workflow'
    ? spreadsheetIntent.mode === 'workflow_configured'
        ? spreadsheetIntent.bindings || []
        : [{
            spreadsheetId: spreadsheetIntent.spreadsheetId,
            name: spreadsheetIntent.name || null,
            range: spreadsheetIntent.range || null
        }]
    : [];

const withTrustedConfiguredSpreadsheetResources = (resourceContext, spreadsheetIntent) => {
    const bindings = configuredSpreadsheetBindings(spreadsheetIntent).filter(binding => binding?.spreadsheetId);
    if (bindings.length === 0) return resourceContext || {};

    const context = resourceContext || {};
    const spreadsheets = context['google-spreadsheets'] || { resource: 'google-spreadsheets', options: [] };
    const spreadsheetOptions = Array.isArray(spreadsheets.options) ? spreadsheets.options : [];
    const ranges = context['google-sheet-ranges'] || { resource: 'google-sheet-ranges', options: [], variants: {} };
    const variants = { ...(ranges.variants || {}) };

    for (const binding of bindings) {
        if (!spreadsheetOptions.some(option => String(option?.value) === String(binding.spreadsheetId))) {
            spreadsheetOptions.push({ value: binding.spreadsheetId, label: binding.name || 'Configured Google Sheet' });
        }
        if (!binding.range) continue;
        const key = JSON.stringify({ spreadsheetId: binding.spreadsheetId });
        const variant = variants[key] || { resource: 'google-sheet-ranges', params: { spreadsheetId: binding.spreadsheetId }, options: [] };
        const options = Array.isArray(variant.options) ? variant.options : [];
        if (!options.some(option => String(option?.value) === binding.range)) {
            options.push({ value: binding.range, label: binding.range });
        }
        variants[key] = { ...variant, error: null, options };
    }

    return {
        ...context,
        'google-spreadsheets': {
            ...spreadsheets,
            resource: spreadsheets.resource || 'google-spreadsheets',
            // The ID came from an already-applied workflow node. A later edit
            // may safely preserve it even if a broad account listing is down.
            error: null,
            options: spreadsheetOptions
        },
        'google-sheet-ranges': {
            ...ranges,
            resource: ranges.resource || 'google-sheet-ranges',
            error: null,
            variants
        }
    };
};

const enabledCatalogue = registry => (registry.getCompactCatalogue() || []).filter(node => !['disabled', 'coming_soon', 'retired', 'hidden'].includes(node?.implementationStatus));

const plannerNodeKeyIssues = (result, catalogue) => {
    const issues = validateWorkflowPlannerResult(result);
    if (!isObject(result) || !['direct_plan', 'plan_complete'].includes(result.type)) return issues;
    const allowed = catalogue.map(node => node.nodeKey).filter(Boolean).sort();
    const known = new Set(allowed);
    const validateNodeKey = (key, path) => {
        if (typeof key === 'string' && key && !known.has(key)) {
            issues.push({
                code: 'WORKFLOW_NODE_KEY_INVALID',
                path,
                value: key,
                allowed,
                message: `Unknown nodeKey '${key}'. Choose an exact nodeKey from the available catalogue.`
            });
        }
    };
    if (Array.isArray(result.selectedNodeKeys)) {
        result.selectedNodeKeys.forEach((key, index) => validateNodeKey(key, `selectedNodeKeys[${index}]`));
    }
    if (Array.isArray(result.linearSteps)) {
        result.linearSteps.forEach((step, index) => validateNodeKey(step?.nodeKey, `linearSteps[${index}].nodeKey`));
    }
    return issues;
};

const spreadsheetRequestPattern = /\b(?:save|store|record|write|append|add)\b[\s\S]{0,120}\b(?:excel|spreadsheets?|google\s*sheets?|sheets?)\b|\b(?:excel|spreadsheets?|google\s*sheets?)\b[\s\S]{0,120}\b(?:save|store|record|write|append|add)\b/i;
const explicitSpreadsheetIdPattern = /(?:docs\.google\.com\/spreadsheets\/d\/|\b[a-zA-Z0-9_-]{20,200}\b)/;
const normalizeSpreadsheetResourceChanges = ({ plan, request, workflow, formSchema, spreadsheetIntent }) => {
    if (!Array.isArray(plan?.resourceChanges)) return plan;
    const fallbackTitle = defaultSpreadsheetTitle({ workflow, formSchema, request });
    return {
        ...plan,
        resourceChanges: plan.resourceChanges.map(change => {
            if (change?.type !== 'create_google_spreadsheet') return change;
            const requestedTitle = spreadsheetIntent?.mode === 'create' && spreadsheetIntent.name
                ? spreadsheetIntent.name
                : change.title;
            return {
                ...change,
                title: requestedTitle && !isInstructionLikeSpreadsheetTitle(requestedTitle)
                    ? normalizeSpreadsheetTitle(requestedTitle)
                    : fallbackTitle
            };
        })
    };
};

const normalizeOneTimeSpreadsheetPlan = ({ plan, request, spreadsheetIntent }) => {
    if (spreadsheetIntent?.mode !== 'create' || isExplicitPerSubmissionSpreadsheetRequest(request)) return plan;
    const summaryNeedsRepair = isExplicitPerSubmissionSpreadsheetRequest(plan?.summary);
    const requirements = (plan.requirements || []).map(requirement => isExplicitPerSubmissionSpreadsheetRequest(requirement?.description)
        ? {
            ...requirement,
            description: 'Append each submitted form response to the one Google Sheet provisioned when this workflow is applied.'
        }
        : requirement);
    return {
        ...plan,
        ...(summaryNeedsRepair ? { summary: 'Save submitted form responses to the new Google Sheet.' } : {}),
        requirements
    };
};

/**
 * A destination omitted from a request to save form data is a safe default:
 * propose a new Sheet. It remains a proposal until the user clicks Apply.
 */
const addDefaultSpreadsheetIntent = ({ plan, request, workflow, formSchema, spreadsheetIntent = null }) => {
    plan = normalizeOneTimeSpreadsheetPlan({ plan, request, spreadsheetIntent });
    plan = normalizeSpreadsheetResourceChanges({ plan, request, workflow, formSchema, spreadsheetIntent });
    if (!['direct_plan', 'plan_complete'].includes(plan?.type)) return plan;
    if (['existing_named', 'existing_selected', 'requires_existing'].includes(spreadsheetIntent?.mode)) {
        return {
            ...plan,
            resourceChanges: (plan.resourceChanges || []).filter(change => change?.type !== 'create_google_spreadsheet')
        };
    }
    if (spreadsheetIntent?.mode !== 'create' && !spreadsheetRequestPattern.test(String(request || ''))) return plan;
    if (isExplicitPerSubmissionSpreadsheetRequest(request)) {
        const requirements = [...(plan.requirements || [])];
        if (!requirements.some(requirement => /(?:create|new).*(?:sheet|spreadsheet).*(?:each|every|per).*(?:submission|response)|(?:each|every|per).*(?:submission|response).*?(?:create|new).*(?:sheet|spreadsheet)/i.test(requirement?.description || ''))) {
            requirements.push({
                id: 'req_per_submission_spreadsheet',
                description: 'After approval, create one new Google spreadsheet for this submission, initialize a Responses tab, then append the approved form response to it.'
            });
        }
        return {
            ...plan,
            type: 'plan_complete',
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'action:googleSheetsCreate', 'action:googleSheets']),
            capabilities: unique([...(plan.capabilities || []), 'per_submission_spreadsheet']),
            requirements,
            // A resource change is provisioned once when the proposal is applied.
            // Per-submission sheets must instead be created by the runtime node.
            resourceChanges: (plan.resourceChanges || []).filter(change => change?.type !== 'create_google_spreadsheet')
        };
    }
    if (explicitSpreadsheetIdPattern.test(String(request || ''))) return plan;
    if ((plan.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet')) return plan;
    const requirements = [...(plan.requirements || [])];
    if (!requirements.some(requirement => /(?:google\s*sheets?|spreadsheets?|excel)/i.test(requirement?.description || ''))) {
        requirements.push({
            id: 'req_response_spreadsheet',
            description: 'Append the submitted form response to a new Google Sheet before the next approved-route action.'
        });
    }
    return {
        ...plan,
        type: 'plan_complete',
        selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'action:googleSheets']),
        requirements,
        resourceChanges: [{
            ref: 'response_spreadsheet',
            type: 'create_google_spreadsheet',
            title: spreadsheetIntent?.mode === 'create' && spreadsheetIntent.name
                ? (!isInstructionLikeSpreadsheetTitle(spreadsheetIntent.name)
                    ? normalizeSpreadsheetTitle(spreadsheetIntent.name)
                    : defaultSpreadsheetTitle({ workflow, formSchema, request }))
                : defaultSpreadsheetTitle({ workflow, formSchema, request }),
            sheetTitle: 'Responses'
        }]
    };
};

const isExistingSpreadsheetIntent = intent => ['existing_named', 'existing_selected'].includes(intent?.mode);

const removeRuntimeSpreadsheetCreatorFromPlan = plan => ({
    ...plan,
    selectedNodeKeys: (plan.selectedNodeKeys || []).filter(key => key !== 'action:googleSheetsCreate'),
    capabilities: (plan.capabilities || []).filter(capability => capability !== 'per_submission_spreadsheet'),
    linearSteps: (plan.linearSteps || []).filter(step => step?.nodeKey !== 'action:googleSheetsCreate')
});

/**
 * A form response has exactly one Sheet destination mode. The planner may
 * suggest an extra node, but the server owns the final mode so a one-time
 * provision can never become a per-submission sheet creator by accident.
 */
const applyFormResponseSheetDestinationToPlan = ({
    plan,
    spreadsheetIntent,
    formSchema,
    perSubmissionRequested
}) => {
    if (!['direct_plan', 'plan_complete'].includes(plan?.type)) return plan;
    const destination = resolveFormResponseSheetDestination({
        resourceChanges: plan.resourceChanges || [],
        spreadsheetIntent,
        capabilities: plan.capabilities || [],
        perSubmissionRequested,
        formSchema
    });
    if (destination === FORM_RESPONSE_SHEET_DESTINATIONS.existing) {
        return {
            ...removeRuntimeSpreadsheetCreatorFromPlan(plan),
            resourceChanges: (plan.resourceChanges || []).filter(change => change?.type !== 'create_google_spreadsheet')
        };
    }
    if (destination === FORM_RESPONSE_SHEET_DESTINATIONS.provisionOnce) {
        return removeRuntimeSpreadsheetCreatorFromPlan(plan);
    }
    if (destination === FORM_RESPONSE_SHEET_DESTINATIONS.perSubmission) {
        return {
            ...plan,
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'action:googleSheetsCreate', 'action:googleSheets']),
            capabilities: unique([...(plan.capabilities || []), 'per_submission_spreadsheet']),
            resourceChanges: (plan.resourceChanges || []).filter(change => change?.type !== 'create_google_spreadsheet')
        };
    }
    return plan;
};

const selectedSpreadsheetRange = ({ resourceContext = {}, spreadsheetId } = {}) => {
    if (!spreadsheetId) return null;
    const entry = resourceContext?.['google-sheet-ranges'];
    const key = JSON.stringify({ spreadsheetId });
    const variant = entry?.variants?.[key] || entry;
    return variant?.options?.find(option => option?.value)?.value || null;
};

const needsDefaultSelectedRange = ({ range, spreadsheetIntent }) => !range
    || (spreadsheetIntent?.replacesProvisioning === true && /^'Responses'!A1$/i.test(String(range)));

const selectedSpreadsheetConfig = ({ config = {}, spreadsheetIntent, range = null }) => {
    if (!isExistingSpreadsheetIntent(spreadsheetIntent) || !spreadsheetIntent.spreadsheetId) return config;
    return {
        ...config,
        operation: 'append',
        spreadsheetId: spreadsheetIntent.spreadsheetId,
        ...(range && needsDefaultSelectedRange({ range: config.range, spreadsheetIntent }) ? { range } : {})
    };
};

const applySelectedSpreadsheetToLinearSteps = ({ plan, spreadsheetIntent, range }) => {
    if (!isExistingSpreadsheetIntent(spreadsheetIntent)) return plan;
    return {
        ...plan,
        linearSteps: (plan.linearSteps || []).map(step => step?.nodeKey === 'action:googleSheets'
            ? { ...step, config: selectedSpreadsheetConfig({ config: step.config || {}, spreadsheetIntent, range }) }
            : step)
    };
};

const applySelectedSpreadsheetToOperations = ({ operations = [], workflow, spreadsheetIntent, range }) => {
    if (!isExistingSpreadsheetIntent(spreadsheetIntent) || !Array.isArray(operations)) return operations;
    const existingSheetRefs = new Set(buildWorkflowEditView(workflow).nodes
        .filter(node => node?.nodeKey === 'action:googleSheets')
        .map(node => node.ref));
    const configureNode = node => node?.nodeKey === 'action:googleSheets'
        ? { ...node, config: selectedSpreadsheetConfig({ config: node.config || {}, spreadsheetIntent, range }) }
        : node;
    return operations.map(operation => {
        if (['create_node', 'insert_between', 'insert_after_route'].includes(operation?.op)) {
            return { ...operation, node: configureNode(operation.node) };
        }
        if (operation?.op === 'add_condition_branch') {
            return {
                ...operation,
                whenTrue: configureNode(operation.whenTrue),
                whenFalse: configureNode(operation.whenFalse)
            };
        }
        if (operation?.op === 'add_switch_routes') {
            return {
                ...operation,
                cases: (operation.cases || []).map(routeCase => ({ ...routeCase, action: configureNode(routeCase?.action) })),
                otherwise: configureNode(operation.otherwise)
            };
        }
        if (operation?.op === 'add_error_handler') {
            return { ...operation, whenError: configureNode(operation.whenError) };
        }
        if (operation?.op === 'add_approval_gate') {
            return {
                ...operation,
                whenApproved: configureNode(operation.whenApproved),
                whenRejected: configureNode(operation.whenRejected)
            };
        }
        if (operation?.op === 'join_branches') {
            return { ...operation, continueWith: configureNode(operation.continueWith) };
        }
        if (operation?.op === 'update_node' && existingSheetRefs.has(operation.nodeRef)) {
            return {
                ...operation,
                updates: {
                    ...(operation.updates || {}),
                    config: selectedSpreadsheetConfig({ config: operation.updates?.config || {}, spreadsheetIntent, range })
                }
            };
        }
        return operation;
    });
};

const googleSheetsRowSourceConfig = source => ({
    spreadsheetId: source.spreadsheetId,
    range: source.range,
    baselineMode: 'ignore-existing'
});

const configureGoogleSheetsRowSourceNode = (node, source) => node?.nodeKey === 'trigger:googleSheets'
    ? { ...node, config: { ...(node.config || {}), ...googleSheetsRowSourceConfig(source) } }
    : node;

const applyGoogleSheetsRowSourceToLinearSteps = ({ plan, source }) => {
    if (!source) return plan;
    return {
        ...plan,
        selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'trigger:googleSheets']),
        linearSteps: (plan.linearSteps || []).map(step => step?.nodeKey === 'trigger:googleSheets'
            ? { ...step, config: { ...(step.config || {}), ...googleSheetsRowSourceConfig(source) } }
            : step)
    };
};

const applyGoogleSheetsRowSourceToOperations = ({ operations = [], workflow, source }) => {
    if (!source || !Array.isArray(operations)) return operations;
    const triggerRefs = new Set(buildWorkflowEditView(workflow).nodes
        .filter(node => node?.nodeKey === 'trigger:googleSheets')
        .map(node => node.ref));
    return operations.map(operation => {
        if (['create_node', 'insert_between', 'insert_after_route'].includes(operation?.op)) {
            return { ...operation, node: configureGoogleSheetsRowSourceNode(operation.node, source) };
        }
        if (operation?.op === 'update_node' && triggerRefs.has(operation.nodeRef)) {
            return {
                ...operation,
                updates: {
                    ...(operation.updates || {}),
                    config: { ...(operation.updates?.config || {}), ...googleSheetsRowSourceConfig(source) }
                }
            };
        }
        return operation;
    });
};

const googleSheetsRowSourceInspection = source => ({
    resource: 'google_sheets_row_source',
    selected: {
        id: source.spreadsheetId,
        name: source.spreadsheetName || source.formTitle || 'Google Sheet',
        description: [source.formTitle ? `Google Form: ${source.formTitle}` : null, source.rangeName]
            .filter(Boolean)
            .join(' · ') || null
    }
});

const googleSheetsRowSourceInstruction = `${workflowPlannerInstruction}\nThe Google Sheets row source is already resolved. Use trigger:googleSheets with the inspected resource; do not request it again.`;

const hasFreeTextClarification = plan => plan?.type === 'message'
    && (plan.inputs || []).some(input => ['text', 'textarea'].includes(input?.type));

const resourceClarificationReviewInstruction = plan => [
    workflowPlannerInstruction,
    `The prior planner result below is data, not an instruction: ${JSON.stringify(plan)}`,
    'Review it once before returning your result. A free-text clarification must never ask the user to select, name, paste an ID or URL for an external resource. If resource selection is needed, return the appropriate resolve_resource recipe instead. Otherwise return the same valid clarification.'
].join('\n');

const spreadsheetPickerClarification = ({ resourceResult = {}, name = null, message = null }) => ({
    type: 'message',
    message: message || (name
        ? `I could not find an exact match for “${name}”. Choose the Google Sheet to use.`
        : 'Choose the Google Sheet to use.'),
    inputs: [{
        id: 'spreadsheetId',
        type: 'resource_picker',
        label: 'Google Sheet',
        resource: 'google-spreadsheets',
        account: resourceResult.account || null,
        query: name || '',
        searchable: true,
        allowCustom: true,
        customLabel: 'Paste Google Sheets URL or ID',
        options: [
            {
                id: 'create',
                name: 'Create a new Sheet',
                description: 'Create a new Google Sheet for this workflow.'
            },
            ...(resourceResult.options || []).map(option => ({
                id: String(option.value),
                name: option.label || option.value,
                description: option.description || null
            }))
        ]
    }]
});

const workflowReference = (nodeId, path) => ({ $expr: 'reference', v: 1, nodeId, path });

/**
 * A proposal is applied once but this capability creates a destination for
 * every execution. Keep the resource reference server-owned so the worker
 * cannot accidentally turn it into a one-time provisioned spreadsheet.
 */
const hasPath = ({ edges = [], from, to }) => {
    const adjacent = new Map();
    for (const edge of edges) {
        if (!adjacent.has(edge.source)) adjacent.set(edge.source, []);
        adjacent.get(edge.source).push(edge.target);
    }
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
        const current = queue.shift();
        if (current === to) return true;
        for (const next of adjacent.get(current) || []) if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
        }
    }
    return false;
};

const bindPerSubmissionSpreadsheet = ({ nodes = [], edges = [], capabilities = [], formSchema = null } = {}) => {
    if (!capabilities.includes('per_submission_spreadsheet')) return { nodes, issues: [] };
    const trigger = nodes.filter(node => node?.subType === 'form-submission');
    const creators = nodes.filter(node => node?.subType === 'googleSheetsCreate');
    const appends = nodes.filter(node => node?.subType === 'googleSheets' && String(node?.config?.operation || '').toLowerCase() === 'append');
    const issues = [];
    if (trigger.length !== 1) issues.push({ code: 'PER_SUBMISSION_FORM_TRIGGER_REQUIRED', path: 'nodes', message: 'A per-submission spreadsheet requires exactly one form-submission trigger.' });
    if (creators.length !== 1) issues.push({ code: 'PER_SUBMISSION_SHEET_CREATOR_REQUIRED', path: 'nodes', message: 'Add exactly one Create Google Sheet step for each submission.' });
    if (appends.length !== 1) issues.push({ code: 'PER_SUBMISSION_SHEET_APPEND_REQUIRED', path: 'nodes', message: 'Add exactly one Append Rows step for the newly created spreadsheet.' });
    const approval = nodes.filter(node => node?.subType === 'approval');
    if (approval.length !== 1) issues.push({ code: 'PER_SUBMISSION_APPROVAL_REQUIRED', path: 'nodes', message: 'A per-submission spreadsheet must be created only after one approval step.' });
    if (trigger.length === 1 && approval.length === 1 && creators.length === 1 && appends.length === 1
        && (!hasPath({ edges, from: trigger[0].id, to: approval[0].id })
            || !hasPath({ edges, from: approval[0].id, to: creators[0].id })
            || !hasPath({ edges, from: creators[0].id, to: appends[0].id }))) {
        issues.push({ code: 'PER_SUBMISSION_SHEET_ROUTE_INVALID', path: 'edges', message: 'Route the approved submission through Create Google Sheet, then Append Rows.' });
    }
    if (issues.length) return { nodes, issues };
    const source = String(formSchema?.title || 'Form response').trim().replace(/\s+responses?$/i, '') || 'Form response';
    const creator = creators[0];
    const append = appends[0];
    const title = creator.config?.title || {
        $expr: 'template', v: 1,
        parts: [{ text: `${source} - ` }, { reference: workflowReference(trigger[0].id, ['responseId']) }]
    };
    return {
        nodes: nodes.map(node => {
            if (node.id === creator.id) return { ...node, config: { ...(node.config || {}), title, sheetTitle: node.config?.sheetTitle || 'Responses' } };
            if (node.id === append.id) return {
                ...node,
                config: {
                    ...(node.config || {}), operation: 'append',
                    spreadsheetId: workflowReference(creator.id, ['spreadsheetId']),
                    range: "'Responses'!A1"
                }
            };
            return node;
        }),
        issues: []
    };
};

const specsForPlan = ({ workflow, planner, registry }) => {
    const catalogue = enabledCatalogue(registry);
    const knownKeys = new Set(catalogue.map(node => node.nodeKey));
    const selectedNodeKeys = unique(planner.selectedNodeKeys || []);
    const unknownKeys = selectedNodeKeys.filter(key => !knownKeys.has(key));
    if (unknownKeys.length > 0) {
        throw createPipelineError(
            'The workflow plan contains an unavailable node type. No changes were applied.',
            'WORKFLOW_AI_NODE_SELECTION_INVALID',
            unknownKeys.map((key, index) => ({
                code: 'WORKFLOW_NODE_KEY_INVALID',
                path: `selectedNodeKeys[${index}]`,
                value: key,
                allowed: [...knownKeys].sort(),
                message: `Unknown nodeKey '${key}'. Choose an exact nodeKey from the available catalogue.`
            }))
        );
    }
    const requested = selectedNodeKeys;
    const keys = unique([...(workflow.nodes || []).map(nodeKeyFor), ...requested]);
    return { specs: registry.getSchemasFor(keys), catalogue, requested };
};

const proposalDiff = ({ before, after, operations, deletionEffects = [] }) => {
    const beforeIds = new Set((before.nodes || []).map(node => node.id));
    const afterIds = new Set((after.nodes || []).map(node => node.id));
    return {
        addedNodes: after.nodes.filter(node => !beforeIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        removedNodes: (before.nodes || []).filter(node => !afterIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        updatedNodes: (before.nodes || []).filter(node => {
            const next = after.nodes.find(candidate => candidate.id === node.id);
            return next && JSON.stringify(next) !== JSON.stringify(node);
        }).map(node => ({ id: node.id, title: after.nodes.find(candidate => candidate.id === node.id)?.title || node.title })),
        deletionEffects,
        edges: operations.filter(operation => [
            'connect',
            'disconnect',
            'insert_between',
            'insert_after_route',
            'add_condition_branch',
            'add_switch_routes',
            'add_error_handler',
            'add_approval_gate',
            'move_approval_gate',
            'join_branches'
        ].includes(operation.op))
    };
};

const buildPlanSteps = diff => [
    ...(diff.addedNodes || []).map(node => ({ title: `Add ${node.title || node.subType}` })),
    ...(diff.updatedNodes || []).map(node => ({ title: `Update ${node.title}` })),
    ...(diff.removedNodes || []).map(node => ({ title: `Remove ${node.title}` })),
    ...((diff.deletionEffects || []).flatMap(effect => [
        ...((effect.clearedReferences || []).length > 0 ? [{ title: 'Clear references to removed steps' }] : []),
        ...((effect.bypassedEdges || []).length > 0 ? [{ title: 'Bypass removed step in workflow connections' }] : [])
    ])),
    ...((diff.edges || []).length ? [{ title: 'Update workflow connections' }] : [])
];

const buildProposalResult = ({ plan, capabilities, operations, compiled, verification, usage, diagnosis = null }) => ({
    type: 'proposal',
    message: plan.summary || 'Workflow changes are ready for review.',
    requirements: plan.requirements,
    capabilities,
    operations,
    nodes: compiled.finalWorkflow.nodes,
    edges: compiled.finalWorkflow.edges,
    diff: compiled.diff,
    plan: buildPlanSteps(compiled.diff),
    readiness: compiled.readiness,
    verification,
    warnings: compiled.repairs,
    resourceChanges: compiled.resourceChanges || plan.resourceChanges || [],
    resourceIntent: plan.resourceIntent || null,
    tokenUsage: { ...usage, requestCalls: usage.requestCalls },
    contextDelta: plan.contextDelta || null,
    diagnosis
});

const applyAndValidate = async ({
    workflow,
    operations,
    specs,
    capabilities,
    formSchema,
    formLoader,
    userId,
    resourceContext,
    resourceChanges = [],
    bindExistingFormResponseValues = false,
    spreadsheetIntent = null,
    perSubmissionRequested = undefined,
    formWorkflowContracts = null,
    registry
}) => {
    // Form-response column mappings are server-owned. Compile the graph first,
    // apply that mapping, then run the normal strict configuration validation.
    const applied = compileWorkflowEdits({ currentWorkflow: workflow, operations, specs, registry, deferConfigValidation: true });
    const formTrigger = applied.nodes.find(node => node?.subType === 'form-submission');
    const resolvedFormSchema = formSchema || (
        formTrigger?.config?.formId && formLoader
            ? await formLoader({ formId: formTrigger.config.formId, userId })
            : null
    );
    const runtimeSheet = bindPerSubmissionSpreadsheet({
        nodes: applied.nodes,
        edges: applied.edges,
        capabilities,
        formSchema: resolvedFormSchema
    });
    if (runtimeSheet.issues.length) {
        throw createPipelineError(runtimeSheet.issues.map(item => item.message).join('; '), 'WORKFLOW_AI_PROPOSAL_INVALID', runtimeSheet.issues);
    }
    const responseSheetContract = applyFormResponseSpreadsheetContract({
        nodes: runtimeSheet.nodes,
        resourceChanges,
        form: resolvedFormSchema,
        bindExistingFormResponseValues
    });
    const normalizedResources = normalizeGeneratedResourceValues({
        nodes: responseSheetContract.nodes,
        specs,
        resourceContext,
        resourceChanges: responseSheetContract.resourceChanges
    });
    if (normalizedResources.issues.length > 0) {
        throw createPipelineError(
            normalizedResources.issues.map(item => item.message).filter(Boolean).join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            normalizedResources.issues
        );
    }
    const canonicalReferences = normalizeWorkflowReferences({
        nodes: normalizedResources.nodes,
        edges: applied.edges,
        formSchema: resolvedFormSchema,
        schemasByNodeKey: specs,
        rejectLegacy: true
    });
    const referenceIssues = [
        ...canonicalReferences.issues,
        ...validateWorkflowExpressions({ nodes: canonicalReferences.nodes, edges: applied.edges, formSchema: resolvedFormSchema })
    ];
    if (referenceIssues.length > 0) {
        throw createPipelineError(
            [...new Set(referenceIssues.map(item => item.message).filter(Boolean))].join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            referenceIssues
        );
    }
    const compiled = compileWorkflowDraft({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: canonicalReferences.nodes,
        edges: applied.edges
    });
    const destinationIssues = validateFormResponseSheetDestination({
        nodes: compiled.nodes,
        resourceChanges: responseSheetContract.resourceChanges,
        spreadsheetIntent,
        capabilities,
        perSubmissionRequested,
        formSchema: resolvedFormSchema
    });
    if (destinationIssues.length > 0) {
        throw createPipelineError(
            destinationIssues.map(item => item.message).join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            destinationIssues
        );
    }
    const resourceIssues = validateGeneratedResourceValues({ nodes: compiled.nodes, specs, resourceContext, resourceChanges: responseSheetContract.resourceChanges });
    const capabilityIssues = validateGeneratedWorkflowCapabilities({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: compiled.nodes,
        edges: compiled.edges
    });
    const summaryContractIssues = validateSummaryWorkflowContract({
        nodes: compiled.nodes,
        contract: formWorkflowContracts
    });
    const validation = validateWorkflow({
        nodes: compiled.nodes,
        edges: compiled.edges,
        isActive: false,
        requireConnected: true,
        registry
    });
    const issues = [...(compiled.bindingIssues || []), ...resourceIssues, ...capabilityIssues, ...summaryContractIssues, ...(validation.issues || [])];
    if (issues.length > 0) {
        throw createPipelineError(
            [...new Set(issues.map(item => item.message).filter(Boolean))].join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            issues
        );
    }
    const googleResourceError = (resourceContext?.['google-spreadsheets']?.error || null);
    const setupIssues = (responseSheetContract.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet') && googleResourceError
        ? [{
            code: 'GOOGLE_RECONNECT_REQUIRED',
            message: 'Reconnect Google before applying this proposal so Promptly can create the spreadsheet.',
            action: { type: 'open_connections', provider: 'google', label: 'Reconnect Google' }
        }]
        : [];
    const finalWorkflow = { ...workflow, nodes: compiled.nodes, edges: compiled.edges };
    return {
        finalWorkflow,
        repairs: [...normalizedResources.repairs, ...(responseSheetContract.applied ? [{ code: 'FORM_RESPONSE_SHEET_CONTRACT_APPLIED' }] : []), ...(compiled.repairs || [])],
        resourceChanges: responseSheetContract.resourceChanges,
        readiness: {
            ready: validation.ready !== false && setupIssues.length === 0,
            status: setupIssues.length ? 'setup_required' : validation.ready === false ? 'unverified' : 'ready',
            canApply: setupIssues.length === 0,
            issues: [...(validation.warnings || []), ...setupIssues],
            setupActions: setupIssues.map(issue => issue.action)
        },
        diff: proposalDiff({ before: workflow, after: finalWorkflow, operations, deletionEffects: applied.deletionEffects })
    };
};

const requestAndValidate = async ({
    label,
    prompt,
    instruction,
    validate,
    provider,
    budget,
    usage,
    onActivity = null,
    maxAttempts = null,
    existingWorkflow = null
}) => {
    // Planner resource changes have a small compatibility boundary: models
    // sometimes call a proposed Google Sheet `create_google_sheet` or
    // `create_sheet`. Normalize those known spellings before strict contract
    // validation; unknown resource types still fail closed.
    const normalizeCall = call => label.startsWith('planner')
        ? { ...call, value: normalizeWorkflowPlannerResult(call.value, { existingWorkflow }) }
        : call;
    let call = normalizeCall(await requestWorkflowJson({ label, prompt, systemInstruction: instruction, provider, budget, onActivity, maxAttempts }));
    let nextUsage = addWorkflowUsage(usage, call.response, label);
    let issues = workflowOutputIssues({ call, validate });
    if (issues.length === 0) return { call, usage: nextUsage };

    call = normalizeCall(await requestWorkflowJson({
        label: `${label} repair`,
        prompt: buildWorkflowOutputRepairContext({ stage: label, prompt, rawText: call.rawText, issues }),
        systemInstruction: instruction,
        provider,
        budget,
        onActivity,
        maxAttempts
    }));
    nextUsage = addWorkflowUsage(nextUsage, call.response, `${label} repair`);
    issues = workflowOutputIssues({ call, validate });
    if (issues.length > 0) {
        throw createPipelineError(`Workflow AI returned an invalid ${label} response. No changes were applied.`, `WORKFLOW_AI_INVALID_${label.toUpperCase()}`, issues);
    }
    return { call, usage: nextUsage };
};

const repairIssueSignature = issues => (Array.isArray(issues) ? issues : [])
    .map(issue => [
        String(issue?.code || ''),
        String(issue?.path || ''),
        typeof issue?.value === 'string' ? issue.value : ''
    ].join('|'))
    .sort()
    .join('\n');

const repeatsRepairIssues = (previousIssues, nextIssues) => {
    const previousSignature = repairIssueSignature(previousIssues);
    return Boolean(previousSignature) && previousSignature === repairIssueSignature(nextIssues);
};

export const generateWorkflowTurn = async ({
    request,
    currentWorkflow,
    history = [],
    pendingProposal = null,
    clarificationMode,
    turnContext = null,
    userId,
    userContext = null,
    assistantContext = null,
    formSchema = null,
    formLoader = null,
    runLoader = null,
    resourceLookup = loadWorkflowResource,
    onProgress = null,
    provider = null,
    registry = NodeRegistry,
    resourceLoader = loadWorkflowResourceContext
} = {}) => {
    const turnIntent = turnContext?.intent || turnContext || null;
    const semanticRequest = String(turnIntent?.sourceText || request || '').trim() || String(request || '');
    const budget = { calls: 0, maxCalls: WORKFLOW_COMPLEXITY_BUDGETS.simple.maxProviderCalls };
    const catalogue = enabledCatalogue(registry);
    const validatePlannerForCatalogue = result => plannerNodeKeyIssues(result, catalogue);
    let usage = {};
    const reportProviderActivity = event => {
        const phase = /planner/.test(event.operation) ? 'plan' : /verifier/.test(event.operation) ? 'check' : 'draft';
        if (event.type === 'provider_fallback') onProgress?.({ id: `${event.operation}:fallback:${event.attempt}`, status: 'retrying', phase, label: 'Trying another AI route', message: 'Retrying with another available AI route', detail: 'The first route did not finish in time, so Promptly is continuing automatically.' });
        if (event.type === 'provider_attempt') onProgress?.({ id: `${event.operation}:attempt:${event.attempt}`, status: 'awaiting_model', phase, label: phase === 'plan' ? 'Preparing the workflow plan' : phase === 'check' ? 'Checking the workflow proposal' : 'Drafting workflow changes', message: 'AI is working on this step', detail: `Attempt ${event.attempt} of ${event.maxAttempts}.` });
        if (event.type === 'provider_waiting') onProgress?.({
            id: `${event.operation}:attempt:${event.attempt}`,
            status: 'awaiting_model',
            phase,
            label: phase === 'plan' ? 'Preparing the workflow plan' : phase === 'check' ? 'Checking the workflow proposal' : 'Drafting workflow changes',
            message: 'AI is still working on this step',
            detail: `The AI model is still working (about ${Math.max(1, Math.round((event.elapsedMs || 0) / 1000))} seconds so far).`
        });
    };

    onProgress?.({
        status: 'planning', phase: 'understand', label: 'Reading your request',
        message: 'Understanding your request', detail: 'Identifying the trigger, actions, and any approval rules.'
    });
    const requestedName = workflowRenameFromRequest(semanticRequest);
    if (requestedName) return workflowRenameProposal({ workflow: currentWorkflow, name: requestedName, usage });
    let inspectedRun = null;
    let inspectedResource = null;
    let resourceSelections = {};
    let googleSheetsRowSource = null;
    let inspectedFormSchema = null;
    let resolvedFormSchema = formSchema;
    let formLookupUsed = false;
    let spreadsheetIntent = resolveSpreadsheetIntent({
        request: semanticRequest,
        sourceText: semanticRequest,
        clarificationState: turnContext?.command?.state || {},
        pendingProposal,
        currentWorkflow,
        history
    });

    const resolutionState = turnContext?.command?.state || {};
    const hasGoogleFormSourceState = resolutionState.googleFormId || resolutionState.googleFormSpreadsheetId || resolutionState.googleFormRange;
    const hasGoogleSheetRowSourceState = resolutionState.googleSheetTriggerSpreadsheetId || resolutionState.googleSheetTriggerRange;
    if (hasGoogleFormSourceState || hasGoogleSheetRowSourceState) {
        const resolvedSource = await (hasGoogleFormSourceState ? resolveGoogleFormResponseSource : resolveGoogleSheetRowSource)({
            userId,
            resourceLookup,
            state: resolutionState,
            query: semanticRequest
        });
        if (resolvedSource.status === 'error') {
            return resourceErrorReply(resolvedSource.error, { ...usage, requestCalls: budget.calls }, 'Google resources could not be loaded right now.');
        }
        if (resolvedSource.status === 'clarification') {
            return { ...resolvedSource.clarification, tokenUsage: { ...usage, requestCalls: budget.calls } };
        }
        googleSheetsRowSource = resolvedSource.source;
        resourceSelections = { ...resourceSelections, ...resolvedSource.resourceSelections };
        inspectedResource = googleSheetsRowSourceInspection(googleSheetsRowSource);
    }

    // A form selected from a previous clarification, or already attached to
    // this workflow, is more authoritative than a name inferred from prose.
    const attachedFormId = (currentWorkflow.nodes || []).find(node => node?.subType === 'form-submission')?.config?.formId || null;
    const selectedFormId = turnContext?.command?.state?.formId || null;
    const initialFormId = resolvedFormSchema ? null : (selectedFormId || attachedFormId);
    if (initialFormId) {
        const availableFormIds = new Set((userContext?.forms || []).map(form => form?.id).filter(Boolean));
        if (availableFormIds.size > 0 && !availableFormIds.has(initialFormId)) {
            return {
                type: 'reply',
                message: 'Please choose one of your available forms before I continue.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        if (!formLoader) {
            return {
                type: 'reply',
                message: 'I cannot load that form in this workflow right now. Please select the form in the workflow, then try again.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        resolvedFormSchema = await formLoader({ formId: initialFormId, userId });
        if (!resolvedFormSchema) {
            return {
                type: 'reply',
                message: 'I could not access that form. Please choose one of your available forms and try again.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        inspectedFormSchema = resolvedFormSchema;
        formLookupUsed = true;
        await recordAiDiagnostic({
            event: 'workflow_form_context_loaded',
            source: selectedFormId ? 'clarification' : 'attached_workflow',
            fieldCount: resolvedFormSchema.fields?.length || 0
        });
    }
    if (spreadsheetIntent.mode === 'requires_existing') {
        let resourceResult;
        try {
            resourceResult = await resourceLookup({ userId, resource: 'google-spreadsheets' });
        } catch (error) {
            return resourceErrorReply(error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
        }
        if (resourceResult?.error) return resourceErrorReply(resourceResult.error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
        return {
            ...spreadsheetPickerClarification({ resourceResult }),
            tokenUsage: { ...usage, requestCalls: budget.calls }
        };
    }
    if (isExistingSpreadsheetIntent(spreadsheetIntent)) {
        if (spreadsheetIntent.source === 'current_workflow') {
            inspectedResource = {
                resource: 'google-spreadsheets',
                selected: { id: spreadsheetIntent.spreadsheetId, name: spreadsheetIntent.name || null, description: null }
            };
            resourceSelections = { 'google-spreadsheets': spreadsheetIntent.spreadsheetId };
        } else {
            let resourceResult;
            try {
                resourceResult = await resourceLookup({ userId, resource: 'google-spreadsheets' });
            } catch (error) {
                return resourceErrorReply(error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
            }
            if (resourceResult?.error) {
                return resourceErrorReply(resourceResult.error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
            }
            const options = resourceResult?.options || [];
            if (spreadsheetIntent.mode === 'existing_selected') {
                let selected = options.find(option => String(option.value) === String(spreadsheetIntent.spreadsheetId));
                if (!selected && spreadsheetIntent.source === 'clarification') {
                    let verification;
                    try {
                        verification = await resourceLookup({
                            userId,
                            resource: 'google-spreadsheet',
                            params: { spreadsheetId: spreadsheetIntent.spreadsheetId }
                        });
                    } catch (error) {
                        return resourceErrorReply(error, { ...usage, requestCalls: budget.calls }, 'Google Sheet access could not be verified right now.');
                    }
                    if (verification?.error) return resourceErrorReply(verification.error, { ...usage, requestCalls: budget.calls }, 'Google Sheet access could not be verified right now.');
                    selected = verification?.options?.[0] || null;
                    if (!selected) {
                        return {
                            ...spreadsheetPickerClarification({
                                resourceResult,
                                name: spreadsheetIntent.name || null,
                                message: 'I could not verify that Google Sheet. Choose one from your connected account or paste another URL.'
                            }),
                            tokenUsage: { ...usage, requestCalls: budget.calls }
                        };
                    }
                }
                if (!selected && spreadsheetIntent.source !== 'clarification') {
                    return {
                        ...spreadsheetPickerClarification({ resourceResult, name: spreadsheetIntent.name || null }),
                        tokenUsage: { ...usage, requestCalls: budget.calls }
                    };
                }
                spreadsheetIntent = {
                    ...spreadsheetIntent,
                    spreadsheetId: selected?.value || spreadsheetIntent.spreadsheetId,
                    ...(selected?.label ? { name: selected.label } : {})
                };
            } else {
                const discovery = discoverResource({ options, query: spreadsheetIntent.name });
                if (discovery.status === 'missing') {
                    return {
                        ...spreadsheetPickerClarification({ resourceResult, name: spreadsheetIntent.name }),
                        tokenUsage: { ...usage, requestCalls: budget.calls }
                    };
                }
                if (discovery.status === 'ambiguous') {
                    return {
                        ...spreadsheetPickerClarification({
                            resourceResult: { ...resourceResult, options: discovery.options },
                            name: spreadsheetIntent.name,
                            message: `I found several Google Sheets matching “${spreadsheetIntent.name}”. Choose the one to use.`
                        }),
                        tokenUsage: { ...usage, requestCalls: budget.calls }
                    };
                }
                spreadsheetIntent = {
                    ...spreadsheetIntent,
                    mode: 'existing_selected',
                    spreadsheetId: discovery.option.value,
                    name: discovery.option.label
                };
            }
            inspectedResource = { resource: 'google-spreadsheets', selected: { id: spreadsheetIntent.spreadsheetId, name: spreadsheetIntent.name || null, description: null } };
            resourceSelections = { 'google-spreadsheets': spreadsheetIntent.spreadsheetId };
        }
    }
    const requiresFormContext = isFormSubmissionRequest({ request: semanticRequest, workflow: currentWorkflow });
    let formWorkflowContracts = null;
    if (requiresFormContext && !resolvedFormSchema) {
        const availableForms = (userContext?.forms || [])
            .filter(form => form?.id && form?.title)
            .slice(0, 8);
        if (availableForms.length > 0) {
            return {
                type: 'message',
                message: 'Which form should start this workflow?',
                inputs: [{
                    id: 'formId',
                    type: 'resource_choice',
                    label: 'Form',
                    options: availableForms.map(form => ({ id: form.id, name: form.title, description: form.description || null }))
                }],
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        return {
            type: 'reply',
            message: 'Please create or select a form before adding a form-submission trigger.',
            tokenUsage: { ...usage, requestCalls: budget.calls }
        };
    }
    if (requiresFormContext && resolvedFormSchema) {
        const respondentEmail = resolveRespondentEmailField({
            formSchema: resolvedFormSchema,
            preferredFieldId: resolutionState.respondentEmailFieldId || null
        });
        const decision = formPrerequisiteDecision({
            request: semanticRequest,
            formSchema: resolvedFormSchema,
            respondentEmail,
            state: resolutionState
        });
        if (decision.status === 'blocked') {
            const message = decision.blockedReason === 'RATING_FIELD_MISSING'
                ? 'The selected form does not contain a rating or score field. Add one before creating this conditional workflow.'
                : decision.blockedReason === 'SUMMARY_FIELD_MISSING'
                    ? 'The selected form does not contain a text or comment field to summarize. Add one or ask Promptly to summarize the entire submission.'
                : 'The selected form needs a usable required email field before Promptly can send a compensation offer.';
            return {
                type: 'reply',
                message,
                errorMetadata: {
                    code: decision.blockedReason,
                    issues: [{ code: decision.blockedReason, message }],
                    context: { formId: resolvedFormSchema.id }
                },
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        if (decision.status === 'clarification') {
            const labels = decision.inputs.map(input => input.label.toLowerCase());
            const message = labels.length === 1
                ? `Please provide the ${labels[0]} before I prepare this workflow.`
                : 'Please provide the remaining workflow details before I prepare this workflow.';
            return {
                type: 'message',
                message,
                inputs: decision.inputs,
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        const summaryFieldIds = decision.context.summaryFieldIds?.length > 0
            ? decision.context.summaryFieldIds
            : decision.context.summaryFieldId
                ? [decision.context.summaryFieldId]
                : [];
        const summaryBindingKeys = summaryFieldIds
            .map(fieldId => fieldBindingKey(resolvedFormSchema, fieldId))
            .filter(Boolean);
        formWorkflowContracts = {
            ...(decision.context.ratingFieldId && fieldBindingKey(resolvedFormSchema, decision.context.ratingFieldId)
                ? { rating: { $binding: fieldBindingKey(resolvedFormSchema, decision.context.ratingFieldId) } }
                : {}),
            ...(decision.context.respondentEmailFieldId && fieldBindingKey(resolvedFormSchema, decision.context.respondentEmailFieldId)
                ? { respondentEmail: { $binding: fieldBindingKey(resolvedFormSchema, decision.context.respondentEmailFieldId) } }
                : {}),
            ...(decision.context.compensationRecipient ? { compensationRecipient: decision.context.compensationRecipient } : {}),
            ...(decision.context.supportRecipient ? { supportRecipient: decision.context.supportRecipient } : {}),
            ...(decision.context.summaryMode === 'submission'
                ? { summaryInput: { mode: 'submission' } }
                : summaryBindingKeys.length > 0
                    ? { summaryInput: { mode: 'fields', fieldIds: summaryFieldIds, bindingKeys: summaryBindingKeys } }
                    : {})
        };
    }
    const requestedRunId = explicitRunIdFromRequest(semanticRequest);
    if (requestedRunId && runLoader) inspectedRun = await runLoader({ selector: 'referenced', runId: requestedRunId, userId, workflow: currentWorkflow });

    const buildPlannerContext = ({ inspectedFormSchema = null, formLookupUsed = false, forceDecision = false } = {}) => buildWorkflowPlannerContext({
        workflow: currentWorkflow,
        catalogue,
        history,
        pendingProposal,
        request: semanticRequest,
        clarificationMode,
        turnContext: turnIntent,
        userContext,
        resourceContext: assistantContext,
        formSchema: resolvedFormSchema || formSchema,
        formPrerequisites: formWorkflowContracts,
        inspectedFormSchema,
        inspectedRun,
        inspectedResource,
        spreadsheetIntent,
        formLookupUsed,
        forceDecision
    });
    let plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
    let plannerInstruction = googleSheetsRowSource
        ? googleSheetsRowSourceInstruction
        : workflowPlannerInstruction;
    let plannerResult = await requestAndValidate({
        label: 'planner',
        prompt: plannerContext.prompt,
        instruction: plannerInstruction,
        validate: validatePlannerForCatalogue,
        provider,
        budget,
        usage,
        onActivity: reportProviderActivity,
        existingWorkflow: currentWorkflow
    });
    usage = plannerResult.usage;
    let plan = plannerResult.call.value;
    const activePromptlyFormSource = turnIntent?.activeFormSource?.id
        && String(turnIntent.activeFormSource.id) === String(resolvedFormSchema?.id || '')
        ? turnIntent.activeFormSource
        : null;

    // Models occasionally describe a resource choice as a free-text question
    // even though the resource picker is available. Run one constrained review
    // pass rather than guessing from the user's wording or accepting the
    // unusable text field.
    if (hasFreeTextClarification(plan)) {
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: resourceClarificationReviewInstruction(plan),
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
    }

    if (plan.type === 'resolve_resource' && plan.recipe === 'google_sheet_row_source' && activePromptlyFormSource) {
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: [
                workflowPlannerInstruction,
                '',
                `The selected Promptly form “${activePromptlyFormSource.title || 'Selected form'}” is the requested trigger.`,
                'Do not replace it with a Google Sheet new-row trigger and do not request a source spreadsheet.',
                'Return the workflow plan for form submission, approval, and any destination actions.'
            ].join('\n'),
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
    }

    if (plan.type === 'resolve_resource') {
        const resolvedSource = await (plan.recipe === 'google_sheet_row_source'
            ? resolveGoogleSheetRowSource
            : resolveGoogleFormResponseSource)({
            userId,
            resourceLookup,
            state: resolutionState,
            query: plan.query || ''
        });
        if (resolvedSource.status === 'error') {
            return resourceErrorReply(resolvedSource.error, { ...usage, requestCalls: budget.calls }, 'Google resources could not be loaded right now.');
        }
        if (resolvedSource.status === 'clarification') {
            return { ...resolvedSource.clarification, tokenUsage: { ...usage, requestCalls: budget.calls } };
        }
        googleSheetsRowSource = resolvedSource.source;
        resourceSelections = { ...resourceSelections, ...resolvedSource.resourceSelections };
        inspectedResource = googleSheetsRowSourceInspection(googleSheetsRowSource);
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: googleSheetsRowSourceInstruction,
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
        if (plan.type === 'resolve_resource') {
            return {
                type: 'reply',
                message: 'The Google Form response source is ready. Please describe the workflow action to take after each response.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
    }

    if (plan.type === 'inspect_form') {
        const availableFormIds = new Set((userContext?.forms || []).map(form => form?.id).filter(Boolean));
        if (!availableFormIds.has(plan.formId)) {
            return {
                type: 'reply',
                message: 'Please choose one of your available forms before I inspect its fields.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        if (!formLoader) {
            return {
                type: 'reply',
                message: 'I cannot load another form in this workflow right now. Please select the form in the workflow first, then try again.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        inspectedFormSchema = await formLoader({ formId: plan.formId, userId });
        if (!inspectedFormSchema) {
            return {
                type: 'reply',
                message: 'I could not access that form. Please choose one of your available forms and try again.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }

        // A lookup can select the form that the worker is about to attach to
        // a new workflow. Keep that trusted schema for the rest of this turn,
        // so it can use semantic field tokens before the trigger has an ID.
        resolvedFormSchema = inspectedFormSchema;

        await recordAiDiagnostic({
            event: 'workflow_form_context_loaded',
            source: 'lookup',
            fieldCount: inspectedFormSchema.fields?.length || 0
        });
        formLookupUsed = true;
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: workflowPlannerInstruction,
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
        if (plan.type === 'inspect_form') {
            return {
                type: 'reply',
                message: 'I can inspect one additional form per request. I have loaded the requested form; please ask what you would like to know or change about it.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
    }

    if (plan.type === 'inspect_resource') {
        if (isExistingSpreadsheetIntent(spreadsheetIntent) && inspectedResource) {
            plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
            plannerResult = await requestAndValidate({
                label: 'planner',
                prompt: plannerContext.prompt,
                instruction: `${workflowPlannerInstruction}\nThe spreadsheet destination is already resolved. Do not inspect or replace it; return the workflow plan that uses it.`,
                validate: validatePlannerForCatalogue,
                provider,
                budget,
                usage,
                onActivity: reportProviderActivity,
                existingWorkflow: currentWorkflow
            });
            usage = plannerResult.usage;
            plan = plannerResult.call.value;
            if (plan.type === 'inspect_resource') {
                return { type: 'reply', message: `The Google Sheet “${spreadsheetIntent.name || spreadsheetIntent.spreadsheetId}” is already selected. Please describe the workflow change to make with it.`, tokenUsage: { ...usage, requestCalls: budget.calls } };
            }
        }
    }

    if (plan.type === 'inspect_resource') {
        let resourceResult;
        try {
            resourceResult = await resourceLookup({ userId, resource: plan.resource });
        } catch (error) {
            return resourceErrorReply(error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
        }
        if (resourceResult?.error) return resourceErrorReply(resourceResult.error, { ...usage, requestCalls: budget.calls }, 'Google Sheets could not be searched right now.');
        const discovery = discoverResource({ options: resourceResult?.options, query: plan.query });
        if (discovery.status === 'missing') {
            return {
                ...spreadsheetPickerClarification({ resourceResult, name: plan.query }),
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        if (discovery.status === 'ambiguous') {
            return {
                ...spreadsheetPickerClarification({
                    resourceResult: { ...resourceResult, options: discovery.options },
                    name: plan.query,
                    message: `I found several Google Sheets matching “${plan.query}”. Choose the one to use.`
                }),
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        inspectedResource = { resource: 'google-spreadsheets', selected: { id: discovery.option.value, name: discovery.option.label, description: discovery.option.description || null } };
        resourceSelections = { 'google-spreadsheets': discovery.option.value };
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
        plannerResult = await requestAndValidate({
            label: 'planner', prompt: plannerContext.prompt, instruction: workflowPlannerInstruction,
            validate: validatePlannerForCatalogue, provider, budget, usage, onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
        if (plan.type === 'inspect_resource') return { type: 'reply', message: 'I have loaded the matching Google Sheet. Please tell me how you would like to use it.', tokenUsage: { ...usage, requestCalls: budget.calls } };
    }

    if (plan.type === 'diagnose_run') {
        const diagnosis = inspectedRun?.run?.id === plan.runId
            ? inspectedRun
            : runLoader ? await runLoader({ selector: plan.selector, runId: plan.runId, userId, workflow: currentWorkflow }) : null;
        if (!diagnosis) return { type: 'reply', message: 'I could not access that workflow run. Please choose a run from this workflow and try again.', tokenUsage: { ...usage, requestCalls: budget.calls } };
        const explanation = diagnosis.finding?.summary || 'I could not determine a confirmed cause for this run.';
        if (!diagnosis.fix || plan.goal !== 'explain_and_propose') {
            return { type: 'reply', message: explanation, diagnosis, tokenUsage: { ...usage, requestCalls: budget.calls } };
        }
        const targetIndex = (currentWorkflow.nodes || []).findIndex(node => node.id === diagnosis.fix.nodeId);
        const target = targetIndex >= 0 ? buildWorkflowEditView(currentWorkflow).nodes[targetIndex] : null;
        if (!target) return { type: 'reply', message: explanation, diagnosis, tokenUsage: { ...usage, requestCalls: budget.calls } };
        plan = {
            type: 'direct_plan', summary: diagnosis.fix.summary,
            requirements: [{ id: 'req_confirmed_run_fix', description: diagnosis.fix.summary }],
            selectedNodeKeys: [target.nodeKey], capabilities: [], resourceChanges: [],
            operations: [{ op: 'update_node', nodeRef: target.ref, updates: { config: { range: diagnosis.fix.range } } }],
            diagnosis
        };
    }

    const shouldResolveDefaults = turnIntent?.authority === 'assistant'
        || normalizeClarificationMode(clarificationMode) === CLARIFICATION_MODES.DECIDE_EVERYTHING;
    if (plan.type === 'message' && shouldResolveDefaults) {
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed, forceDecision: true });
        plannerInstruction = `${workflowPlannerInstruction}\nThe user delegated safe defaults. Resolve defaultable choices now.`;
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: plannerInstruction,
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity,
            existingWorkflow: currentWorkflow
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
        if (plan.type === 'inspect_form') {
            return {
                type: 'reply',
                message: 'I need the selected form before I can continue. Please select it in the workflow, then try again.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
    }

    await recordAiDiagnostic({
        event: 'workflow_planner_outcome',
        context: plannerContext.metrics,
        instructionCharacters: plannerInstruction.length,
        contextCharacters: plannerContext.prompt.length,
        combinedCharacters: plannerInstruction.length + plannerContext.prompt.length,
        catalogueCharacters: plannerContext.metrics.catalogueCharacters,
        workflowCharacters: plannerContext.metrics.workflowCharacters,
        historyCharacters: plannerContext.metrics.historyCharacters,
        optionalContextCharacters: plannerContext.metrics.optionalContextCharacters,
        planType: plan.type,
        selectedNodeCount: (plan.selectedNodeKeys || []).length,
        requirementCount: (plan.requirements || []).length,
        capabilities: plan.capabilities || []
    });

    onProgress?.({
        status: 'plan_ready', phase: 'plan', label: 'Mapped the workflow request',
        outcomeKind: plan.type === 'reply' ? 'reply' : plan.type === 'message' ? 'clarification' : 'proposal',
        message: 'Planning the workflow changes',
        detail: plan.type === 'message' ? 'A decision is needed before a safe workflow can be drafted.'
            : plan.type === 'reply' ? 'The request is ready for a direct response.'
                : plan.summary || `${(plan.requirements || []).length} requirement${(plan.requirements || []).length === 1 ? '' : 's'} and ${(plan.selectedNodeKeys || []).length} step type${(plan.selectedNodeKeys || []).length === 1 ? '' : 's'} identified.`,
        artifact: { id: 'workflow-requirements', kind: 'requirements', title: 'What Promptly understood', items: (plan.requirements || []).map(requirement => requirement.description || requirement.title || requirement.id).filter(Boolean) }
    });

    if (plan.type === 'reply') return { type: 'reply', message: plan.message, tokenUsage: { ...usage, requestCalls: budget.calls } };
    if (plan.type === 'message') return { type: 'message', message: plan.message, inputs: plan.inputs, tokenUsage: { ...usage, requestCalls: budget.calls } };

    const requestedNodeKeys = [
        ...(plan.selectedNodeKeys || []),
        ...(plan.linearSteps || []).map(step => step?.nodeKey)
    ];
    const needsFormContext = requestedNodeKeys.includes('trigger:form-submission');
    if (needsFormContext && !resolvedFormSchema) {
        const availableForms = (userContext?.forms || [])
            .filter(form => form?.id && form?.title)
            .slice(0, 8);
        if (availableForms.length > 0) {
            return {
                type: 'message',
                message: 'Which form should start this workflow?',
                inputs: [{
                    id: 'formId',
                    type: 'resource_choice',
                    label: 'Form',
                    options: availableForms.map(form => ({ id: form.id, name: form.title, description: form.description || null }))
                }],
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        } else {
            return {
                type: 'reply',
                message: 'Please create or select a form before adding a form-submission trigger.',
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
    }

    if (['direct_plan', 'plan_complete'].includes(plan.type) && spreadsheetIntent.mode !== 'none') {
        plan = { ...plan, resourceIntent: spreadsheetIntent };
    }
    const requiresOwnerApproval = requiredCapabilitiesForRequest(semanticRequest).includes('owner_approval');
    if (requiresOwnerApproval) {
        plan = {
            ...plan,
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'logic:approval']),
            capabilities: unique([...(plan.capabilities || []), 'owner_approval'])
        };
    }
    if (isConditionalBranchRequest(semanticRequest)) {
        plan = {
            ...plan,
            selectedNodeKeys: unique([
                ...(plan.selectedNodeKeys || []),
                'logic:condition',
                ...(isConditionalNotificationRequest(semanticRequest) ? ['action:email'] : [])
            ])
        };
    }
    if (isSwitchRouteRequest(semanticRequest)) {
        plan = {
            ...plan,
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'logic:switch'])
        };
    }
    if (isErrorHandlerRequest(semanticRequest)) {
        plan = {
            ...plan,
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'logic:catchError'])
        };
    }
    if (isBranchJoinRequest(semanticRequest)) {
        plan = {
            ...plan,
            selectedNodeKeys: unique([...(plan.selectedNodeKeys || []), 'logic:merge'])
        };
    }
    // The source request is the authority for destination semantics. A short
    // clarification such as “new Sheet” or a legacy receipt must not turn a
    // one-time provision into a runtime Sheet-per-submission route.
    const perSubmissionRequested = isExplicitPerSubmissionSpreadsheetRequest(semanticRequest);
    plan = addDefaultSpreadsheetIntent({ plan, request: semanticRequest, workflow: currentWorkflow, formSchema: resolvedFormSchema, spreadsheetIntent });
    plan = applyFormResponseSheetDestinationToPlan({
        plan,
        spreadsheetIntent,
        formSchema: resolvedFormSchema,
        perSubmissionRequested
    });
    plan = applyGoogleSheetsRowSourceToLinearSteps({ plan, source: googleSheetsRowSource });
    const complexity = workflowComplexityFor({ workflow: currentWorkflow, plan, formSchema: resolvedFormSchema });
    budget.maxCalls = Math.max(budget.calls, complexity.maxProviderCalls);

    const { specs, requested } = specsForPlan({ workflow: currentWorkflow, planner: plan, registry });
    if ((currentWorkflow.nodes || []).length === 0 && requested.length === 0) {
        throw createPipelineError('The workflow plan did not identify any supported nodes.', 'WORKFLOW_AI_NODE_SELECTION_REQUIRED');
    }
    const capabilities = unique(plan.capabilities || []);
    const sheetDestination = resolveFormResponseSheetDestination({
        resourceChanges: plan.resourceChanges || [],
        spreadsheetIntent,
        capabilities,
        perSubmissionRequested,
        formSchema: resolvedFormSchema
    });
    onProgress?.({
        status: 'planning', phase: 'plan', label: `${complexity.label} budget selected`,
        message: 'Preparing a reliable workflow draft',
        detail: `Up to ${complexity.buildAttempts} draft attempts and ${complexity.providerAttempts} AI routes per request are available for this workflow.`
    });
    onProgress?.({
        status: 'loading_resources', phase: 'understand', label: 'Checking available workflow resources',
        message: 'Loading workflow resources…', detail: `${specs.length} selected step type${specs.length === 1 ? '' : 's'} ready to configure.`
    });
    const loadedResourceContext = await resourceLoader({ userId, specs, nodes: currentWorkflow.nodes || [], selections: resourceSelections });
    const resourceContext = withTrustedConfiguredSpreadsheetResources(
        withTrustedFormResource(loadedResourceContext, resolvedFormSchema),
        spreadsheetIntent
    );
    const spreadsheetRange = selectedSpreadsheetRange({ resourceContext, spreadsheetId: spreadsheetIntent.spreadsheetId });
    plan = applySelectedSpreadsheetToLinearSteps({ plan, spreadsheetIntent, range: spreadsheetRange });
    const linearAssembly = plan.type === 'plan_complete'
        ? assembleLinearWorkflow({ workflow: currentWorkflow, plan, specs, formSchema: resolvedFormSchema })
        : { operations: null, reason: 'Only complete plans can provide a linear workflow blueprint.' };
    let previousResponse = null;
    let repairIssues = [];
    let firstRepairIssues = [];
    let verifierRepairIssues = [];
    const captureRepairIssues = issues => {
        repairIssues = issues || [];
        if (firstRepairIssues.length === 0 && repairIssues.length > 0) firstRepairIssues = repairIssues;
    };
    let unverifiedProposal = null;
    let workerTransientError = null;

    for (let attempt = 0; attempt < complexity.buildAttempts; attempt += 1) {
        onProgress?.({
            status: attempt === 0 ? 'building' : 'repairing',
            phase: 'draft',
            label: attempt === 0 ? 'Drafting workflow changes' : 'Correcting the workflow draft',
            message: attempt === 0 ? 'Building workflow changes…' : `Correcting the workflow proposal (${attempt + 1}/${complexity.buildAttempts})`,
            detail: attempt === 0 ? `${(plan.requirements || []).length} requested requirement${(plan.requirements || []).length === 1 ? '' : 's'} are being turned into workflow steps.` : `${repairIssues.length} issue${repairIssues.length === 1 ? '' : 's'} found in the previous draft.`
        });

        let workerCall;
        if (attempt === 0 && linearAssembly.operations) {
            onProgress?.({
                status: 'building',
                phase: 'draft',
                label: 'Assembling the workflow graph',
                message: 'Connecting the workflow steps',
                detail: 'Promptly is applying the validated linear blueprint and binding the selected resources.'
            });
            workerCall = { value: { operations: linearAssembly.operations }, rawText: JSON.stringify({ operations: linearAssembly.operations }), response: null };
        } else if (attempt === 0 && plan.type === 'direct_plan') {
            workerCall = { value: { operations: plan.operations }, rawText: JSON.stringify({ operations: plan.operations }), response: null };
        } else {
            const label = attempt === 0 ? 'worker' : 'worker repair';
            try {
                workerCall = await requestWorkflowJson({
                    label,
                    prompt: buildWorkflowWorkerContext({
                        workflow: currentWorkflow,
                        specs,
                        requirements: plan.requirements,
                        capabilities,
                        resourceChanges: plan.resourceChanges || [],
                        sheetDestination,
                        resourceContext,
                        resourceSelections,
                        formSchema: resolvedFormSchema,
                        formPrerequisites: formWorkflowContracts,
                        linearSteps: plan.linearSteps || [],
                        priorResponse: previousResponse,
                        repairIssues
                    }),
                    systemInstruction: workflowWorkerInstruction,
                    provider,
                    budget,
                    onActivity: reportProviderActivity,
                    maxAttempts: complexity.providerAttempts
                });
                usage = addWorkflowUsage(usage, workerCall.response, label);
            } catch (error) {
                if (!['WORKFLOW_AI_BUDGET_EXCEEDED', 'WORKFLOW_AI_PROVIDER_TIMEOUT', 'WORKFLOW_AI_PROVIDER_UNAVAILABLE', 'WORKFLOW_AI_RATE_LIMITED'].includes(error.code)) throw error;
                workerTransientError = error;
                captureRepairIssues(error.issues || [{ code: error.code, message: error.message }]);
                await recordAiDiagnostic({
                    event: 'workflow_worker_unavailable_for_linear_fallback',
                    attempt: attempt + 1,
                    issues: repairIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path }))
                });
                break;
            }
        }

        const selectedSpreadsheetOperations = applySelectedSpreadsheetToOperations({
            operations: workerCall.value.operations,
            workflow: currentWorkflow,
            spreadsheetIntent,
            range: spreadsheetRange
        });
        const operationNormalization = normalizeWorkflowOperations({
            operations: applyGoogleSheetsRowSourceToOperations({
                operations: selectedSpreadsheetOperations,
                workflow: currentWorkflow,
                source: googleSheetsRowSource
            }),
            knownNodeKeys: specs.map(spec => spec.nodeKey)
        });
        const selectedOperations = operationNormalization.operations;
        workerCall = { ...workerCall, value: { ...workerCall.value, operations: selectedOperations } };
        const destinationIssues = validateFormResponseSheetDestination({
            operations: selectedOperations,
            resourceChanges: plan.resourceChanges || [],
            spreadsheetIntent,
            capabilities,
            perSubmissionRequested,
            formSchema: resolvedFormSchema
        }).map(issue => ({
            ...issue,
            path: issue.path === 'nodes' ? 'operations' : issue.path
        }));
        const workerIssues = [
            ...operationNormalization.issues,
            ...workflowOutputIssues({
                call: workerCall,
                validate: result => validateWorkflowWorkerResult(result, { specs, workflow: currentWorkflow })
            }),
            ...destinationIssues
        ];
        if (workerIssues.length > 0) {
            onProgress?.({ status: 'repairing', phase: 'draft', label: 'Repairing an invalid workflow draft', message: 'The draft needs a correction', detail: `${workerIssues.length} issue${workerIssues.length === 1 ? '' : 's'} found before the workflow could be checked.` });
            previousResponse = workerCall.rawText || workerCall.value;
            if (repeatsRepairIssues(repairIssues, workerIssues)) {
                captureRepairIssues(workerIssues);
                await recordAiDiagnostic({
                    event: 'workflow_worker_repair_stopped_repeated',
                    attempt: attempt + 1,
                    issues: workerIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path }))
                });
                break;
            }
            captureRepairIssues(workerIssues);
            continue;
        }

        let compiled;
        try {
            compiled = await applyAndValidate({
                workflow: currentWorkflow,
                operations: workerCall.value.operations,
                specs,
                capabilities,
                formSchema: resolvedFormSchema,
                formLoader,
                userId,
                resourceContext,
                resourceChanges: plan.resourceChanges || [],
                bindExistingFormResponseValues: isExistingSpreadsheetIntent(spreadsheetIntent),
                spreadsheetIntent,
                perSubmissionRequested,
                formWorkflowContracts,
                registry
            });
        } catch (error) {
            onProgress?.({ status: 'repairing', phase: 'draft', label: 'Correcting workflow connections', message: 'The draft needs a correction', detail: `${(error.issues || []).length || 1} connection or configuration issue needs repair.` });
            previousResponse = workerCall.value;
            captureRepairIssues(error.issues || [{ code: error.code || 'WORKFLOW_AI_PROPOSAL_INVALID', message: error.message }]);
            await recordAiDiagnostic({
                event: 'workflow_proposal_rejected',
                attempt: attempt + 1,
                issues: repairIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path, value: item.value, allowed: item.allowed }))
            });
            continue;
        }

        const proposal = {
            plan,
            capabilities,
            operations: workerCall.value.operations,
            compiled,
            usage
        };

        onProgress?.({
            status: 'checking', phase: 'check', label: 'Checking the workflow draft',
            message: 'Checking the proposal against your request',
            detail: `${(workerCall.value.operations || []).length} proposed change${(workerCall.value.operations || []).length === 1 ? '' : 's'} compiled into a valid workflow.`,
            artifact: { id: 'workflow-draft', kind: 'draft', title: 'Draft assembled', items: (compiled.finalWorkflow?.nodes || []).map(node => node.title || node.subType).filter(Boolean) }
        });
        let verifier;
        try {
            verifier = await requestAndValidate({
                label: 'verifier',
                prompt: buildWorkflowVerifierContext({
                    requirements: plan.requirements,
                    operations: workerCall.value.operations,
                    diff: compiled.diff,
                    workflow: compiled.finalWorkflow,
                    specs,
                    resourceChanges: plan.resourceChanges || [],
                    formPrerequisites: formWorkflowContracts
                }),
                instruction: workflowVerifierInstruction,
                validate: validateWorkflowVerifierResult,
                provider,
                budget,
                usage,
                onActivity: reportProviderActivity,
                maxAttempts: complexity.providerAttempts
            });
        } catch (error) {
            if (!['WORKFLOW_AI_INVALID_VERIFIER', 'WORKFLOW_AI_BUDGET_EXCEEDED', 'WORKFLOW_AI_PROVIDER_TIMEOUT'].includes(error.code)) throw error;
            previousResponse = workerCall.value;
            captureRepairIssues(error.issues || [{ code: error.code, message: error.message }]);
            unverifiedProposal = {
                ...proposal,
                verification: {
                    status: 'unverified',
                    skippedReason: error.code === 'WORKFLOW_AI_BUDGET_EXCEEDED'
                        ? 'AI_CALL_BUDGET_EXCEEDED'
                        : error.code === 'WORKFLOW_AI_PROVIDER_TIMEOUT'
                            ? 'VERIFIER_TIMED_OUT'
                            : 'VERIFIER_RESPONSE_INVALID',
                    issues: repairIssues
                }
            };
            // A locally valid graph is more useful than another expensive
            // rebuild when only the optional verifier returned invalid JSON.
            break;
        }
        usage = verifier.usage;
        if (verifier.call.value.status === 'repair') {
            onProgress?.({ status: 'repairing', phase: 'check', label: 'Repairing a requirement mismatch', message: 'The verifier found a requirement to correct', detail: `${verifier.call.value.issues.length} requested detail${verifier.call.value.issues.length === 1 ? '' : 's'} still needs attention.` });
            previousResponse = workerCall.value;
            captureRepairIssues(verifier.call.value.issues.map(item => ({
                code: 'REQUIREMENT_NOT_SATISFIED',
                path: item.requirementId || 'requirements',
                message: item.message
            })));
            verifierRepairIssues = mergeRepairIssues(verifierRepairIssues, repairIssues);
            await recordAiDiagnostic({
                event: 'workflow_verifier_repair_requested',
                attempt: attempt + 1,
                issues: repairIssues.slice(0, 3).map(item => ({ code: item.code, path: item.path }))
            });
            unverifiedProposal = {
                ...proposal,
                usage,
                verification: {
                    status: 'unverified',
                    skippedReason: 'VERIFICATION_REJECTED',
                    issues: repairIssues
                }
            };
            continue;
        }

        if (compiled.repairs.length > 0) {
            await recordAiDiagnostic({
                event: 'workflow_proposal_repaired',
                repairs: compiled.repairs.map(item => ({ code: item.code, nodeId: item.nodeId }))
            });
        }
        onProgress?.({ status: 'verified', phase: 'check', label: 'Verified the workflow proposal', message: 'The workflow draft is ready for review', detail: 'All requested workflow requirements passed the final check.' });
        return buildProposalResult({
            ...proposal,
            diagnosis: plan.diagnosis || null,
            usage: { ...usage, requestCalls: budget.calls },
            verification: {
                status: 'pass',
                issues: [],
                fulfilledRequirements: plan.requirements.map(requirement => requirement.id)
            }
        });
    }

    if (!unverifiedProposal) {
        const fallback = assembleLinearWorkflow({
            workflow: currentWorkflow,
            plan,
            specs,
            formSchema: resolvedFormSchema
        });
        if (fallback.operations) {
            onProgress?.({
                status: 'building',
                phase: 'draft',
                label: 'Building a safe linear workflow',
                message: 'Using the validated workflow blueprint',
                detail: 'Promptly is assembling the unbranched workflow directly after the AI draft could not be compiled.'
            });
            let compiled;
            try {
                compiled = await applyAndValidate({
                    workflow: currentWorkflow,
                    operations: fallback.operations,
                    specs,
                    capabilities,
                    formSchema: resolvedFormSchema,
                    formLoader,
                    userId,
                    resourceContext,
                    resourceChanges: plan.resourceChanges || [],
                    bindExistingFormResponseValues: isExistingSpreadsheetIntent(spreadsheetIntent),
                    formWorkflowContracts,
                    registry
                });
            } catch (error) {
                captureRepairIssues(error.issues || [{ code: error.code || 'WORKFLOW_LINEAR_FALLBACK_INVALID', message: error.message }]);
                await recordAiDiagnostic({
                    event: 'workflow_linear_fallback_rejected',
                    issues: repairIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path, value: item.value }))
                });
            }
            if (compiled) {
                const fallbackCompiled = {
                    ...compiled,
                    repairs: [...(compiled.repairs || []), { code: 'WORKFLOW_DETERMINISTIC_FALLBACK_USED' }]
                };
                const proposal = {
                    plan,
                    capabilities,
                    operations: fallback.operations,
                    compiled: fallbackCompiled,
                    usage
                };
                await recordAiDiagnostic({
                    event: 'workflow_deterministic_fallback_used',
                    nodeCount: fallbackCompiled.finalWorkflow.nodes.length,
                    operationCount: fallback.operations.length,
                    priorIssueCodes: repairIssues.slice(0, 8).map(item => item.code)
                });
                let verification;
                try {
                    const verifier = await requestAndValidate({
                        label: 'verifier',
                        prompt: buildWorkflowVerifierContext({
                            requirements: plan.requirements,
                            operations: fallback.operations,
                            diff: fallbackCompiled.diff,
                            workflow: fallbackCompiled.finalWorkflow,
                            specs,
                            resourceChanges: plan.resourceChanges || [],
                            formPrerequisites: formWorkflowContracts
                        }),
                        instruction: workflowVerifierInstruction,
                        validate: validateWorkflowVerifierResult,
                        provider,
                        budget,
                        usage,
                        onActivity: reportProviderActivity,
                        maxAttempts: complexity.providerAttempts
                    });
                    usage = verifier.usage;
                    verification = verifier.call.value.status === 'pass'
                        ? {
                            status: 'pass',
                            issues: [],
                            fulfilledRequirements: plan.requirements.map(requirement => requirement.id)
                        }
                        : {
                            status: 'unverified',
                            skippedReason: 'DETERMINISTIC_FALLBACK_VERIFICATION_REJECTED',
                            issues: verifier.call.value.issues.map(item => ({
                                code: 'REQUIREMENT_NOT_SATISFIED',
                                path: item.requirementId || 'requirements',
                                message: item.message
                            }))
                        };
                } catch (error) {
                    if (!['WORKFLOW_AI_INVALID_VERIFIER', 'WORKFLOW_AI_BUDGET_EXCEEDED', 'WORKFLOW_AI_PROVIDER_TIMEOUT', 'WORKFLOW_AI_PROVIDER_UNAVAILABLE', 'WORKFLOW_AI_RATE_LIMITED'].includes(error.code)) throw error;
                    verification = {
                        status: 'unverified',
                        skippedReason: 'DETERMINISTIC_FALLBACK_USED',
                        issues: error.issues || [{ code: error.code, message: error.message }]
                    };
                }
                return buildProposalResult({
                    ...proposal,
                    diagnosis: plan.diagnosis || null,
                    usage: { ...usage, requestCalls: budget.calls },
                    verification
                });
            }
        } else if (repairIssues.length > 0) {
            await recordAiDiagnostic({
                event: 'workflow_deterministic_fallback_skipped',
                reason: fallback.reason,
                priorIssueCodes: repairIssues.slice(0, 8).map(item => item.code)
            });
        }
    }

    if (verifierRepairIssues.length > 0) {
        throw createPipelineError(
            'I could not safely prepare workflow changes that satisfy every requested detail. No changes were applied.',
            'WORKFLOW_AI_VERIFICATION_FAILED',
            verifierRepairIssues
        );
    }

    if (unverifiedProposal) {
        return buildProposalResult({
            ...unverifiedProposal,
            diagnosis: plan.diagnosis || null,
            usage: { ...unverifiedProposal.usage, requestCalls: budget.calls }
        });
    }

    if (workerTransientError) {
        throw createPipelineError(
            workerTransientError.message || 'Workflow AI is temporarily unavailable. No changes were applied.',
            workerTransientError.code || 'WORKFLOW_AI_PROVIDER_UNAVAILABLE',
            mergeRepairIssues(firstRepairIssues, repairIssues)
        );
    }

    throw createPipelineError(
        'I could not safely prepare workflow changes that satisfy your request. No changes were applied.',
        'WORKFLOW_AI_UNSAFE_PROPOSAL',
        mergeRepairIssues(firstRepairIssues, repairIssues)
    );
};
