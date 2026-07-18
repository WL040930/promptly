import { getAITaskConfig, getAIProviderRoutesForTask } from './aiService.js';
import env from '../../config/env.js';
import fs from 'fs';
import path from 'path';
import { parseAiJson } from '../../utils/jsonParser.js';
import {
    buildPlannerContext,
    buildPlannerRepairContext,
    buildVerifierContext,
    buildVerifierRepairContext,
    buildWorkerContext,
    buildWorkerRepairContext,
    createMemoryPatch,
    getMemoryUpdate
} from './formContext.js';
import { applyFormPatches } from './formPatchEngine.js';
import { normalizeClarificationMode } from '../../../shared/agentContract.js';
import {
    summarizeValidationIssues,
    validatePlannerResult,
    validateVerifierResult,
    validateWorkerResult
} from './formSchemaValidator.js';
import { FORM_FIELD_TYPES } from '../../../shared/formContract.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const plannerInstructionPath = path.resolve(__dirname, './instruction/form/planner.md');
const workerInstructionPath = path.resolve(__dirname, './instruction/form/worker.md');
const verifierInstructionPath = path.resolve(__dirname, './instruction/form/verifier.md');

const MAX_PLANNER_ATTEMPTS = 2;
const MAX_FORM_REPAIR_LOOPS = 3;
const MAX_VERIFIER_ATTEMPTS = 2;
// Try every distinct configured provider/model route before surfacing a
// transient provider failure. The route resolver currently supports four AI
// providers; the slice remains a guard if a route is accidentally duplicated.
const MAX_PROVIDER_ROUTE_ATTEMPTS = 4;
// The call budget is derived from the bounded pipeline, so it cannot cut off a
// complete worker -> verifier loop before the loop limit is reached.
const MAX_FORM_AI_CALLS = MAX_PROVIDER_ROUTE_ATTEMPTS * (
    MAX_PLANNER_ATTEMPTS
    + (MAX_FORM_REPAIR_LOOPS * (1 + MAX_VERIFIER_ATTEMPTS))
);
const MAX_INVALID_OUTPUT_PREVIEW_LENGTH = 2000;

const FORM_FIELD_SEMANTICS = [
    'Canonical form field semantics:',
    '- rating: numeric scale; use maxRating for a bounded scale such as 1-5.',
    '- radio: exactly one option can be selected; choices are required.',
    '- checkbox: one or more options can be selected; choices are required.',
    '- select: dropdown where exactly one option can be selected; choices are required.',
    '- single_choice and multiple_choice are clarification-input types only, never form field types.'
].join('\n');

let plannerInstruction = 'You are an AI Form Planner.';
let workerInstruction = 'You are an AI Form Worker.';
let verifierInstruction = 'You are a Form Proposal Verifier.';
try {
    plannerInstruction = `${fs.readFileSync(plannerInstructionPath, 'utf8')}\n\n${FORM_FIELD_SEMANTICS}`;
    workerInstruction = `${fs.readFileSync(workerInstructionPath, 'utf8')}\n\nAuthoritative supported field types: ${FORM_FIELD_TYPES.join(', ')}.\n\n${FORM_FIELD_SEMANTICS}`;
    verifierInstruction = `${fs.readFileSync(verifierInstructionPath, 'utf8')}\n\n${FORM_FIELD_SEMANTICS}`;
} catch (err) {
    console.error('Failed to read form instructions:', err);
}

const addTokenUsage = (total = {}, response, stage = null) => {
    const usage = response?.usageMetadata;
    const promptTokens = usage?.promptTokenCount || 0;
    const completionTokens = usage?.candidatesTokenCount || 0;
    const totalTokens = usage?.totalTokenCount || 0;
    const nextTotal = {
        promptTokens: (total.promptTokens || 0) + promptTokens,
        completionTokens: (total.completionTokens || 0) + completionTokens,
        totalTokens: (total.totalTokens || 0) + totalTokens,
        ...(total.stages ? { stages: { ...total.stages } } : {})
    };

    if (stage) {
        const previousStage = total.stages?.[stage] || {};
        nextTotal.stages = {
            ...(nextTotal.stages || {}),
            [stage]: {
                promptTokens: (previousStage.promptTokens || 0) + promptTokens,
                completionTokens: (previousStage.completionTokens || 0) + completionTokens,
                totalTokens: (previousStage.totalTokens || 0) + totalTokens,
                calls: (previousStage.calls || 0) + 1
            }
        };
    }

    return nextTotal;
};

