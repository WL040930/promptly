import { getAIProvider } from './aiService.js';
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
    createMemoryPatch
} from './formContext.js';
import { applyFormPatches } from './formPatchEngine.js';
import {
    summarizeValidationIssues,
    validatePlannerResult,
    validateVerifierResult,
    validateWorkerResult
} from './formSchemaValidator.js';

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

let plannerInstruction = 'You are an AI Form Planner.';
let workerInstruction = 'You are an AI Form Worker.';
let verifierInstruction = 'You are a Form Proposal Verifier.';
try {
    plannerInstruction = fs.readFileSync(plannerInstructionPath, 'utf8');
    workerInstruction = fs.readFileSync(workerInstructionPath, 'utf8');
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
    const error = new Error(message);
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

const requestJson = async ({ provider, contents, systemInstruction, model, label }) => {
    let response;
    try {
        response = await withTimeout(
            provider.generateContent(contents, {
                systemInstruction,
                responseMimeType: 'application/json',
                model,
                maxCompletionTokens: getCompletionLimit(label)
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

    try {
        return { value: parseAiJson(response.text), response, rawText: response.text };
    } catch (error) {
        return {
            response,
            rawText: response.text,
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
        model: env.aiModel,
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
        model: env.aiModel,
        label: 'worker repair'
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'worker repair')
    };
};

const verifyProposal = async ({ provider, requirements, patches, tokenUsage }) => {
    const verification = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierContext({ requirements, patches }) }] }],
        systemInstruction: verifierInstruction,
        model: env.aiVerifierModel,
        label: 'verifier'
    });
    return {
        ...verification,
        tokenUsage: addTokenUsage(tokenUsage, verification.response, 'verifier')
    };
};

