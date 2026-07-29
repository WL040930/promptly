import NodeRegistry from '../../../../utils/NodeRegistry.js';
import { CLARIFICATION_MODES, normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { validateWorkflow } from '../../../engine/workflowValidator.js';
import { recordAiDiagnostic } from '../../core/diagnosticsLogger.js';
import {
    compileWorkflowDraft,
    compileWorkflowEdits,
    loadWorkflowResourceContext,
    normalizeGeneratedResourceValues,
    validateGeneratedResourceValues,
    validateGeneratedWorkflowCapabilities
} from '../workflowAgentService.js';
import {
    buildWorkflowOutputRepairContext,
    buildWorkflowPlannerContext,
    buildWorkflowVerifierContext,
    buildWorkflowWorkerContext
} from '../context/workflowContext.js';
import {
    summarizeWorkflowOutputIssues,
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
const MAX_BUILD_ATTEMPTS = 2;
const MAX_REQUEST_CALLS = 8;

const createPipelineError = (message, code, issues = []) => {
    const error = new Error(message);
    error.code = code;
    error.issues = issues;
    return error;
};

const unique = values => [...new Set(values.filter(Boolean))];
const nodeKeyFor = node => node?.nodeKey || (node?.type && node?.subType ? `${node.type}:${node.subType}` : null);

const spreadsheetRequestPattern = /\b(?:save|store|record|write|append|add)\b[\s\S]{0,120}\b(?:excel|spreadsheet|google\s*sheet|sheet)\b|\b(?:excel|spreadsheet|google\s*sheet)\b[\s\S]{0,120}\b(?:save|store|record|write|append|add)\b/i;
const explicitSpreadsheetIdPattern = /(?:docs\.google\.com\/spreadsheets\/d\/|\b[a-zA-Z0-9_-]{20,200}\b)/;

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
    if (explicitSpreadsheetIdPattern.test(String(request || ''))) return plan;
    if ((plan.resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet')) return plan;
    const requirements = [...(plan.requirements || [])];
    if (!requirements.some(requirement => /(?:google\s*sheet|spreadsheet|excel)/i.test(requirement?.description || ''))) {
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

const specsForPlan = ({ workflow, planner, registry }) => {
    const catalogue = registry.getCompactCatalogue().filter(node => node.implementationStatus !== 'disabled');
    const knownKeys = new Set(catalogue.map(node => node.nodeKey));
    const requested = (planner.selectedNodeKeys || []).filter(key => knownKeys.has(key));
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

const buildProposalResult = ({ plan, capabilities, operations, compiled, verification, usage }) => ({
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
    resourceChanges: plan.resourceChanges || [],
    tokenUsage: { ...usage, requestCalls: usage.requestCalls },
    contextDelta: plan.contextDelta || null
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
    const normalizedResources = normalizeGeneratedResourceValues({
        nodes: applied.nodes,
        specs,
        resourceContext,
        resourceChanges
    });
    if (normalizedResources.issues.length > 0) {
        throw createPipelineError(
            normalizedResources.issues.map(item => item.message).filter(Boolean).join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            normalizedResources.issues
        );
    }
    const formTrigger = normalizedResources.nodes.find(node => node?.subType === 'form-submission');
    const resolvedFormSchema = formSchema || (
        formTrigger?.config?.formId && formLoader
            ? await formLoader({ formId: formTrigger.config.formId, userId })
            : null
    );
    const compiled = compileWorkflowDraft({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: normalizedResources.nodes,
        edges: applied.edges
    });
    const resourceIssues = validateGeneratedResourceValues({ nodes: compiled.nodes, specs, resourceContext, resourceChanges });
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
    const setupIssues = (resourceChanges || []).some(change => change?.type === 'create_google_spreadsheet') && googleResourceError
        ? [{
            code: 'GOOGLE_RECONNECT_REQUIRED',
            message: 'Reconnect Google before applying this proposal so Promptly can create the spreadsheet.',
            action: { type: 'open_connections', provider: 'google', label: 'Reconnect Google' }
        }]
        : [];
    const finalWorkflow = { ...workflow, nodes: compiled.nodes, edges: compiled.edges };
    return {
        finalWorkflow,
        repairs: [...normalizedResources.repairs, ...(compiled.repairs || [])],
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
    onActivity = null
}) => {
    let call = await requestWorkflowJson({ label, prompt, systemInstruction: instruction, provider, budget, onActivity });
    let nextUsage = addWorkflowUsage(usage, call.response, label);
    let issues = workflowOutputIssues({ call, validate });
    if (issues.length === 0) return { call, usage: nextUsage };

    call = await requestWorkflowJson({
        label: `${label} repair`,
        prompt: buildWorkflowOutputRepairContext({ stage: label, rawText: call.rawText, issues }),
        systemInstruction: instruction,
        provider,
        budget,
        onActivity
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
    onProgress = null,
    provider = null,
    registry = NodeRegistry,
    resourceLoader = loadWorkflowResourceContext
} = {}) => {
    const budget = { calls: 0, maxCalls: MAX_REQUEST_CALLS };
    const catalogue = registry.getCompactCatalogue().filter(node => node.implementationStatus !== 'disabled');
    let usage = {};
    const reportProviderActivity = event => {
        const phase = /planner/.test(event.operation) ? 'plan' : /verifier/.test(event.operation) ? 'check' : 'draft';
        if (event.type === 'provider_fallback') onProgress?.({ id: `${event.operation}:fallback:${event.attempt}`, status: 'retrying', phase, label: 'Trying another AI route', message: 'Retrying with another available AI route', detail: 'The first route did not finish in time, so Promptly is continuing automatically.' });
        if (event.type === 'provider_attempt') onProgress?.({ id: `${event.operation}:attempt:${event.attempt}`, status: 'awaiting_model', phase, label: phase === 'plan' ? 'Preparing the workflow plan' : phase === 'check' ? 'Checking the workflow proposal' : 'Drafting workflow changes', message: 'AI is working on this step', detail: `Attempt ${event.attempt} of ${event.maxAttempts}.` });
    };

    onProgress?.({
        status: 'planning', phase: 'understand', label: 'Reading your request',
        message: 'Understanding your request', detail: 'Identifying the trigger, actions, and any approval rules.'
    });
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
        formLookupUsed,
        forceDecision
    });
    let plannerContext = buildPlannerContext();
    let plannerResult = await requestAndValidate({
        label: 'planner',
        prompt: plannerContext.prompt,
        instruction: workflowPlannerInstruction,
        validate: validateWorkflowPlannerResult,
        provider,
        budget,
        usage,
        onActivity: reportProviderActivity
    });
    usage = plannerResult.usage;
    let plan = plannerResult.call.value;
    let inspectedFormSchema = null;
    let resolvedFormSchema = formSchema;
    let formLookupUsed = false;

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
            validate: validateWorkflowPlannerResult,
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

    const shouldResolveDefaults = turnContext?.authority === 'assistant'
        || normalizeClarificationMode(clarificationMode) === CLARIFICATION_MODES.DECIDE_EVERYTHING;
    if (plan.type === 'message' && shouldResolveDefaults) {
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed, forceDecision: true });
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: `${workflowPlannerInstruction}\nThe user delegated safe defaults. Resolve defaultable choices now.`,
            validate: validateWorkflowPlannerResult,
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
        message: 'Planning the workflow changes',
        detail: plan.type === 'message' ? 'A decision is needed before a safe workflow can be drafted.'
            : plan.type === 'reply' ? 'The request is ready for a direct response.'
                : plan.summary || `${(plan.requirements || []).length} requirement${(plan.requirements || []).length === 1 ? '' : 's'} and ${(plan.selectedNodeKeys || []).length} step type${(plan.selectedNodeKeys || []).length === 1 ? '' : 's'} identified.`,
        artifact: { id: 'workflow-requirements', kind: 'requirements', title: 'What Promptly understood', items: (plan.requirements || []).map(requirement => requirement.description || requirement.title || requirement.id).filter(Boolean) }
    });

    if (plan.type === 'reply') return { type: 'reply', message: plan.message, tokenUsage: { ...usage, requestCalls: budget.calls } };
    if (plan.type === 'message') return { type: 'message', message: plan.message, inputs: plan.inputs, tokenUsage: { ...usage, requestCalls: budget.calls } };

    plan = addDefaultSpreadsheetIntent({ plan, request, workflow: currentWorkflow, formSchema: resolvedFormSchema });

    const { specs, requested } = specsForPlan({ workflow: currentWorkflow, planner: plan, registry });
    if ((currentWorkflow.nodes || []).length === 0 && requested.length === 0) {
        throw createPipelineError('The workflow plan did not identify any supported nodes.', 'WORKFLOW_AI_NODE_SELECTION_REQUIRED');
    }
    const capabilities = unique(plan.capabilities || []);
    onProgress?.({
        status: 'loading_resources', phase: 'understand', label: 'Checking available workflow resources',
        message: 'Loading workflow resources…', detail: `${specs.length} selected step type${specs.length === 1 ? '' : 's'} ready to configure.`
    });
    const resourceContext = await resourceLoader({ userId, specs });
    let previousResponse = null;
    let repairIssues = [];
    let unverifiedProposal = null;

    for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt += 1) {
        onProgress?.({
            status: attempt === 0 ? 'building' : 'repairing',
            phase: 'draft',
            label: attempt === 0 ? 'Drafting workflow changes' : 'Correcting the workflow draft',
            message: attempt === 0 ? 'Building workflow changes…' : `Correcting the workflow proposal (${attempt + 1}/${MAX_BUILD_ATTEMPTS})`,
            detail: attempt === 0 ? `${(plan.requirements || []).length} requested requirement${(plan.requirements || []).length === 1 ? '' : 's'} are being turned into workflow steps.` : `${repairIssues.length} issue${repairIssues.length === 1 ? '' : 's'} found in the previous draft.`
        });

        let workerCall;
        if (attempt === 0 && plan.type === 'direct_plan') {
            workerCall = { value: { operations: plan.operations }, rawText: JSON.stringify({ operations: plan.operations }), response: null };
        } else {
            const label = attempt === 0 ? 'worker' : 'worker repair';
            workerCall = await requestWorkflowJson({
                label,
                prompt: buildWorkflowWorkerContext({
                    workflow: currentWorkflow,
                    specs,
                    requirements: plan.requirements,
                    capabilities,
                    resourceChanges: plan.resourceChanges || [],
                    resourceContext,
                    formSchema: resolvedFormSchema,
                    priorResponse: previousResponse,
                    repairIssues
                }),
                systemInstruction: workflowWorkerInstruction,
                provider,
                budget,
                onActivity: reportProviderActivity
            });
            usage = addWorkflowUsage(usage, workerCall.response, label);
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
                issues: repairIssues.slice(0, 20).map(item => ({ code: item.code, path: item.path }))
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
                onActivity: reportProviderActivity
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
            usage: { ...usage, requestCalls: budget.calls },
            verification: {
                status: 'pass',
                issues: [],
                fulfilledRequirements: plan.requirements.map(requirement => requirement.id)
            }
        });
    }

    if (unverifiedProposal) {
        return buildProposalResult({
            ...unverifiedProposal,
            usage: { ...unverifiedProposal.usage, requestCalls: budget.calls }
        });
    }

    throw createPipelineError(
        'I could not safely prepare workflow changes that satisfy your request. No changes were applied.',
        'WORKFLOW_AI_UNSAFE_PROPOSAL',
        repairIssues
    );
};
