import {
    createMemoryPatch,
    getActiveQuestionCount,
    getMemoryUpdate
} from '../context/formContext.js';
import { applyFormPatches } from '../domain/formPatchEngine.js';
import { validateWorkerResult } from '../domain/formSchemaValidator.js';
import { validateFormProposalScope } from '../domain/formProposalScope.js';
import { workerInstruction } from '../shared/instructions.js';
import {
    createAIOutputError,
    createUnverifiedVerification
} from '../shared/errors.js';
import { getOutputIssues, requestJson } from '../provider/request.js';
import { repairWorker } from './repairs.js';
import { verifyProposalWithRecovery } from './verifier.js';
import { addTokenUsage } from '../shared/usage.js';
import { MAX_FORM_REPAIR_LOOPS } from '../shared/constants.js';

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

const getQuestionCardinalityIssues = ({ schema, cardinality }) => {
    if (!cardinality) return [];

    const actualCount = getActiveQuestionCount(schema);
    if (actualCount === cardinality.targetCount) return [];

    return [{
        code: 'QUESTION_COUNT_MISMATCH',
        path: 'patches',
        message: `The proposal results in ${actualCount} active questions, but the request requires ${cardinality.targetCount} total active questions. Keep ${cardinality.currentCount} existing questions and add ${cardinality.additionalCount} new questions only.`
    }];
};

export const recoverWorkerProposal = async ({
    provider,
    schema,
    plannerResult,
    workerContents,
    initialWorkerResult = null,
    tokenUsage,
    onProgress,
    budget,
    cardinality,
    turnContext = null
}) => {
    const memoryUpdate = getMemoryUpdate(plannerResult);
    let totalTokenUsage = tokenUsage;
    let failure = null;
    let result = null;
    let appliedProposal = null;

    for (let attempt = 0; attempt < MAX_FORM_REPAIR_LOOPS; attempt += 1) {
        let workerCall;
        if (attempt === 0 && initialWorkerResult) {
            workerCall = {
                value: initialWorkerResult,
                rawText: JSON.stringify(initialWorkerResult),
                response: null
            };
        } else if (attempt === 0) {
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
                budget,
                cardinality,
                turnContext
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

        const scopeIssues = validateFormProposalScope({
            scope: turnContext?.scope,
            patches: appliedProposal.patches
        });
        if (scopeIssues.length > 0) {
            failure = {
                stage: 'patch',
                kind: 'invalid_proposal',
                issues: scopeIssues,
                rawText: JSON.stringify(result)
            };
            continue;
        }

        const cardinalityIssues = getQuestionCardinalityIssues({
            schema: appliedProposal.schema,
            cardinality
        });
        if (cardinalityIssues.length > 0) {
            failure = {
                stage: 'patch',
                kind: 'invalid_proposal',
                issues: cardinalityIssues,
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
                cardinality,
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

    if (failure?.stage === 'verifier' && appliedProposal) {
        return {
            result,
            appliedProposal,
            verification: createUnverifiedVerification(budget, 'VERIFICATION_REJECTED', failure.issues),
            tokenUsage: totalTokenUsage
        };
    }

    throw createWorkerRecoveryError(failure);
};
