import {
    createMemoryPatch,
    getActiveQuestionCount,
    getMemoryUpdate
} from '../context/formContext.js';
import { FORM_SETTINGS_KEYS } from '../../../../../shared/formContract.js';
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
import { describeAiOutput, rawOutputPreview, recordAiDiagnostic } from '../../core/diagnosticsLogger.js';

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

const normalizeOptionalSettings = patches => {
    const warnings = [];
    const normalized = [];

    for (const [index, patch] of (Array.isArray(patches) ? patches : []).entries()) {
        if (patch?.op !== 'update_settings' || !patch.updates || typeof patch.updates !== 'object') {
            normalized.push(patch);
            continue;
        }

        const supportedKeys = Object.keys(patch.updates).filter(key => FORM_SETTINGS_KEYS.includes(key));
        const unsupportedKeys = Object.keys(patch.updates).filter(key => !FORM_SETTINGS_KEYS.includes(key));
        if (unsupportedKeys.length === 0) {
            normalized.push(patch);
            continue;
        }

        warnings.push({
            code: 'UNSUPPORTED_SETTINGS_IGNORED',
            path: `patches[${index}].updates`,
            message: `Ignored unsupported optional form settings: ${unsupportedKeys.join(', ')}.`
        });

        if (supportedKeys.length > 0) {
            normalized.push({
                ...patch,
                updates: Object.fromEntries(supportedKeys.map(key => [key, patch.updates[key]]))
            });
        }
    }

    return { patches: normalized, warnings };
};

const hasUsableTitle = value => typeof value === 'string' && value.trim().length > 0;

const ensureTitlePatch = (patches, schema, needsTitlePatch) => {
    if (!needsTitlePatch) return patches;

    let hasTitlePatch = false;
    const normalized = (Array.isArray(patches) ? patches : []).map(patch => {
        if (patch?.op !== 'update_meta') return patch;
        if (hasUsableTitle(patch.updates?.title)) {
            hasTitlePatch = true;
            return patch;
        }
        return {
            ...patch,
            updates: { ...(patch.updates || {}), title: schema.title }
        };
    });

    if (hasTitlePatch) return normalized;
    return [{ op: 'update_meta', updates: { title: schema.title } }, ...normalized];
};

export const recoverWorkerProposal = async ({
    provider,
    schema,
    plannerResult,
    workerContents,
    initialWorkerResult = null,
    tokenUsage,
    onProgress,
    onActivity = null,
    budget,
    cardinality,
    needsTitlePatch = false,
    turnContext = null
}) => {
    const memoryUpdate = getMemoryUpdate(plannerResult);
    let totalTokenUsage = tokenUsage;
    let failure = null;
    let result = null;
    let appliedProposal = null;
    const warnings = [];

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
                budget,
                onActivity
            });
            totalTokenUsage = addTokenUsage(totalTokenUsage, workerCall.response, 'worker');
        } else {
            if (onProgress) onProgress({
                status: 'repairing',
                phase: failure?.stage === 'verifier' ? 'check' : 'draft',
                label: failure?.stage === 'verifier' ? 'Correcting a requirement mismatch' : 'Correcting the form draft',
                message: failure?.stage === 'verifier'
                    ? `Correcting the form changes to match the request (attempt ${attempt + 1} of ${MAX_FORM_REPAIR_LOOPS})...`
                    : `Checking and correcting the form changes (attempt ${attempt + 1} of ${MAX_FORM_REPAIR_LOOPS})...`,
                detail: `${failure?.issues?.length || 1} issue${(failure?.issues?.length || 1) === 1 ? '' : 's'} found in the previous attempt.`
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
                turnContext,
                onActivity
            });
            totalTokenUsage = workerCall.tokenUsage;
        }

        const workerOutput = readWorkerResult(workerCall);
        result = workerOutput.result;
        if (workerOutput.issues.length > 0) {
            await recordAiDiagnostic({
                event: 'worker_output_rejected',
                attempt: attempt + 1,
                kind: workerOutput.kind,
                provider: workerCall.response?.provider || null,
                model: workerCall.response?.model || null,
                finishReason: workerCall.response?.finishReason || null,
                output: describeAiOutput(result),
                rawTextLength: typeof workerCall.rawText === 'string' ? workerCall.rawText.length : 0,
                issues: workerOutput.issues.slice(0, 10).map(issue => ({ code: issue.code, path: issue.path })),
                ...(rawOutputPreview(workerCall.rawText) ? { rawTextPreview: rawOutputPreview(workerCall.rawText) } : {})
            });
            failure = {
                stage: 'worker',
                kind: workerOutput.kind,
                issues: workerOutput.issues,
                rawText: workerCall.rawText || JSON.stringify(result)
            };
            continue;
        }

        if (onProgress) onProgress({
            status: 'checking', phase: 'check', label: 'Checking the form draft',
            message: 'Checking generated form...', detail: `${(result.patches || []).length} proposed change${(result.patches || []).length === 1 ? '' : 's'} are being validated.`
        });
        const memoryPatch = createMemoryPatch(schema, plannerResult);
        const rawPatches = memoryPatch ? [memoryPatch, ...(result.patches || [])] : (result.patches || []);
        const metadataSafePatches = ensureTitlePatch(rawPatches, schema, needsTitlePatch);
        const normalizedSettings = normalizeOptionalSettings(metadataSafePatches);
        warnings.push(...normalizedSettings.warnings);
        try {
            appliedProposal = applyFormPatches({ currentSchema: schema, patches: normalizedSettings.patches });
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
            phase: 'check', label: 'Verifying the requested form rules',
            message: attempt === 0 ? 'Verifying the form instructions...' : 'Verifying the corrected form...',
            detail: `${(plannerResult.requirements || []).length} requested requirement${(plannerResult.requirements || []).length === 1 ? '' : 's'} are being checked.`
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
                onActivity,
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
                warnings,
                tokenUsage: totalTokenUsage
            };
        }
        totalTokenUsage = verificationCall.tokenUsage;

        const verification = verificationCall.value;
        if (verification.status === 'pass') {
            return { result, appliedProposal, verification, warnings, tokenUsage: totalTokenUsage };
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
            warnings,
            tokenUsage: totalTokenUsage
        };
    }

    await recordAiDiagnostic({
        event: 'worker_recovery_exhausted',
        attempts: MAX_FORM_REPAIR_LOOPS,
        stage: failure?.stage || null,
        kind: failure?.kind || null,
        issues: (failure?.issues || []).slice(0, 10).map(issue => ({ code: issue.code, path: issue.path }))
    });
    throw createWorkerRecoveryError(failure);
};
