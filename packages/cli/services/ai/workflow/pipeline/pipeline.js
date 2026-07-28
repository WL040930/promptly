import NodeRegistry from '../../../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../../engine/workflowValidator.js';
import { recordAiDiagnostic } from '../../core/diagnosticsLogger.js';
import {
    compileWorkflowDraft,
    compileWorkflowEdits,
    loadWorkflowResourceContext,
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

const MAX_BUILD_ATTEMPTS = 3;
const MAX_REQUEST_CALLS = 40;

const createPipelineError = (message, code, issues = []) => {
    const error = new Error(message);
    error.code = code;
    error.issues = issues;
    return error;
};

const unique = values => [...new Set(values.filter(Boolean))];
const nodeKeyFor = node => node?.nodeKey || (node?.type && node?.subType ? `${node.type}:${node.subType}` : null);

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
        edges: operations.filter(operation => ['connect', 'disconnect', 'insert_between'].includes(operation.op))
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
    registry
}) => {
    const applied = compileWorkflowEdits({ currentWorkflow: workflow, operations, specs, registry });
    const formTrigger = applied.nodes.find(node => node?.subType === 'form-submission');
    const resolvedFormSchema = formSchema || (
        formTrigger?.config?.formId && formLoader
            ? await formLoader({ formId: formTrigger.config.formId, userId })
            : null
    );
    const compiled = compileWorkflowDraft({
        requiredCapabilities: capabilities,
        formSchema: resolvedFormSchema,
        respondentEmailFieldId: resolvedFormSchema?.respondentEmailFieldId || resolvedFormSchema?.settings?.respondentEmailFieldId || null,
        nodes: applied.nodes,
        edges: applied.edges
    });
    const resourceIssues = validateGeneratedResourceValues({ nodes: compiled.nodes, specs, resourceContext });
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
            issues.map(item => item.message).join('; '),
            'WORKFLOW_AI_PROPOSAL_INVALID',
            issues
        );
    }
    const finalWorkflow = { ...workflow, nodes: compiled.nodes, edges: compiled.edges };
    return {
        finalWorkflow,
        repairs: compiled.repairs || [],
        readiness: { ready: validation.ready !== false, issues: validation.warnings || [] },
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
    usage
}) => {
    let call = await requestWorkflowJson({ label, prompt, systemInstruction: instruction, provider, budget });
    let nextUsage = addWorkflowUsage(usage, call.response, label);
    let issues = workflowOutputIssues({ call, validate });
    if (issues.length === 0) return { call, usage: nextUsage };

    call = await requestWorkflowJson({
        label: `${label} repair`,
        prompt: buildWorkflowOutputRepairContext({ stage: label, rawText: call.rawText, issues }),
        systemInstruction: instruction,
        provider,
        budget
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

    onProgress?.({ status: 'planning', message: 'Understanding your request' });
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
        usage
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
            usage
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

    if (plan.type === 'message' && turnContext?.authority === 'assistant') {
        plannerContext = buildPlannerContext({ inspectedFormSchema, formLookupUsed, forceDecision: true });
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerContext.prompt,
            instruction: `${workflowPlannerInstruction}\nThe user delegated safe defaults. Resolve defaultable choices now.`,
            validate: validateWorkflowPlannerResult,
            provider,
            budget,
            usage
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

    if (plan.type === 'reply') return { type: 'reply', message: plan.message, tokenUsage: { ...usage, requestCalls: budget.calls } };
    if (plan.type === 'message') return { type: 'message', message: plan.message, inputs: plan.inputs, tokenUsage: { ...usage, requestCalls: budget.calls } };

    const { specs, requested } = specsForPlan({ workflow: currentWorkflow, planner: plan, registry });
    if ((currentWorkflow.nodes || []).length === 0 && requested.length === 0) {
        throw createPipelineError('The workflow plan did not identify any supported nodes.', 'WORKFLOW_AI_NODE_SELECTION_REQUIRED');
    }
    const capabilities = unique(plan.capabilities || []);
    onProgress?.({ status: 'loading_resources', message: 'Loading workflow resources…' });
    const resourceContext = await resourceLoader({ userId, specs });
    let previousResponse = null;
    let repairIssues = [];
    let unverifiedProposal = null;

    for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt += 1) {
        unverifiedProposal = null;
        onProgress?.({
            status: attempt === 0 ? 'building' : 'repairing',
            message: attempt === 0 ? 'Building workflow changes…' : `Correcting the workflow proposal (${attempt + 1}/${MAX_BUILD_ATTEMPTS})`
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
                    resourceContext,
                    formSchema: resolvedFormSchema,
                    priorResponse: previousResponse,
                    repairIssues
                }),
                systemInstruction: workflowWorkerInstruction,
                provider,
                budget
            });
            usage = addWorkflowUsage(usage, workerCall.response, label);
        }

        const workerIssues = workflowOutputIssues({ call: workerCall, validate: validateWorkflowWorkerResult });
        if (workerIssues.length > 0) {
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
                registry
            });
        } catch (error) {
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

        onProgress?.({ status: 'checking', message: 'Checking the proposal against your request' });
        let verifier;
        try {
            verifier = await requestAndValidate({
                label: 'verifier',
                prompt: buildWorkflowVerifierContext({
                    requirements: plan.requirements,
                    operations: workerCall.value.operations,
                    diff: compiled.diff,
                    workflow: compiled.finalWorkflow
                }),
                instruction: workflowVerifierInstruction,
                validate: validateWorkflowVerifierResult,
                provider,
                budget,
                usage
            });
        } catch (error) {
            if (!['WORKFLOW_AI_INVALID_VERIFIER', 'WORKFLOW_AI_BUDGET_EXCEEDED'].includes(error.code)) throw error;
            previousResponse = workerCall.value;
            repairIssues = error.issues || [{ code: error.code, message: error.message }];
            unverifiedProposal = {
                ...proposal,
                verification: {
                    status: 'unverified',
                    skippedReason: error.code === 'WORKFLOW_AI_BUDGET_EXCEEDED' ? 'AI_CALL_BUDGET_EXCEEDED' : 'VERIFIER_RESPONSE_INVALID',
                    issues: repairIssues
                }
            };
            continue;
        }
        usage = verifier.usage;
        if (verifier.call.value.status === 'repair') {
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
