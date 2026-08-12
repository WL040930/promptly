import NodeRegistry from '../../../../utils/NodeRegistry.js';
import { CLARIFICATION_MODES, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { validateWorkflow } from '../../../engine/workflowValidator.js';
import { recordAiDiagnostic } from '../../core/diagnosticsLogger.js';
import {
    compileWorkflowDraft,
    compileWorkflowEdits,
    buildWorkflowEditView,
    loadWorkflowResource,
    loadWorkflowResourceContext,
    normalizeGeneratedResourceValues,
    validateGeneratedResourceValues,
    validateGeneratedWorkflowCapabilities
} from '../workflowAgentService.js';
import { explicitRunIdFromRequest } from '../runDiagnostics.js';
import { applyFormResponseSpreadsheetContract } from '../formSpreadsheetContract.js';
import { discoverResource } from '../resourceDiscovery.js';
import { resolveFormReference } from '../domain/formReferenceResolver.js';
import { assembleLinearWorkflow } from '../domain/linearWorkflowAssembler.js';
import {
    buildWorkflowOutputRepairContext,
    buildWorkflowPlannerContext,
    buildWorkflowVerifierContext,
    buildWorkflowWorkerContext
} from '../context/workflowContext.js';
import {
    validateWorkflowPlannerResult,
    validateWorkflowVerifierResult,
    validateWorkflowWorkerResult
} from '../domain/workflowOutputValidator.js';
import { requestWorkflowJson, workflowOutputIssues } from '../provider/request.js';
import {
    workflowPlannerInstruction,
    workflowVerifierInstruction,
    workflowWorkerInstruction
} from '../shared/instructions.js';
import { addWorkflowUsage } from '../shared/usage.js';

// A workflow turn should yield a reviewable outcome quickly. Deterministic
// compiler fixes do not consume this budget; only model calls do.
const WORKFLOW_COMPLEXITY_BUDGETS = Object.freeze({
    simple: Object.freeze({ id: 'simple', label: 'Simple workflow', providerAttempts: 2, buildAttempts: 2, maxProviderCalls: 8 }),
    standard: Object.freeze({ id: 'standard', label: 'Standard workflow', providerAttempts: 3, buildAttempts: 3, maxProviderCalls: 12 }),
    complex: Object.freeze({ id: 'complex', label: 'Complex workflow', providerAttempts: 3, buildAttempts: 4, maxProviderCalls: 16 })
});

const workflowComplexityFor = ({ workflow = {}, plan = {}, formSchema = null }) => {
    const selectedNodeKeys = plan.selectedNodeKeys || [];
    const requirements = plan.requirements || [];
    const hasForm = Boolean(formSchema) || selectedNodeKeys.includes('trigger:form-submission');
    const hasResources = (plan.resourceChanges || []).length > 0;
    const hasBranching = selectedNodeKeys.some(key => /(?:approval|branch|condition|switch|router)/i.test(key))
        || (plan.capabilities || []).some(capability => /(?:approval|branch|condition|routing)/i.test(capability));
    const graphSize = (workflow.nodes || []).length;
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

export const workflowPipelineInternals = Object.freeze({
    WORKFLOW_COMPLEXITY_BUDGETS,
    workflowComplexityFor
});

const createPipelineError = (message, code, issues = []) => {
    const error = new Error(message);
    error.code = code;
    error.issues = issues;
    return error;
};

const unique = values => [...new Set(values.filter(Boolean))];
const nodeKeyFor = node => node?.nodeKey || (node?.type && node?.subType ? `${node.type}:${node.subType}` : null);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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
const perSubmissionSpreadsheetPattern = /\b(?:new|separate|individual)\s+(?:google\s*)?(?:sheets?|spreadsheets?)\s+(?:(?:for|per)\s+)?(?:each|every|per)\s+(?:form\s+)?(?:submission|response)\b|\b(?:each|every|per)\s+(?:form\s+)?(?:submission|response)\b[\s\S]{0,80}\b(?:new|separate|individual)\s+(?:google\s*)?(?:sheets?|spreadsheets?)\b/i;

const defaultSpreadsheetTitle = ({ workflow, formSchema }) => {
    const source = String(formSchema?.title || workflow?.name || workflow?.title || 'Workflow').trim() || 'Workflow';
    return `${source.replace(/\s+responses?$/i, '')} Responses`;
};

/**
 * A destination omitted from a request to save form data is a safe default:
 * propose a new Sheet. It remains a proposal until the user clicks Apply.
 */
const addDefaultSpreadsheetIntent = ({ plan, request, workflow, formSchema }) => {
    if (!['direct_plan', 'plan_complete'].includes(plan?.type)) return plan;
    if (!spreadsheetRequestPattern.test(String(request || ''))) return plan;
    if (perSubmissionSpreadsheetPattern.test(String(request || ''))) {
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
            title: defaultSpreadsheetTitle({ workflow, formSchema }),
            sheetTitle: 'Responses'
        }]
    };
};

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

