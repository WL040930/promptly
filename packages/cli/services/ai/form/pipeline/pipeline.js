import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import {
    buildPlannerContext,
    buildWorkerContext,
    getQuestionCardinality
} from '../context/formContext.js';
import { validatePlannerResult } from '../domain/formSchemaValidator.js';
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
        const plannerContents = [{
            role: 'user',
            parts: [{ text: buildPlannerContext({
                schema: currentSchema || {},
                chatHistory,
                prompt,
                clarificationMode: normalizeClarificationMode(options.clarificationMode),
                cardinality
            }) }]
        }];

        let plannerCall = await requestJson({
            provider,
            contents: plannerContents,
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

        // Conversational replies and clarification questions are terminal and
        // non-mutating outcomes. Only a completed plan reaches the worker.
        if (plannerResult.type === 'reply' || plannerResult.type === 'message') {
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
                    cardinality
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
                cardinality
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