const createAIOutputError = (message, code, issues = []) => {
    const unsafeProposalMessage = code === 'FORM_AI_UNSAFE_PROPOSAL'
        ? `I could not safely prepare this form because the generated changes did not satisfy the form rules. ${issues.some(issue => issue.path?.includes('.field.label'))
            ? 'One or more fields were missing a user-facing label.'
            : issues.some(issue => issue.path === 'title' || issue.path?.includes('.updates.title'))
                ? 'The form title was missing or invalid.'
                : issues.some(issue => issue.code === 'INVALID_CHOICES' || issue.path?.includes('.choices'))
                    ? 'A choice field did not contain valid options.'
                    : issues.some(issue => issue.code === 'UNKNOWN_FIELD')
                        ? 'A change referred to a field that does not exist.'
                        : 'The proposal contained an invalid field or change.'} I tried to correct it, but the result was still invalid. No changes were applied.`
        : message;
    const error = new Error(unsafeProposalMessage);
    error.code = code;
    error.issues = issues;
    return error;
};

const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        reject(createAIOutputError(
            `${label} AI request timed out. Please try again.`,
            'FORM_AI_PROVIDER_TIMEOUT',
            [{ code: 'PROVIDER_TIMEOUT', path: label, message: 'The AI provider did not respond before the timeout.' }]
        ));
    }, timeoutMs);

    Promise.resolve(promise).then(
        value => {
            clearTimeout(timer);
            resolve(value);
        },
        error => {
            clearTimeout(timer);
            reject(error);
        }
    );
});

const getRetryAfterSeconds = (error) => {
    const headerValue = error?.headers?.['retry-after'] || error?.headers?.get?.('retry-after');
    const retryAfter = Number(headerValue);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null;
};

const getFinishReason = response => response?.finishReason || response?.candidates?.[0]?.finishReason || null;
const isLengthFinishReason = reason => ['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS'].includes(String(reason || '').toUpperCase());

const isProviderTimeoutError = error => {
    const status = Number(error?.status ?? error?.statusCode);
    return error?.code === 'FORM_AI_PROVIDER_TIMEOUT'
        || [408, 504].includes(status)
        || error?.code === 'DEADLINE_EXCEEDED'
        || /deadline expired|deadline_exceeded|timed out|timeout/i.test(error?.message || '');
};

const createProviderTimeoutError = (label, cause) => createAIOutputError(
    `${label} AI request timed out before the provider returned a response. Please try again.`,
    'FORM_AI_PROVIDER_TIMEOUT',
    [{
        code: 'PROVIDER_TIMEOUT',
        path: label,
        message: cause?.message || 'The AI provider did not respond before the timeout.'
    }]
);

const createRequestBudget = () => ({ calls: 0, maxCalls: MAX_FORM_AI_CALLS });

const reserveRequestCall = (budget, label) => {
    if (!budget) return;
    if (budget.calls >= budget.maxCalls) {
        throw createAIOutputError(
            'I could not complete the form safely within the AI request budget. No changes were applied. Please try again with a smaller request.',
            'FORM_AI_BUDGET_EXCEEDED',
            [{ code: 'CALL_BUDGET_EXCEEDED', path: label, message: `Maximum ${budget.maxCalls} AI calls reached.` }]
        );
    }
    budget.calls += 1;
};

const getCompletionLimit = label => env.aiFormUnlimitedCompletionTokens
    ? null
    : env.aiFormCompletionLimits[label];

const getFormTask = label => label.startsWith('planner')
    ? 'formPlanner'
    : label.startsWith('worker')
        ? 'formWorker'
        : 'formVerifier';

