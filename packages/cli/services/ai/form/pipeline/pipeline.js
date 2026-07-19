import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import {
    buildPlannerContext,
    buildWorkerContext,
    getQuestionCardinality
} from '../context/formContext.js';
import { validatePlannerResult } from '../domain/formSchemaValidator.js';
import { evaluatePlannerOutcome } from '../domain/formClarificationPolicy.js';
import { plannerInstruction } from '../shared/instructions.js';
import {
    createAIOutputError,
    createRequestBudget
} from '../shared/errors.js';
import { getOutputIssues, requestJson } from '../provider/request.js';
import { repairPlanner } from '../recovery/repairs.js';
import { recoverWorkerProposal } from '../recovery/workerRecovery.js';
import { addTokenUsage } from '../shared/usage.js';

const canRebuildDirectProposal = (plannerResult, issues = []) => {
    if (plannerResult?.type !== 'direct_proposal' || !Array.isArray(plannerResult.requirements) || plannerResult.requirements.length === 0) {
        return false;
    }

    // A malformed patch must never be applied. If the planner requirements are
    // intact and validation only found patch-shape problems, let the worker
    // rebuild the proposal from those requirements instead.
    return issues.length > 0 && issues.every(({ path = '' }) => (
        path === 'patches' || /^patches\[\d+\](?:\.|$)/.test(path)
    ));
};

const rebuildAsWorkerPlan = (plannerResult) => {
    const workerPlan = Object.fromEntries(
        Object.entries(plannerResult).filter(([key]) => key !== 'patches')
    );
    workerPlan.type = 'plan_complete';
    return workerPlan;
};

export const generateFormFromPrompt = async (
    prompt,
    currentSchema,
    chatHistory = [],
    onProgress = null,
    options = {}
) => {
    try {
        const provider = options.provider || null;
        const budget = createRequestBudget();
        const cardinality = getQuestionCardinality({
            schema: currentSchema || {},
            prompt,
            chatHistory
        });

        if (onProgress) onProgress({ status: 'analyzing', message: 'Analyzing requirements...' });

        // The planner owns the conversational decision: reply, clarify, or
        // produce a proposal plan for the worker/verification pipeline.
        const buildPlannerContents = (forceDecision = false) => [{
            role: 'user',
            parts: [{ text: buildPlannerContext({
                schema: currentSchema || {},
                chatHistory,
                prompt,
                clarificationMode: normalizeClarificationMode(options.clarificationMode),
                cardinality,
                turnContext: options.turnContext || null,
                forceDecision
            }) }]
        }];

        let plannerCall = await requestJson({
            provider,
            contents: buildPlannerContents(false),
            systemInstruction: plannerInstruction,
            label: 'planner',
            budget
        });

        let tokenUsage = addTokenUsage({}, plannerCall.response, 'planner');
        let plannerResult = plannerCall.value;
        let plannerIssues = getOutputIssues({ ...plannerCall, validate: validatePlannerResult });
        if (plannerIssues.length > 0) {
            if (onProgress) onProgress({ status: 'repairing', message: 'Checking and correcting the plan...' });
            plannerCall = await repairPlanner({
                provider,
                rawText: plannerCall.rawText || JSON.stringify(plannerResult),
                issues: plannerIssues,
                tokenUsage,
                budget,
                cardinality
            });
            tokenUsage = plannerCall.tokenUsage;
            plannerResult = plannerCall.value;
            plannerIssues = getOutputIssues({ ...plannerCall, validate: validatePlannerResult });
            if (plannerIssues.length > 0) {
                if (canRebuildDirectProposal(plannerResult, plannerIssues)) {
                    plannerResult = rebuildAsWorkerPlan(plannerResult);
                    plannerIssues = [];
                } else {
                    throw createAIOutputError('I could not create a reliable plan for this request.', 'FORM_AI_UNSAFE_PLAN', plannerIssues);
                }
            }
        }

        const plannerPolicy = evaluatePlannerOutcome({
            clarificationMode: options.clarificationMode,
            plannerResult,
            delegated: options.turnContext?.authority === 'assistant'
        });

        if (plannerPolicy.action === 'resolve_defaults' && !options.forceDecision) {
            if (onProgress) onProgress({ status: 'deciding', message: 'Choosing sensible defaults...' });
            plannerCall = await requestJson({
                provider,
                contents: buildPlannerContents(true),
                systemInstruction: `${plannerInstruction}\n\nThe previous planner response asked for defaultable details. Resolve those details yourself now and return a completed plan.`,
                label: 'planner',
                budget
            });
            tokenUsage = addTokenUsage(tokenUsage, plannerCall.response, 'planner');
            plannerResult = plannerCall.value;
            plannerIssues = getOutputIssues({ ...plannerCall, validate: validatePlannerResult });
            if (plannerIssues.length > 0) {
                throw createAIOutputError('I could not create a reliable plan for this request.', 'FORM_AI_UNSAFE_PLAN', plannerIssues);
            }
        }

        // Conversational replies and clarification questions are terminal and
        // non-mutating outcomes. Decide-everything has already had one bounded
        // internal defaults-resolution attempt and never exposes ordinary inputs.
        if (plannerResult.type === 'reply' || plannerResult.type === 'message') {
            if (plannerResult.type === 'message' && plannerPolicy.action === 'resolve_defaults') {
                return {
                    type: 'reply',
                    message: 'I could not safely choose defaults for this request. Please make the form change more specific.',
                    tokenUsage: { ...tokenUsage, requestCalls: budget.calls }
                };
            }
            plannerResult.tokenUsage = tokenUsage;
            plannerResult.tokenUsage.requestCalls = budget.calls;
            return plannerResult;
        }

        if (plannerResult.type === 'direct_proposal' || plannerResult.type === 'plan_complete') {
            if (onProgress) onProgress({ status: 'building', message: 'Generating form schema...' });
            const workerContents = [{
                role: 'user',
                parts: [{ text: buildWorkerContext({
                schema: currentSchema || {},
                requirements: plannerResult.requirements,
                    cardinality,
                    turnContext: options.turnContext || null
                }) }]
            }];
            const workerResult = await recoverWorkerProposal({
                provider,
                schema: currentSchema || {},
                plannerResult,
                workerContents,
                ...(plannerResult.type === 'direct_proposal' ? { initialWorkerResult: plannerResult } : {}),
                tokenUsage,
                onProgress,
                budget,
                cardinality,
                turnContext: options.turnContext || null
            });
            const result = workerResult.result;
            const appliedProposal = workerResult.appliedProposal;
            const verification = workerResult.verification;
            tokenUsage = workerResult.tokenUsage;
            return {
                ...result,
                type: 'proposal',
                message: plannerResult.summary || result.message || 'Form changes are ready for review.',
                patches: appliedProposal.patches,
                schema: appliedProposal.schema,
                tokenUsage: { ...tokenUsage, requestCalls: budget.calls },
                requirements: plannerResult.requirements,
                verification,
                cardinality
            };
        }

        throw createAIOutputError('I could not determine how to handle this form request.', 'FORM_AI_UNKNOWN_PLANNER_OUTCOME', [{
            code: 'UNKNOWN_PLANNER_OUTCOME',
            path: 'type',
            message: `Unsupported planner result type: ${String(plannerResult?.type || 'missing')}.`
        }]);
    } catch (error) {
        console.error('AI Service Error (Form Generation):', error);
        throw error;
    }
};
