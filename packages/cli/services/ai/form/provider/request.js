import env from '../../../../config/env.js';
import { getAITaskConfig, getAIProviderRoutesForTask } from '../../core/aiService.js';
import { parseAiJson } from '../../../../utils/jsonParser.js';
import {
    createAIOutputError,
    createProviderTimeoutError,
    createProviderUnavailableError,
    getFinishReason,
    getRetryAfterSeconds,
    isLengthFinishReason,
    isProviderTimeoutError,
    isProviderUnavailableError,
    reserveRequestCall,
    withTimeout
} from '../shared/errors.js';
import {
    getCompletionLimit,
    getFormTask,
    MAX_INVALID_OUTPUT_PREVIEW_LENGTH,
    MAX_PROVIDER_ROUTE_ATTEMPTS
} from '../shared/constants.js';

const logFallback = ({ operation, reason, from, fromModel, to, toModel, retryAfter = undefined }) => {
    console.warn('[AI Provider Fallback]', JSON.stringify({
        operation,
        reason,
        from,
        fromModel,
        to,
        toModel,
        ...(retryAfter ? { retryAfter } : {})
    }));
};

const requestRoutes = ({ provider, model, taskConfig, task }) => provider
    ? [{ provider, providerName: 'custom', model: model || taskConfig.model, suffix: '' }]
    : getAIProviderRoutesForTask(task)
        .slice(0, MAX_PROVIDER_ROUTE_ATTEMPTS)
        .map((route, index) => ({
            provider: route.provider,
            providerName: route.providerName,
            model: route.model,
            suffix: index === 0 ? '' : ' fallback'
        }));

export const getOutputIssues = ({ value, parseError, validate }) => parseError
    ? parseError.issues
    : validate(value);

export const requestJson = async ({ provider, contents, systemInstruction, model, label, budget }) => {
    const task = getFormTask(label);
    const taskConfig = getAITaskConfig(task);
    const attempts = requestRoutes({ provider, model, taskConfig, task });
    let response;
    let lastError = null;

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
            const status = Number(error?.status ?? error?.statusCode);
            const isRateLimited = [429].includes(status)
                || error?.code === 'token_quota_exceeded'
                || error?.code === 'request_quota_exceeded'
                || error?.code === 'FORM_AI_RATE_LIMITED';
            if (isRateLimited) {
                const retryAfter = getRetryAfterSeconds(error);
                if (nextAttempt) {
                    logFallback({
                        operation: `form:${label}`,
                        reason: 'rate_limited',
                        from: attempt.providerName,
                        fromModel: attempt.model,
                        to: nextAttempt.providerName,
                        toModel: nextAttempt.model,
                        retryAfter
                    });
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
            if (isProviderUnavailableError(error)) {
                if (nextAttempt) {
                    logFallback({
                        operation: `form:${label}`,
                        reason: 'provider_unavailable',
                        from: attempt.providerName,
                        fromModel: attempt.model,
                        to: nextAttempt.providerName,
                        toModel: nextAttempt.model
                    });
                    continue;
                }
                throw createProviderUnavailableError(label, error);
            }
            if (!isProviderTimeoutError(error)) throw error;
            if (nextAttempt) {
                logFallback({
                    operation: `form:${label}`,
                    reason: 'timeout',
                    from: attempt.providerName,
                    fromModel: attempt.model,
                    to: nextAttempt.providerName,
                    toModel: nextAttempt.model
                });
                continue;
            }
            throw createProviderTimeoutError(label, error);
        }
    }

    if (lastError) {
        if (isProviderTimeoutError(lastError)) throw createProviderTimeoutError(label, lastError);
        if (isProviderUnavailableError(lastError)) throw createProviderUnavailableError(label, lastError);
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