const requestJson = async ({ provider, contents, systemInstruction, model, label, budget }) => {
    const task = getFormTask(label);
    const taskConfig = getAITaskConfig(task);
    let response;
    let lastError = null;
    const attempts = provider
        ? [{ provider, providerName: 'custom', model: model || taskConfig.model, suffix: '' }]
        : getAIProviderRoutesForTask(task)
            .slice(0, MAX_PROVIDER_ROUTE_ATTEMPTS)
            .map((route, index) => ({
                provider: route.provider,
                providerName: route.providerName,
                model: route.model,
                suffix: index === 0 ? '' : ' fallback'
            }));

    if (attempts.length === 0) {
        throw createAIOutputError(
            `${label} has no configured AI provider.`,
            'FORM_AI_PROVIDER_UNAVAILABLE',
            [{ code: 'NO_PROVIDER_ROUTE', path: label, message: 'No AI provider route is configured.' }]
        );
    }

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        const attempt = attempts[attemptIndex];
        const nextAttempt = attempts[attemptIndex + 1];
        try {
            reserveRequestCall(budget, label);
            response = await withTimeout(
                attempt.provider.generateContent(contents, {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    model: attempt.model,
                    maxCompletionTokens: getCompletionLimit(label),
                    operation: `form:${label}${attempt.suffix}`
                }),
                env.aiTimeoutMs,
                label
            );
            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            const isRateLimited = error.status === 429
                || error.statusCode === 429
                || error.code === 'token_quota_exceeded'
                || error.code === 'FORM_AI_RATE_LIMITED';
            if (isRateLimited) {
                const retryAfter = getRetryAfterSeconds(error);
                if (nextAttempt) {
                    console.warn('[AI Provider Fallback]', JSON.stringify({
                        operation: `form:${label}`,
                        reason: 'rate_limited',
                        from: attempt.providerName,
                        to: nextAttempt.providerName,
                        retryAfter
                    }));
                    continue;
                }

                const retryMessage = retryAfter
                    ? `AI provider rate limit reached. Tried all configured providers. Try again in ${retryAfter} seconds.`
                    : 'AI provider rate limit reached. Tried all configured providers. Please try again shortly.';
                throw createAIOutputError(retryMessage, 'FORM_AI_RATE_LIMITED', [{
                    code: 'RATE_LIMITED',
                    path: label,
                    message: retryMessage
                }]);
            }
            if (!isProviderTimeoutError(error)) throw error;
            if (nextAttempt) {
                console.warn('[AI Provider Fallback]', JSON.stringify({
                    operation: `form:${label}`,
                    reason: 'timeout',
                    from: attempt.providerName,
                    to: nextAttempt.providerName
                }));
                continue;
            }
            throw createProviderTimeoutError(label, error);
        }
    }

    if (lastError) {
        if (isProviderTimeoutError(lastError)) throw createProviderTimeoutError(label, lastError);
        throw lastError;
    }

    const rawText = typeof response?.text === 'string' ? response.text : '';
    if (!rawText.trim()) {
        const parseError = createAIOutputError(`${label} AI returned an empty response.`, `FORM_AI_INVALID_${label.toUpperCase()}_JSON`, [{
            code: 'EMPTY_RESPONSE',
            path: '',
            message: 'The AI provider returned no JSON content.'
        }]);
        console.warn('[AI Output Shape]', JSON.stringify({
            operation: `form:${label}`,
            responseType: 'empty',
            rawTextLength: 0,
            finishReason: getFinishReason(response)
        }));
        return { response, rawText, parseError };
    }

    try {
        const finishReason = getFinishReason(response);
        const value = parseAiJson(rawText, { recoverTruncation: false });
        if (value === null || Array.isArray(value) || typeof value !== 'object') {
            console.warn('[AI Output Shape]', JSON.stringify({
                operation: `form:${label}`,
                responseType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
                rawTextLength: rawText.length,
                finishReason
            }));
        }
        return { value, response, rawText };
    } catch (error) {
        const outputPreview = rawText.length > MAX_INVALID_OUTPUT_PREVIEW_LENGTH
            ? `${rawText.slice(0, MAX_INVALID_OUTPUT_PREVIEW_LENGTH)}...[truncated]`
            : rawText;
        const truncated = isLengthFinishReason(getFinishReason(response));
        const outputIssue = truncated
            ? {
                code: 'OUTPUT_TRUNCATED',
                path: '',
                message: 'The AI response reached its output limit before returning complete JSON.'
            }
            : {
                code: 'INVALID_JSON',
                path: '',
                message: error.message
            };
        const outputLog = {
            operation: `form:${label}`,
            responseType: 'invalid_json',
            rawTextLength: rawText.length,
            finishReason: getFinishReason(response),
            parserError: error.message
        };
        if (process.env.NODE_ENV !== 'production') outputLog.rawText = outputPreview;
        console.warn('[AI Output Invalid JSON]', JSON.stringify(outputLog));
        return {
            response,
            rawText,
            parseError: createAIOutputError(
                truncated ? `${label} AI response was truncated before complete JSON was returned.` : `${label} AI returned invalid JSON.`,
                `FORM_AI_INVALID_${label.toUpperCase()}_JSON`,
                [outputIssue]
            )
        };
    }
};