const proposalDiff = ({ before, after, operations }) => {
    const beforeIds = new Set((before.nodes || []).map(node => node.id));
    const afterIds = new Set((after.nodes || []).map(node => node.id));
    return {
        addedNodes: after.nodes.filter(node => !beforeIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        removedNodes: (before.nodes || []).filter(node => !afterIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        updatedNodes: (before.nodes || []).filter(node => {
            const next = after.nodes.find(candidate => candidate.id === node.id);
            return next && JSON.stringify(next) !== JSON.stringify(node);
        }).map(node => ({ id: node.id, title: after.nodes.find(candidate => candidate.id === node.id)?.title || node.title })),
        edges: operations.filter(operation => ['connect', 'disconnect', 'insert_between', 'insert_after_route'].includes(operation.op))
    };
};

const buildPlanSteps = diff => [
    ...(diff.addedNodes || []).map(node => ({ title: `Add ${node.title || node.subType}` })),
    ...(diff.updatedNodes || []).map(node => ({ title: `Update ${node.title}` })),
    ...(diff.removedNodes || []).map(node => ({ title: `Remove ${node.title}` })),
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
    registry
}) => {
    const applied = compileWorkflowEdits({ currentWorkflow: workflow, operations, specs, registry });
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
        form: resolvedFormSchema
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
    const compiled = compileWorkflowDraft({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: normalizedResources.nodes,
        edges: applied.edges
    });
    const resourceIssues = validateGeneratedResourceValues({ nodes: compiled.nodes, specs, resourceContext, resourceChanges: responseSheetContract.resourceChanges });
    const capabilityIssues = validateGeneratedWorkflowCapabilities({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: compiled.nodes,
        edges: compiled.edges
    });
    const validation = validateWorkflow({
        nodes: compiled.nodes,
        edges: compiled.edges,
        isActive: false,
        requireConnected: true,
        registry
    });
    const issues = [...(compiled.bindingIssues || []), ...resourceIssues, ...capabilityIssues, ...(validation.issues || [])];
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
        diff: proposalDiff({ before: workflow, after: finalWorkflow, operations })
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
    maxAttempts = null
}) => {
    let call = await requestWorkflowJson({ label, prompt, systemInstruction: instruction, provider, budget, onActivity, maxAttempts });
    let nextUsage = addWorkflowUsage(usage, call.response, label);
    let issues = workflowOutputIssues({ call, validate });
    if (issues.length === 0) return { call, usage: nextUsage };

    call = await requestWorkflowJson({
        label: `${label} repair`,
        prompt: buildWorkflowOutputRepairContext({ stage: label, rawText: call.rawText, issues }),
        systemInstruction: instruction,
        provider,
        budget,
        onActivity,
        maxAttempts
    });
    nextUsage = addWorkflowUsage(nextUsage, call.response, `${label} repair`);
    issues = workflowOutputIssues({ call, validate });
    if (issues.length > 0) {
        throw createPipelineError(`Workflow AI returned an invalid ${label} response. No changes were applied.`, `WORKFLOW_AI_INVALID_${label.toUpperCase()}`, issues);
    }
    return { call, usage: nextUsage };
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
    let inspectedRun = null;
    let inspectedResource = null;
    let resourceSelections = {};
    let inspectedFormSchema = null;
    let resolvedFormSchema = formSchema;
    let formLookupUsed = false;

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
    const selectedSpreadsheetId = turnContext?.command?.state?.spreadsheetId;
    if (selectedSpreadsheetId && resourceLookup) {
        const result = await resourceLookup({ userId, resource: 'google-spreadsheets' });
        const selected = (result?.options || []).find(option => option.value === selectedSpreadsheetId);
        if (selected) {
            inspectedResource = { resource: 'google-spreadsheets', selected: { id: selected.value, name: selected.label, description: selected.description || null } };
            resourceSelections = { 'google-spreadsheets': selected.value };
        }
    }
    const requestedRunId = explicitRunIdFromRequest(request);
    if (requestedRunId && runLoader) inspectedRun = await runLoader({ selector: 'referenced', runId: requestedRunId, userId, workflow: currentWorkflow });
    const buildPlannerContext = ({ inspectedFormSchema = null, formLookupUsed = false, forceDecision = false } = {}) => buildWorkflowPlannerContext({
        workflow: currentWorkflow,
        catalogue,
        history,
        pendingProposal,
        request,
        clarificationMode,
        turnContext,
        userContext,
        resourceContext: assistantContext,
        formSchema,
        inspectedFormSchema,
        inspectedRun,
        inspectedResource,
        formLookupUsed,
        forceDecision
    });
    let plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
    let plannerResult = await requestAndValidate({
        label: 'planner',
        prompt: plannerContext.prompt,
        instruction: workflowPlannerInstruction,
        validate: validatePlannerForCatalogue,
        provider,
        budget,
        usage,
        onActivity: reportProviderActivity
    });
    usage = plannerResult.usage;
    let plan = plannerResult.call.value;

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
            onActivity: reportProviderActivity
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
        let resourceResult;
        try {
            resourceResult = await resourceLookup({ userId, resource: plan.resource });
        } catch (error) {
            return { type: 'reply', message: error.message || 'Google Sheets could not be searched right now.', tokenUsage: { ...usage, requestCalls: budget.calls } };
        }
        if (resourceResult?.error) return { type: 'reply', message: resourceResult.error.message || 'Google Sheets could not be searched right now.', tokenUsage: { ...usage, requestCalls: budget.calls } };
        const discovery = discoverResource({ options: resourceResult?.options, query: plan.query });
        if (discovery.status === 'missing') {
            return {
                type: 'message',
                message: `I could not find a Google Sheet named “${plan.query}”. Paste its Google Sheets URL or spreadsheet ID to continue.`,
                inputs: [{ id: 'spreadsheetId', type: 'text', label: 'Spreadsheet URL or ID', placeholder: 'https://docs.google.com/spreadsheets/d/…' }],
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        if (discovery.status === 'ambiguous') {
            return {
                type: 'message',
                message: `I found several Google Sheets matching “${plan.query}”. Choose the one to use.`,
                inputs: [{ id: 'spreadsheetId', type: 'resource_choice', label: 'Google Sheet', options: discovery.options.map(option => ({ id: option.value, name: option.label, description: option.description || null })) }],
                tokenUsage: { ...usage, requestCalls: budget.calls }
            };
        }
        inspectedResource = { resource: 'google-spreadsheets', selected: { id: discovery.option.value, name: discovery.option.label, description: discovery.option.description || null } };
        resourceSelections = { 'google-spreadsheets': discovery.option.value };
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed });
        plannerResult = await requestAndValidate({
            label: 'planner', prompt: plannerContext.prompt, instruction: workflowPlannerInstruction,
            validate: validatePlannerForCatalogue, provider, budget, usage, onActivity: reportProviderActivity
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

    const shouldResolveDefaults = turnContext?.authority === 'assistant'
        || normalizeClarificationMode(clarificationMode) === CLARIFICATION_MODES.DECIDE_EVERYTHING;
    if (plan.type === 'message' && shouldResolveDefaults) {
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed, forceDecision: true });
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: `${workflowPlannerInstruction}\nThe user delegated safe defaults. Resolve defaultable choices now.`,
            validate: validatePlannerForCatalogue,
            provider,
            budget,
            usage,
            onActivity: reportProviderActivity
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
        const formSelection = resolveFormReference({ request, forms: userContext?.forms || [] });
        const availableForms = (formSelection.status === 'ambiguous' ? formSelection.options : userContext?.forms || [])
            .filter(form => form?.id && form?.title)
            .slice(0, 8);
        if (formSelection.status === 'selected') {
            if (!formLoader) {
                return {
                    type: 'reply',
                    message: 'I cannot load the requested form in this workflow right now. Please select the form in the workflow, then try again.',
                    tokenUsage: { ...usage, requestCalls: budget.calls }
                };
            }
            resolvedFormSchema = await formLoader({ formId: formSelection.form.id, userId });
            if (!resolvedFormSchema) {
                return {
                    type: 'reply',
                    message: 'I could not access the form that best matches your request. Please choose one of your available forms and try again.',
                    tokenUsage: { ...usage, requestCalls: budget.calls }
                };
            }
            inspectedFormSchema = resolvedFormSchema;
            formLookupUsed = true;
            await recordAiDiagnostic({
                event: 'workflow_form_context_loaded',
                source: 'name_match',
                fieldCount: resolvedFormSchema.fields?.length || 0
            });
        } else if (availableForms.length > 0) {
            return {
                type: 'message',
                message: formSelection.status === 'ambiguous'
                    ? 'I found more than one form that could match this workflow. Which form should start it?'
                    : 'Which form should start this workflow?',
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

    plan = addDefaultSpreadsheetIntent({ plan, request, workflow: currentWorkflow, formSchema: resolvedFormSchema });
    const complexity = workflowComplexityFor({ workflow: currentWorkflow, plan, formSchema: resolvedFormSchema });
    budget.maxCalls = Math.max(budget.calls, complexity.maxProviderCalls);

    const { specs, requested } = specsForPlan({ workflow: currentWorkflow, planner: plan, registry });
    if ((currentWorkflow.nodes || []).length === 0 && requested.length === 0) {
        throw createPipelineError('The workflow plan did not identify any supported nodes.', 'WORKFLOW_AI_NODE_SELECTION_REQUIRED');
    }
    const capabilities = unique(plan.capabilities || []);
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
    const resourceContext = withTrustedFormResource(loadedResourceContext, resolvedFormSchema);
    const linearAssembly = plan.type === 'plan_complete'
        ? assembleLinearWorkflow({ workflow: currentWorkflow, plan, specs, formSchema: resolvedFormSchema })
        : { operations: null, reason: 'Only complete plans can provide a linear workflow blueprint.' };
    let previousResponse = null;
    let repairIssues = [];
    let unverifiedProposal = null;

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
                        resourceContext,
                        resourceSelections,
                        formSchema: resolvedFormSchema,
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
                repairIssues = error.issues || [{ code: error.code, message: error.message }];
                await recordAiDiagnostic({
                    event: 'workflow_worker_unavailable_for_linear_fallback',
                    attempt: attempt + 1,
                    issues: repairIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path }))
                });
                break;
            }
        }

        const workerIssues = workflowOutputIssues({ call: workerCall, validate: validateWorkflowWorkerResult });
        if (workerIssues.length > 0) {
            onProgress?.({ status: 'repairing', phase: 'draft', label: 'Repairing an invalid workflow draft', message: 'The draft needs a correction', detail: `${workerIssues.length} issue${workerIssues.length === 1 ? '' : 's'} found before the workflow could be checked.` });
            previousResponse = workerCall.rawText || workerCall.value;
            repairIssues = workerIssues;
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
                registry
            });
        } catch (error) {
            onProgress?.({ status: 'repairing', phase: 'draft', label: 'Correcting workflow connections', message: 'The draft needs a correction', detail: `${(error.issues || []).length || 1} connection or configuration issue needs repair.` });
            previousResponse = workerCall.value;
            repairIssues = error.issues || [{ code: error.code || 'WORKFLOW_AI_PROPOSAL_INVALID', message: error.message }];
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
                    resourceChanges: plan.resourceChanges || []
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
            repairIssues = error.issues || [{ code: error.code, message: error.message }];
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
            repairIssues = verifier.call.value.issues.map(item => ({
                code: 'REQUIREMENT_NOT_SATISFIED',
                path: item.requirementId || 'requirements',
                message: item.message
            }));
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
                    registry
                });
            } catch (error) {
                repairIssues = error.issues || [{ code: error.code || 'WORKFLOW_LINEAR_FALLBACK_INVALID', message: error.message }];
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
                            resourceChanges: plan.resourceChanges || []
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

    if (unverifiedProposal) {
        return buildProposalResult({
            ...unverifiedProposal,
            diagnosis: plan.diagnosis || null,
            usage: { ...unverifiedProposal.usage, requestCalls: budget.calls }
        });
    }

    throw createPipelineError(
        'I could not safely prepare workflow changes that satisfy your request. No changes were applied.',
        'WORKFLOW_AI_UNSAFE_PROPOSAL',
        repairIssues
    );
};
