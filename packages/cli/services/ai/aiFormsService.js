import { getAITaskConfig, getAIProviderForTask } from './aiService.js';
import env from '../../config/env.js';
import fs from 'fs';
import path from 'path';
import { parseAiJson } from '../../utils/jsonParser.js';
import {
    buildPlannerContext,
    buildPlannerRepairContext,
    buildVerifierContext,
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

const defaultCompletionLimits = {
    planner: 800,
    'planner repair': 800,
    worker: 2048,
    'worker repair': 2048,
    verifier: 600
};

const MAX_WORKER_ATTEMPTS = 3;

let plannerInstruction = 'You are an AI Form Planner.';
let workerInstruction = 'You are an AI Form Worker.';
let verifierInstruction = 'You are a Form Proposal Verifier.';
try {
    plannerInstruction = fs.readFileSync(plannerInstructionPath, 'utf8');
    workerInstruction = `${fs.readFileSync(workerInstructionPath, 'utf8')}\n\nAuthoritative supported field types: ${FORM_FIELD_TYPES.join(', ')}.`;
    verifierInstruction = fs.readFileSync(verifierInstructionPath, 'utf8');
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

    if (usage && stage) {
        const previousStage = total.stages?.[stage] || {};
        nextTotal.stages = {
            ...(nextTotal.stages || {}),
            [stage]: {
                promptTokens: (previousStage.promptTokens || 0) + promptTokens,
                completionTokens: (previousStage.completionTokens || 0) + completionTokens,
                totalTokens: (previousStage.totalTokens || 0) + totalTokens
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

const getCompletionLimit = (label) => env.aiMaxCompletionTokens || defaultCompletionLimits[label] || 1024;

const getFormTask = label => label.startsWith('planner')
    ? 'formPlanner'
    : label.startsWith('worker')
        ? 'formWorker'
        : 'formVerifier';

const requestJson = async ({ provider, contents, systemInstruction, model, label }) => {
    const task = getFormTask(label);
    const taskConfig = getAITaskConfig(task);
    const selectedProvider = provider || getAIProviderForTask(task);
    let response;
    try {
        response = await withTimeout(
            selectedProvider.generateContent(contents, {
                systemInstruction,
                responseMimeType: 'application/json',
                model: model || taskConfig.model,
                maxCompletionTokens: getCompletionLimit(label),
                operation: `form:${label}`
            }),
            env.aiTimeoutMs,
            label
        );
    } catch (error) {
        if (error.status === 429 || error.statusCode === 429 || error.code === 'token_quota_exceeded') {
            const retryAfter = getRetryAfterSeconds(error);
            const retryMessage = retryAfter
                ? `AI provider rate limit reached. Try again in ${retryAfter} seconds.`
                : 'AI provider rate limit reached. Please try again shortly.';
            throw createAIOutputError(retryMessage, 'FORM_AI_RATE_LIMITED', [{
                code: 'RATE_LIMITED',
                path: label,
                message: retryMessage
            }]);
        }
        if (error.code === 'FORM_AI_PROVIDER_TIMEOUT') {
            throw createAIOutputError(
                `${label} AI request timed out. Please try again.`,
                'FORM_AI_PROVIDER_TIMEOUT',
                error.issues
            );
        }
        throw error;
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
            finishReason: response?.finishReason || response?.candidates?.[0]?.finishReason || null
        }));
        return { response, rawText, parseError };
    }

    try {
        const value = parseAiJson(rawText);
        if (value === null || Array.isArray(value) || typeof value !== 'object') {
            console.warn('[AI Output Shape]', JSON.stringify({
                operation: `form:${label}`,
                responseType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
                rawTextLength: rawText.length,
                finishReason: response?.finishReason || response?.candidates?.[0]?.finishReason || null
            }));
        }
        return { value, response, rawText };
    } catch (error) {
        console.warn('[AI Output Shape]', JSON.stringify({
            operation: `form:${label}`,
            responseType: 'invalid_json',
            rawTextLength: rawText.length,
            finishReason: response?.finishReason || response?.candidates?.[0]?.finishReason || null
        }));
        return {
            response,
            rawText,
            parseError: createAIOutputError(`${label} AI returned invalid JSON.`, `FORM_AI_INVALID_${label.toUpperCase()}_JSON`, [{
                code: 'INVALID_JSON',
                path: '',
                message: error.message
            }])
        };
    }
};

const getOutputIssues = ({ value, parseError, validate }) => parseError ? parseError.issues : validate(value);

const repairPlanner = async ({ provider, rawText, issues, tokenUsage }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildPlannerRepairContext({ response: rawText, issues: summarizeValidationIssues(issues) }) }] }],
        systemInstruction: plannerInstruction,
        label: 'planner repair'
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'planner repair')
    };
};

