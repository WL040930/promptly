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
    const issues = [...resourceIssues, ...capabilityIssues, ...(validation.issues || [])];
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
    const plannerPrompt = forceDecision => buildWorkflowPlannerContext({
        workflow: currentWorkflow,
        catalogue,
        history,
        pendingProposal,
        request,
        clarificationMode,
        turnContext,
        userContext,
        forceDecision
    });
    let plannerResult = await requestAndValidate({
        label: 'planner',
        prompt: plannerPrompt(false),
        instruction: workflowPlannerInstruction,
        validate: validateWorkflowPlannerResult,
        provider,
        budget,
        usage
    });
    usage = plannerResult.usage;
    let plan = plannerResult.call.value;

    if (plan.type === 'message' && turnContext?.authority === 'assistant') {
        plannerResult = await requestAndValidate({
            label: 'planner',
            prompt: plannerPrompt(true),
            instruction: `${workflowPlannerInstruction}\nThe user delegated safe defaults. Resolve defaultable choices now.`,
            validate: validateWorkflowPlannerResult,
            provider,
            budget,
            usage
        });
        usage = plannerResult.usage;
        plan = plannerResult.call.value;
    }

    if (plan.type === 'reply') return { type: 'reply', message: plan.message, tokenUsage: { ...usage, requestCalls: budget.calls } };
    if (plan.type === 'message') return { type: 'message', message: plan.message, inputs: plan.inputs, tokenUsage: { ...usage, requestCalls: budget.calls } };

    await recordAiDiagnostic({
        event: 'workflow_planner_outcome',
        planType: plan.type,
        selectedNodeCount: (plan.selectedNodeKeys || []).length,
        requirementCount: (plan.requirements || []).length,
        capabilities: plan.capabilities || []
    });

    const { specs, requested } = specsForPlan({ workflow: currentWorkflow, planner: plan, registry });
    if ((currentWorkflow.nodes || []).length === 0 && requested.length === 0) {
        throw createPipelineError('The workflow plan did not identify any supported nodes.', 'WORKFLOW_AI_NODE_SELECTION_REQUIRED');
    }
    const capabilities = unique(plan.capabilities || []);
    const resourceContext = await resourceLoader({ userId, specs });
    let previousResponse = null;
    let repairIssues = [];

    for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt += 1) {
        onProgress?.({
            status: attempt === 0 ? 'building' : 'repairing',
            message: attempt === 0 ? 'Building a safe workflow proposal' : `Correcting the workflow proposal (${attempt + 1}/${MAX_BUILD_ATTEMPTS})`
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
                    formSchema,
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
                formSchema,
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
            previousResponse = workerCall.value;
            repairIssues = error.issues || [{ code: error.code, message: error.message }];
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
            continue;
        }

        if (compiled.repairs.length > 0) {
            await recordAiDiagnostic({
                event: 'workflow_proposal_repaired',
                repairs: compiled.repairs.map(item => ({ code: item.code, nodeId: item.nodeId }))
            });
        }
        return {
            type: 'proposal',
            message: plan.summary || 'Workflow changes are ready for review.',
            requirements: plan.requirements,
            capabilities,
            operations: workerCall.value.operations,
            nodes: compiled.finalWorkflow.nodes,
            edges: compiled.finalWorkflow.edges,
            diff: compiled.diff,
            plan: buildPlanSteps(compiled.diff),
            readiness: compiled.readiness,
            verification: {
                status: 'pass',
                issues: [],
                fulfilledRequirements: plan.requirements.map(requirement => requirement.id)
            },
            warnings: compiled.repairs,
            tokenUsage: { ...usage, requestCalls: budget.calls }
        };
    }

    throw createPipelineError(
        'I could not safely prepare workflow changes that satisfy your request. No changes were applied.',
        'WORKFLOW_AI_UNSAFE_PROPOSAL',
        repairIssues
    );
};
