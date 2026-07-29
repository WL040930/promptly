import { ai } from '../../index.js';
import { AI_TASKS } from '../../core/aiTasks.js';
import { AIError } from '../../core/aiErrors.js';
import {
    createAIOutputError,
    createProviderTimeoutError,
    createProviderUnavailableError
} from '../shared/errors.js';
import { getFormTask } from '../shared/constants.js';
import { rawOutputPreview, recordAiDiagnostic } from '../../core/diagnosticsLogger.js';

const operationName = label => `form:${label}`;

export const getOutputIssues = ({ value, parseError, validate }) => parseError
    ? parseError.issues
    : validate(value);

const createInvalidJsonResult = async ({ label, error }) => {
    const response = error.response || null;
    const rawText = typeof error.rawText === 'string' ? error.rawText : '';
    const finishReason = response?.finishReason || null;

    if (!rawText.trim()) {
        const parseError = createAIOutputError(`${label} AI returned an empty response.`, `FORM_AI_INVALID_${label.toUpperCase()}_JSON`, [{
            code: 'EMPTY_RESPONSE',
            path: '',
            message: 'The AI provider returned no JSON content.'
        }]);
        await recordAiDiagnostic({
            event: 'output_invalid_json',
            stage: label,
            responseType: 'empty',
            rawTextLength: 0,
            finishReason
        });
        return { response, rawText, parseError };
    }

    const truncated = ['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS']
        .includes(String(finishReason || '').toUpperCase());
    const outputIssue = truncated
        ? {
            code: 'OUTPUT_TRUNCATED',
            path: '',
            message: 'The AI response reached its output limit before returning complete JSON.'
        }
        : {
            code: 'INVALID_JSON',
            path: '',
            message: error.parserError || error.message
        };
    await recordAiDiagnostic({
        event: 'output_invalid_json',
        stage: label,
        rawTextLength: rawText.length,
        finishReason,
        parserError: error.parserError || error.message,
        ...(rawOutputPreview(rawText) ? { rawTextPreview: rawOutputPreview(rawText) } : {})
    });

    return {
        response,
        rawText,
        parseError: createAIOutputError(
            truncated ? `${label} AI response was truncated before complete JSON was returned.` : `${label} AI returned invalid JSON.`,
            `FORM_AI_INVALID_${label.toUpperCase()}_JSON`,
            [outputIssue]
        )
    };
};

const normalizeProviderError = (label, error) => {
    if (error?.code === 'AI_BUDGET_EXCEEDED') {
        return createAIOutputError(
            'I could not complete the form safely within the AI request budget. No changes were applied. Please try again with a smaller request.',
            'FORM_AI_BUDGET_EXCEEDED',
            [{ code: 'CALL_BUDGET_EXCEEDED', path: label, message: `Maximum ${error.maxCalls} AI calls reached.` }]
        );
    }
    if (error?.category === 'rate_limited') {
        const retryAfter = error.retryAfterSeconds;
        const message = retryAfter
            ? `AI provider rate limit reached. Tried all configured providers. Try again in ${retryAfter} seconds.`
            : 'AI provider rate limit reached. Tried all configured providers. Please try again shortly.';
        return createAIOutputError(message, 'FORM_AI_RATE_LIMITED', [{
            code: 'RATE_LIMITED',
            path: label,
            message
        }]);
    }
    if (error?.category === 'timeout') return createProviderTimeoutError(label, error);
    if (['unavailable', 'network'].includes(error?.category)) return createProviderUnavailableError(label, error);
    if (error?.code === 'AI_ROUTE_UNAVAILABLE') return createProviderUnavailableError(label, error);
    return error;
};

export const requestJson = async ({ provider, contents, systemInstruction, label, budget, onActivity = null }) => {
    const task = getFormTask(label);
    try {
        const response = await ai.run({
            task,
            messages: contents,
            systemInstruction,
            operation: operationName(label),
            providerOverride: provider,
            budget,
            onActivity
        });
        return { value: response.json, response, rawText: response.text };
    } catch (error) {
        const normalized = normalizeProviderError(label, error);
        if (normalized instanceof AIError && normalized.code === 'AI_INVALID_OUTPUT') {
            return createInvalidJsonResult({ label, error: normalized });
        }
        throw normalized;
    }
};