const repairWorker = async ({ provider, schema, requirements, rawText, issues, tokenUsage }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildWorkerRepairContext({
            schema,
            requirements,
            response: rawText,
            issues: summarizeValidationIssues(issues)
        }) }] }],
        systemInstruction: workerInstruction,
        label: 'worker repair'
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
    if (issues.some(item => item.code === 'INVALID_JSON' || item.code === 'EMPTY_RESPONSE')) return 'invalid_json';
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

const verifyProposal = async ({ provider, requirements, patches, memoryUpdate, tokenUsage }) => {
    const verification = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierContext({ requirements, patches, memoryUpdate }) }] }],
        systemInstruction: verifierInstruction,
        label: 'verifier'
    });
    return {
        ...verification,
        tokenUsage: addTokenUsage(tokenUsage, verification.response, 'verifier')
    };
};

const recoverWorkerProposal = async ({ provider, schema, plannerResult, workerContents, tokenUsage, onProgress }) => {
    const memoryUpdate = getMemoryUpdate(plannerResult);
    let totalTokenUsage = tokenUsage;
    let failure = null;
    let result = null;

    for (let attempt = 0; attempt < MAX_WORKER_ATTEMPTS; attempt += 1) {
        let workerCall;
        if (attempt === 0) {
            workerCall = await requestJson({
                provider,
                contents: workerContents,
                systemInstruction: workerInstruction,
                label: 'worker'
            });
            totalTokenUsage = addTokenUsage(totalTokenUsage, workerCall.response, 'worker');
        } else {
            if (onProgress) onProgress({
                status: 'repairing',
                message: failure?.stage === 'verifier'
                    ? 'Correcting the form changes to match the request...'
                    : 'Checking and correcting the form changes...'
            });
            workerCall = await repairWorker({
                provider,
                schema,
                requirements: plannerResult.requirements,
                rawText: failure?.rawText || JSON.stringify(result),
                issues: failure?.issues || [],
                tokenUsage: totalTokenUsage
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
        const verificationCall = await verifyProposal({
            provider,
            requirements: plannerResult.requirements,
            patches: appliedProposal.patches,
            memoryUpdate,
            tokenUsage: totalTokenUsage
        });
        totalTokenUsage = verificationCall.tokenUsage;
        const verificationIssues = getOutputIssues({ ...verificationCall, validate: validateVerifierResult });
        if (verificationIssues.length > 0) {
            throw createAIOutputError(
                'I could not verify the form proposal safely. No changes were applied.',
                'FORM_AI_VERIFICATION_FAILED',
                verificationIssues
            );
        }

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
            label: 'planner'
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
                tokenUsage
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
            return plannerResult;
        }

        // 3. If planner is complete, Call the Worker Agent
        if (plannerResult.type === 'plan_complete') {
            if (onProgress) onProgress({ status: 'building', message: 'Generating form schema...' });
            const workerContents = [{
                role: 'user',
                parts: [{ text: buildWorkerContext({
                    schema: currentSchema || {},
                    requirements: plannerResult.requirements,
                    instructions: plannerResult.instructionsForWorker
                }) }]
            }];

            const workerResult = await recoverWorkerProposal({
                provider,
                schema: currentSchema || {},
                plannerResult,
                workerContents,
                tokenUsage,
                onProgress
            });
            const result = workerResult.result;
            const appliedProposal = workerResult.appliedProposal;
            const verification = workerResult.verification;
            tokenUsage = workerResult.tokenUsage;
            result.patches = appliedProposal.patches;
            result.schema = appliedProposal.schema;
            result.tokenUsage = tokenUsage;
            result.requirements = plannerResult.requirements;
            result.verification = verification;
            // Override the worker's internal message with the conversational summary from the planner
            result.message = plannerResult.summary || result.message;

            return result;
        }
    } catch (error) {
        console.error('AI Service Error (Form Generation):', error);
        throw error;
    }
};