const getOutputIssues = ({ value, parseError, validate }) => parseError ? parseError.issues : validate(value);

const repairPlanner = async ({ provider, rawText, issues, tokenUsage, budget }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildPlannerRepairContext({ response: rawText, issues: summarizeValidationIssues(issues) }) }] }],
        systemInstruction: plannerInstruction,
        label: 'planner repair',
        budget
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'planner repair')
    };
};

const repairWorker = async ({ provider, schema, requirements, rawText, issues, tokenUsage, budget }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildWorkerRepairContext({
            schema,
            requirements,
            response: rawText,
            issues: summarizeValidationIssues(issues)
        }) }] }],
        systemInstruction: workerInstruction,
        label: 'worker repair',
        budget
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'worker repair')
    };
};

const humanizeFieldId = (field = {}) => {
    const source = [field.label, field.name, field.title, field.id]
        .find(value => typeof value === 'string' && value.trim());
    if (!source) return null;

    return source
        .trim()
        .replace(/^(?:f|field)[_-]+/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase())
        .slice(0, 255);
};

const recoverMissingWorkerLabels = (result, issues = []) => {
    if (!result || !Array.isArray(result.patches) || issues.length === 0) return result;
    if (issues.some(item => item.code !== 'REQUIRED' || !/^patches\[\d+\]\.field\.label$/.test(item.path || ''))) return result;

    const missingPaths = new Set(issues.map(item => item.path));
    let recovered = false;
    const patches = result.patches.map((patch, index) => {
        const path = `patches[${index}].field.label`;
        if (!missingPaths.has(path) || patch?.op !== 'add' || !patch.field || patch.field.label !== undefined) return patch;

        const label = humanizeFieldId(patch.field);
        if (!label) return patch;
        recovered = true;
        return { ...patch, field: { ...patch.field, label } };
    });

    return recovered ? { ...result, patches } : result;
};

const classifyWorkerFailure = (issues = []) => {
    if (issues.some(item => ['INVALID_JSON', 'OUTPUT_TRUNCATED', 'EMPTY_RESPONSE'].includes(item.code))) return 'invalid_json';
    if (issues.some(item => item.code === 'INVALID_WORKER_RESPONSE')) return 'invalid_response';
    return 'invalid_proposal';
};

const readWorkerResult = workerCall => {
    let result = workerCall.value;
    let issues = getOutputIssues({ ...workerCall, validate: validateWorkerResult });
    if (!workerCall.parseError) {
        result = recoverMissingWorkerLabels(result, issues);
        issues = getOutputIssues({ value: result, validate: validateWorkerResult });
    }
    return {
        result,
        issues,
        kind: classifyWorkerFailure(issues)
    };
};

const createWorkerRecoveryError = failure => {
    if (failure?.kind === 'invalid_json') {
        return createAIOutputError(
            'The AI returned invalid JSON while preparing the form. No changes were applied.',
            'FORM_AI_INVALID_WORKER_JSON',
            failure.issues || []
        );
    }
    if (failure?.kind === 'invalid_response') {
        return createAIOutputError(
            'The AI returned an invalid repair response while preparing the form. No changes were applied.',
            'FORM_AI_INVALID_WORKER_RESPONSE',
            failure.issues || []
        );
    }
    if (failure?.stage === 'verifier') {
        return createAIOutputError(
            'The generated form changes did not pass verification after the repair attempts. No changes were applied.',
            'FORM_AI_VERIFICATION_FAILED',
            failure.issues || []
        );
    }
    return createAIOutputError(
        'I could not safely prepare this form after the repair attempts. No changes were applied.',
        'FORM_AI_UNSAFE_PROPOSAL',
        failure?.issues || []
    );
};

const createUnverifiedVerification = (budget, reason = 'AI_CALL_BUDGET_EXCEEDED') => ({
    status: 'unverified',
    issues: [{
        code: 'VERIFICATION_SKIPPED',
        path: 'verifier',
        message: reason === 'AI_CALL_BUDGET_EXCEEDED'
            ? 'The proposal passed local form validation, but semantic AI verification was skipped because the AI request budget was reached.'
            : 'The proposal passed local form validation, but semantic AI verification was skipped because the verifier did not return valid JSON.'
    }],
    fulfilledRequirements: [],
    skippedReason: reason,
    requestCalls: budget?.calls || 0,
    requestLimit: budget?.maxCalls || MAX_FORM_AI_CALLS
});