export const generateFormFromPrompt = async (prompt, currentSchema, chatHistory = [], onProgress = null, options = {}) => {
    try {
        const provider = options.provider || getAIProvider();

        if (onProgress) onProgress({ status: 'analyzing', message: 'Analyzing requirements...' });

        // 1. Prepare one bounded context block for the Planner Agent.
        const currentRequestText = buildPlannerContext({ schema: currentSchema || {}, chatHistory, prompt });
        const contents = [{
            role: 'user',
            parts: [{ text: currentRequestText }]
        }];

        // 2. Call the Planner Agent
        let plannerCall = await requestJson({
            provider,
            contents,
            systemInstruction: plannerInstruction,
            model: env.aiModel,
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

            let workerCall = await requestJson({
                provider,
                contents: workerContents,
                systemInstruction: workerInstruction,
                model: env.aiModel,
                label: 'worker'
            });
            tokenUsage = addTokenUsage(tokenUsage, workerCall.response, 'worker');

            let result = workerCall.value;
            let workerIssues = getOutputIssues({ ...workerCall, validate: validateWorkerResult });
            let repairUsed = false;
            if (workerIssues.length > 0) {
                repairUsed = true;
                if (onProgress) onProgress({ status: 'repairing', message: 'Checking and correcting the form changes...' });
                workerCall = await repairWorker({
                    provider,
                    schema: currentSchema || {},
                    requirements: plannerResult.requirements,
                    rawText: workerCall.rawText || JSON.stringify(result),
                    issues: workerIssues,
                    tokenUsage
                });
                tokenUsage = workerCall.tokenUsage;
                result = workerCall.value;
                workerIssues = getOutputIssues({ ...workerCall, validate: validateWorkerResult });
                if (workerIssues.length > 0) {
                    throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', workerIssues);
                }
            }

            if (onProgress) onProgress({ status: 'checking', message: 'Checking generated form...' });
            const memoryPatch = createMemoryPatch(currentSchema || {}, plannerResult);
            const patches = memoryPatch ? [memoryPatch, ...(result.patches || [])] : (result.patches || []);

            let appliedProposal;
            try {
                appliedProposal = applyFormPatches({ currentSchema: currentSchema || {}, patches });
            } catch (error) {
                if (repairUsed) throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', error.issues || []);
                repairUsed = true;
                if (onProgress) onProgress({ status: 'repairing', message: 'Checking and correcting the form changes...' });
                workerCall = await repairWorker({
                    provider,
                    schema: currentSchema || {},
                    requirements: plannerResult.requirements,
                    rawText: JSON.stringify(result),
                    issues: error.issues || [],
                    tokenUsage
                });
                tokenUsage = workerCall.tokenUsage;
                result = workerCall.value;
                workerIssues = getOutputIssues({ ...workerCall, validate: validateWorkerResult });
                if (workerIssues.length > 0) throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', workerIssues);
                const repairedMemoryPatch = createMemoryPatch(currentSchema || {}, plannerResult);
                const repairedPatches = repairedMemoryPatch ? [repairedMemoryPatch, ...(result.patches || [])] : (result.patches || []);
                try {
                    appliedProposal = applyFormPatches({ currentSchema: currentSchema || {}, patches: repairedPatches });
                } catch (repairError) {
                    throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', repairError.issues || []);
                }
            }

            if (onProgress) onProgress({ status: 'verifying', message: 'Verifying the form instructions...' });
            let verificationCall = await verifyProposal({
                provider,
                requirements: plannerResult.requirements,
                patches: appliedProposal.patches,
                tokenUsage
            });
            tokenUsage = verificationCall.tokenUsage;
            let verificationIssues = getOutputIssues({ ...verificationCall, validate: validateVerifierResult });
            if (verificationIssues.length > 0) {
                throw createAIOutputError('I could not verify the form proposal safely.', 'FORM_AI_VERIFICATION_FAILED', verificationIssues);
            }

            let verification = verificationCall.value;
            if (verification.status === 'repair') {
                if (repairUsed) {
                    throw createAIOutputError('I could not create a form proposal that follows the request.', 'FORM_AI_UNSAFE_PROPOSAL', verification.issues || []);
                }
                repairUsed = true;
                if (onProgress) onProgress({ status: 'repairing', message: 'Correcting the form changes to match your request...' });
                workerCall = await repairWorker({
                    provider,
                    schema: currentSchema || {},
                    requirements: plannerResult.requirements,
                    rawText: JSON.stringify(result),
                    issues: verification.issues || [],
                    tokenUsage
                });
                tokenUsage = workerCall.tokenUsage;
                result = workerCall.value;
                workerIssues = getOutputIssues({ ...workerCall, validate: validateWorkerResult });
                if (workerIssues.length > 0) throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', workerIssues);
                const repairedMemoryPatch = createMemoryPatch(currentSchema || {}, plannerResult);
                const repairedPatches = repairedMemoryPatch ? [repairedMemoryPatch, ...(result.patches || [])] : (result.patches || []);
                try {
                    appliedProposal = applyFormPatches({ currentSchema: currentSchema || {}, patches: repairedPatches });
                } catch (error) {
                    throw createAIOutputError('I could not create a safe form proposal.', 'FORM_AI_UNSAFE_PROPOSAL', error.issues || []);
                }
                if (onProgress) onProgress({ status: 'verifying', message: 'Verifying the corrected form...' });
                verificationCall = await verifyProposal({
                    provider,
                    requirements: plannerResult.requirements,
                    patches: appliedProposal.patches,
                    tokenUsage
                });
                tokenUsage = verificationCall.tokenUsage;
                verificationIssues = getOutputIssues({ ...verificationCall, validate: validateVerifierResult });
                if (verificationIssues.length > 0 || verificationCall.value.status !== 'pass') {
                    throw createAIOutputError('I could not create a form proposal that follows the request.', 'FORM_AI_UNSAFE_PROPOSAL', verificationIssues.length > 0 ? verificationIssues : verificationCall.value.issues || []);
                }
                verification = verificationCall.value;
            }

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
