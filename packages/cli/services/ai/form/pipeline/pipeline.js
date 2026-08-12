import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import {
    buildPlannerContext,
    buildWorkerContext,
    getQuestionCardinality,
    activeFormSchemaForAI
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
import {
    materializePendingFormProposal,
    rebaseFormProposalSchema
} from '../domain/formProposalRevision.js';

const DEFAULT_FORM_TITLE = 'Untitled Form';

const hasUsableFormTitle = schema => typeof schema?.title === 'string' && schema.title.trim().length > 0;

const sameRevision = (left, right) => {
    const leftTime = new Date(left || '').getTime();
    const rightTime = new Date(right || '').getTime();
    return !Number.isFinite(leftTime) || !Number.isFinite(rightTime) || leftTime === rightTime;
};

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

const normalizePlannerType = (plannerResult) => {
    if (!plannerResult || typeof plannerResult !== 'object' || Array.isArray(plannerResult)) return plannerResult;
    const type = String(plannerResult.type || '').trim().toLowerCase();
    if (['reply', 'message', 'plan_complete', 'direct_proposal'].includes(type)) {
        return type === plannerResult.type ? plannerResult : { ...plannerResult, type };
    }
    if (['clarification', 'clarify', 'question'].includes(type)) return { ...plannerResult, type: 'message' };
    if (['response', 'answer', 'text'].includes(type)) return { ...plannerResult, type: 'reply' };
    if (['proposal', 'plan', 'form_proposal'].includes(type)) {
        return { ...plannerResult, type: Array.isArray(plannerResult.patches) ? 'direct_proposal' : 'plan_complete' };
    }
    return plannerResult;
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
        const persistedSchema = currentSchema || {};
        const pendingProposal = options.pendingProposal || null;
        if (pendingProposal?.baseFormUpdatedAt && !sameRevision(pendingProposal.baseFormUpdatedAt, persistedSchema.updatedAt)) {
            return {
                type: 'reply',
                message: 'This form changed while the pending draft was waiting. Generate a new suggestion from the latest form.',
                pendingProposalDisposition: 'stale',
                revisesProposalMessageId: pendingProposal.messageId || null,
                tokenUsage: { requestCalls: 0 }
            };
        }
        // A pending proposal is not yet persisted, but its server-stored
        // patches are the draft the user is asking us to revise. Materialize
        // that draft before asking any AI stage to edit it.
        const pendingDraft = pendingProposal
            ? materializePendingFormProposal({ currentSchema: persistedSchema, proposal: pendingProposal })
            : null;
        const proposalBaseSchema = pendingDraft?.schema || persistedSchema;
        const aiSchema = activeFormSchemaForAI(proposalBaseSchema);
        const provider = options.provider || null;
        const budget = createRequestBudget();
        const reportProviderActivity = event => {
            const phase = /planner/.test(event.operation) ? 'plan' : /verifier/.test(event.operation) ? 'check' : 'draft';
            if (event.type === 'provider_fallback') onProgress?.({ id: `${event.operation}:fallback:${event.attempt}`, attempt: event.attempt, status: 'retrying', phase, label: 'Trying another AI route', message: 'Retrying with another available AI route', detail: 'The first route did not finish in time, so Promptly is continuing automatically.' });
            if (event.type === 'provider_attempt') onProgress?.({ id: `${event.operation}:attempt:${event.attempt}`, attempt: event.attempt, status: 'awaiting_model', phase, label: phase === 'plan' ? 'Preparing the form plan' : phase === 'check' ? 'Checking the form draft' : 'Drafting form changes', message: 'AI is working on this step', detail: `Attempt ${event.attempt} of ${event.maxAttempts}.` });
            if (event.type === 'provider_waiting') onProgress?.({
                id: `${event.operation}:attempt:${event.attempt}`,
                attempt: event.attempt,
                status: 'awaiting_model',
                phase,
                label: phase === 'plan' ? 'Preparing the form plan' : phase === 'check' ? 'Checking the form draft' : 'Drafting form changes',
                message: 'AI is still working on this step',
                detail: `The AI model is still working (about ${Math.max(1, Math.round((event.elapsedMs || 0) / 1000))} seconds so far).`
            });
        };
        const cardinality = getQuestionCardinality({
            schema: aiSchema,
            prompt,
            chatHistory
        });

        if (onProgress) onProgress({
            status: 'analyzing', phase: 'understand', label: 'Reading your form request',
            message: 'Analyzing requirements...', detail: 'Identifying the questions, rules, and form changes you asked for.'
        });

        // The planner owns the conversational decision: reply, clarify, or
        // produce a proposal plan for the worker/verification pipeline.
        const buildPlannerContents = (forceDecision = false) => [{
            role: 'user',
            parts: [{ text: buildPlannerContext({
                schema: aiSchema,
                chatHistory,
                prompt,
                clarificationMode: normalizeClarificationMode(options.clarificationMode),
                cardinality,
                turnContext: options.turnContext || null,
                resourceContext: options.resourceContext || null,
                revisionOfPendingProposal: Boolean(pendingDraft),
                forceDecision
            }) }]
        }];

        let plannerCall = await requestJson({
            provider,
            contents: buildPlannerContents(false),
            systemInstruction: plannerInstruction,
            label: 'planner',
            budget,
            onActivity: reportProviderActivity
        });

        let tokenUsage = addTokenUsage({}, plannerCall.response, 'planner');
        let plannerResult = normalizePlannerType(plannerCall.value);
        let plannerIssues = getOutputIssues({ ...plannerCall, value: plannerResult, validate: validatePlannerResult });
        if (plannerIssues.length > 0) {
            if (onProgress) onProgress({
                status: 'repairing', phase: 'plan', label: 'Correcting the form plan',
                message: 'Checking and correcting the plan...', detail: `${plannerIssues.length} plan issue${plannerIssues.length === 1 ? '' : 's'} found before a draft can be built.`
            });
            plannerCall = await repairPlanner({
                provider,
                rawText: plannerCall.rawText || JSON.stringify(plannerResult),
                issues: plannerIssues,
                tokenUsage,
                budget,
                cardinality,
                onActivity: reportProviderActivity
            });
            tokenUsage = plannerCall.tokenUsage;
            plannerResult = normalizePlannerType(plannerCall.value);
            plannerIssues = getOutputIssues({ ...plannerCall, value: plannerResult, validate: validatePlannerResult });
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
            if (onProgress) onProgress({
                status: 'deciding', phase: 'plan', label: 'Choosing sensible defaults',
                message: 'Choosing sensible defaults...', detail: 'Resolving details you asked Promptly to decide.'
            });
            plannerCall = await requestJson({
                provider,
                contents: buildPlannerContents(true),
                systemInstruction: `${plannerInstruction}\n\nThe previous planner response asked for defaultable details. Resolve those details yourself now and return a completed plan.`,
                label: 'planner',
                budget,
                onActivity: reportProviderActivity
            });
            tokenUsage = addTokenUsage(tokenUsage, plannerCall.response, 'planner');
            plannerResult = normalizePlannerType(plannerCall.value);
            plannerIssues = getOutputIssues({ ...plannerCall, value: plannerResult, validate: validatePlannerResult });
            if (plannerIssues.length > 0) {
                if (onProgress) onProgress({
                    status: 'repairing', phase: 'plan', label: 'Correcting the defaults plan',
                    message: 'Checking and correcting the plan...', detail: `${plannerIssues.length} plan issue${plannerIssues.length === 1 ? '' : 's'} found after choosing defaults.`
                });
                plannerCall = await repairPlanner({
                    provider,
                    rawText: plannerCall.rawText || JSON.stringify(plannerResult),
                    issues: plannerIssues,
                    tokenUsage,
                    budget,
                    cardinality,
                    onActivity: reportProviderActivity
                });
                tokenUsage = plannerCall.tokenUsage;
                plannerResult = normalizePlannerType(plannerCall.value);
                plannerIssues = getOutputIssues({ ...plannerCall, value: plannerResult, validate: validatePlannerResult });
                if (plannerIssues.length > 0) {
                    if (canRebuildDirectProposal(plannerResult, plannerIssues)) {
                        plannerResult = rebuildAsWorkerPlan(plannerResult);
                    } else {
                        throw createAIOutputError('I could not create a reliable plan for this request.', 'FORM_AI_UNSAFE_PLAN', plannerIssues);
                    }
                }
            }
        }

        const resolvedOutcomeKind = plannerResult.type === 'reply'
            || (plannerResult.type === 'message' && plannerPolicy.action === 'resolve_defaults')
            ? 'reply'
            : plannerResult.type === 'message' ? 'clarification' : 'proposal';
        if (onProgress) onProgress({
            status: 'plan_ready', phase: 'plan', label: 'Mapped the form request',
            outcomeKind: resolvedOutcomeKind,
            message: resolvedOutcomeKind === 'reply' ? 'Preparing a response'
                : resolvedOutcomeKind === 'clarification' ? 'Preparing a clarification'
                    : 'Planning the form changes',
            detail: plannerResult.summary || plannerResult.message || `${(plannerResult.requirements || []).length} requirement${(plannerResult.requirements || []).length === 1 ? '' : 's'} identified for this form.`,
            artifact: { id: 'form-requirements', kind: 'requirements', title: 'What Promptly understood', items: (plannerResult.requirements || []).map(requirement => requirement.description || requirement.title || requirement.id).filter(Boolean) }
        });

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
            if (onProgress) onProgress({
                status: 'building', phase: 'draft', label: 'Drafting form changes',
                message: 'Preparing form changes…', detail: `${(plannerResult.requirements || []).length} requested requirement${(plannerResult.requirements || []).length === 1 ? '' : 's'} are being turned into form changes.`
            });
            // Keep soft-deleted field records in the patch-engine source so
            // their IDs remain reserved, while the AI-facing contexts above
            // only expose fields the user can currently see.
            const sourceSchema = proposalBaseSchema;
            const needsTitlePatch = !hasUsableFormTitle(sourceSchema);
            // New-form turns start with an empty schema. Give the patch engine a
            // valid base so field-only worker output can still be reviewed, and
            // ask recovery to include the metadata patch in the persisted draft.
            const workerSchema = needsTitlePatch
                ? { ...sourceSchema, title: DEFAULT_FORM_TITLE }
                : sourceSchema;
            const workerContents = [{
                role: 'user',
                parts: [{ text: buildWorkerContext({
                    schema: workerSchema,
                    requirements: plannerResult.requirements,
                    cardinality,
                    turnContext: options.turnContext || null,
                    revisionOfPendingProposal: Boolean(pendingDraft)
                }) }]
            }];
            const workerResult = await recoverWorkerProposal({
                provider,
                schema: workerSchema,
                plannerResult,
                workerContents,
                ...(plannerResult.type === 'direct_proposal' ? { initialWorkerResult: plannerResult } : {}),
                tokenUsage,
                onProgress,
                onActivity: reportProviderActivity,
                budget,
                cardinality,
                needsTitlePatch,
                turnContext: options.turnContext || null
            });
            const result = workerResult.result;
            let appliedProposal = workerResult.appliedProposal;
            const verification = workerResult.verification;
            tokenUsage = workerResult.tokenUsage;
            if (pendingDraft) {
                appliedProposal = rebaseFormProposalSchema({
                    currentSchema: persistedSchema,
                    targetSchema: appliedProposal.schema
                });
                if (appliedProposal.patches.length === 0) {
                    return {
                        type: 'reply',
                        message: 'That removes every pending form change, so there is nothing left to apply.',
                        pendingProposalDisposition: 'supersede',
                        revisesProposalMessageId: pendingProposal.messageId || null,
                        tokenUsage: { ...tokenUsage, requestCalls: budget.calls }
                    };
                }
            }
            if (onProgress) onProgress({
                status: 'proposal_ready', phase: 'check', label: 'Prepared a reviewable form draft',
                message: 'The form draft is ready for review',
                detail: `${(appliedProposal.patches || []).length} change${(appliedProposal.patches || []).length === 1 ? '' : 's'} prepared; verification ${verification.status === 'pass' ? 'passed' : 'needs review'}.`,
                artifact: { id: 'form-draft', kind: 'draft', title: 'Draft prepared', items: (appliedProposal.patches || []).map(patch => patch.field?.label || patch.updates?.title || patch.op).filter(Boolean) }
            });
            return {
                ...result,
                type: 'proposal',
                message: plannerResult.summary || result.message || 'Form changes are ready for review.',
                patches: appliedProposal.patches,
                schema: appliedProposal.schema,
                tokenUsage: { ...tokenUsage, requestCalls: budget.calls },
                requirements: plannerResult.requirements,
                verification,
                warnings: workerResult.warnings || [],
                cardinality,
                contextDelta: plannerResult.contextDelta || null,
                revisesProposalMessageId: pendingDraft ? pendingProposal.messageId || null : null
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