const verifyProposal = async ({ provider, requirements, patches, memoryUpdate, tokenUsage, budget }) => {
    const verification = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierContext({ requirements, patches, memoryUpdate }) }] }],
        systemInstruction: verifierInstruction,
        label: 'verifier',
        budget
    });
    return {
        ...verification,
        tokenUsage: addTokenUsage(tokenUsage, verification.response, 'verifier')
    };
};

const repairVerifier = async ({ provider, requirements, patches, memoryUpdate, rawText, issues, tokenUsage, budget }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierRepairContext({
            requirements,
            patches,
            memoryUpdate,
            response: rawText,
            issues: summarizeValidationIssues(issues)
        }) }] }],
        systemInstruction: verifierInstruction,
        label: 'verifier repair',
        budget
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'verifier repair')
    };
};

const verifyProposalWithRecovery = async ({
    provider,
    requirements,
    patches,
    memoryUpdate,
    tokenUsage,
    onProgress,
    budget
}) => {
    let verifierCall;
    let verificationIssues;
    let totalTokenUsage = tokenUsage;

    for (let attempt = 0; attempt < MAX_VERIFIER_ATTEMPTS; attempt += 1) {
        if (attempt === 0) {
            verifierCall = await verifyProposal({ provider, requirements, patches, memoryUpdate, tokenUsage: totalTokenUsage, budget });
        } else {
            if (onProgress) onProgress({ status: 'repairing', message: 'Correcting the verification response...' });
            verifierCall = await repairVerifier({
                provider,
                requirements,
                patches,
                memoryUpdate,
                rawText: verifierCall.rawText,
                issues: verificationIssues,
                tokenUsage: totalTokenUsage,
                budget
            });
        }

        totalTokenUsage = verifierCall.tokenUsage;
        verificationIssues = getOutputIssues({ ...verifierCall, validate: validateVerifierResult });
        if (verificationIssues.length === 0) {
            const verification = verifierCall.value;
            return {
                ...verifierCall,
                value: {
                    ...verification,
                    fulfilledRequirements: verification.status === 'pass'
                        ? requirements.map(requirement => requirement.id)
                        : []
                },
                tokenUsage: totalTokenUsage
            };
        }
    }

    throw createAIOutputError(
        'I could not verify the form proposal safely after retrying the verification response. No changes were applied.',
        'FORM_AI_VERIFICATION_FAILED',
        verificationIssues
    );
};

const recoverWorkerProposal = async ({ provider, schema, plannerResult, workerContents, tokenUsage, onProgress, budget }) => {
    const memoryUpdate = getMemoryUpdate(plannerResult);
    let totalTokenUsage = tokenUsage;
    let failure = null;
    let result = null;

    for (let attempt = 0; attempt < MAX_FORM_REPAIR_LOOPS; attempt += 1) {
        let workerCall;
        if (attempt === 0) {
            workerCall = await requestJson({
                provider,
                contents: workerContents,
                systemInstruction: workerInstruction,
                label: 'worker',
                budget
            });
            totalTokenUsage = addTokenUsage(totalTokenUsage, workerCall.response, 'worker');
        } else {
            if (onProgress) onProgress({
                status: 'repairing',
                message: failure?.stage === 'verifier'
                    ? `Correcting the form changes to match the request (attempt ${attempt + 1} of ${MAX_FORM_REPAIR_LOOPS})...`
                    : `Checking and correcting the form changes (attempt ${attempt + 1} of ${MAX_FORM_REPAIR_LOOPS})...`
            });
            workerCall = await repairWorker({
                provider,
                schema,
                requirements: plannerResult.requirements,
                rawText: failure?.rawText || JSON.stringify(result),
                issues: failure?.issues || [],
                tokenUsage: totalTokenUsage,
                budget
            });
            totalTokenUsage = workerCall.tokenUsage;
        }

        const workerOutput = readWorkerResult(workerCall);
        result = workerOutput.result;
        if (workerOutput.issues.length > 0) {
            failure = {
                stage: 'worker',
                kind: workerOutput.kind,
                issues: workerOutput.issues,
                rawText: workerCall.rawText || JSON.stringify(result)
            };
            continue;
        }

        if (onProgress) onProgress({ status: 'checking', message: 'Checking generated form...' });
        const memoryPatch = createMemoryPatch(schema, plannerResult);
        const patches = memoryPatch ? [memoryPatch, ...(result.patches || [])] : (result.patches || []);
        let appliedProposal;
        try {
            appliedProposal = applyFormPatches({ currentSchema: schema, patches });
        } catch (error) {
            failure = {
                stage: 'patch',
                kind: 'invalid_proposal',
                issues: error.issues || [],
                rawText: JSON.stringify(result)
            };
            continue;
        }

        if (onProgress) onProgress({
            status: 'verifying',
            message: attempt === 0 ? 'Verifying the form instructions...' : 'Verifying the corrected form...'
        });
        let verificationCall;
        try {
            verificationCall = await verifyProposalWithRecovery({
                provider,
                requirements: plannerResult.requirements,
                patches: appliedProposal.patches,
                memoryUpdate,
                tokenUsage: totalTokenUsage,
                onProgress,
                budget
            });
        } catch (error) {
            // A locally valid proposal is still useful for explicit review when
            // semantic verification is unavailable after its bounded retries.
            if (!['FORM_AI_BUDGET_EXCEEDED', 'FORM_AI_VERIFICATION_FAILED'].includes(error.code)) throw error;
            return {
                result,
                appliedProposal,
                verification: createUnverifiedVerification(
                    budget,
                    error.code === 'FORM_AI_VERIFICATION_FAILED' ? 'VERIFIER_RESPONSE_INVALID' : 'AI_CALL_BUDGET_EXCEEDED'
                ),
                tokenUsage: totalTokenUsage
            };
        }
        totalTokenUsage = verificationCall.tokenUsage;

        const verification = verificationCall.value;
        if (verification.status === 'pass') {
            return { result, appliedProposal, verification, tokenUsage: totalTokenUsage };
        }

        failure = {
            stage: 'verifier',
            kind: 'verification_repair',
            issues: verification.issues,
            rawText: JSON.stringify(result)
        };
    }

    throw createWorkerRecoveryError(failure);
};

export const generateFormFromPrompt = async (prompt, currentSchema, chatHistory = [], onProgress = null, options = {}) => {
    try {
        const provider = options.provider || null;
        const budget = createRequestBudget();

        if (onProgress) onProgress({ status: 'analyzing', message: 'Analyzing requirements...' });

        // 1. Prepare one bounded context block for the Planner Agent.
        const currentRequestText = buildPlannerContext({
            schema: currentSchema || {},
            chatHistory,
            prompt,
            clarificationMode: normalizeClarificationMode(options.clarificationMode)
        });
        const contents = [{
            role: 'user',
            parts: [{ text: currentRequestText }]
        }];

        // 2. Call the Planner Agent
        let plannerCall = await requestJson({
            provider,
            contents,
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
                budget
            });
            tokenUsage = plannerCall.tokenUsage;
            plannerResult = plannerCall.value;
            plannerIssues = getOutputIssues({ ...plannerCall, validate: validatePlannerResult });
            if (plannerIssues.length > 0) {
                throw createAIOutputError('I could not create a reliable plan for this request.', 'FORM_AI_UNSAFE_PLAN', plannerIssues);
            }
        }

        // If the planner needs to ask a question, return immediately
        if (plannerResult.type === 'message') {
            plannerResult.tokenUsage = tokenUsage;
            plannerResult.tokenUsage.requestCalls = budget.calls;
            return plannerResult;
        }

        // 3. If planner is complete, Call the Worker Agent
        if (plannerResult.type === 'plan_complete') {
            if (onProgress) onProgress({ status: 'building', message: 'Generating form schema...' });
            const workerContents = [{
                role: 'user',
                parts: [{ text: buildWorkerContext({
                    schema: currentSchema || {},
                    requirements: plannerResult.requirements
                }) }]
            }];

            const workerResult = await recoverWorkerProposal({
                provider,
                schema: currentSchema || {},
                plannerResult,
                workerContents,
                tokenUsage,
                onProgress,
                budget
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
                verification
            };
        }
    } catch (error) {
        console.error('AI Service Error (Form Generation):', error);
        throw error;
    }
};
