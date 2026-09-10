import { parseAiJson } from '../../../utils/jsonParser.js';
import { createProviderRegistry } from './providerRegistry.js';
import { resolveProviderRoutes } from './routeResolver.js';
import { getTaskPolicy } from './taskPolicies.js';
import { AIError, createBudgetError, normalizeAIError } from './aiErrors.js';
import { shouldFailover } from './retryPolicy.js';
import { runWithProviderLiveness } from './providerLiveness.js';

const defaultLogger = {
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
};

const toUsage = metadata => ({
    promptTokens: metadata?.promptTokenCount || metadata?.prompt_tokens || 0,
    completionTokens: metadata?.candidatesTokenCount || metadata?.completion_tokens || 0,
    thoughtTokens: metadata?.thoughtsTokenCount || 0,
    totalTokens: metadata?.totalTokenCount || metadata?.total_tokens || 0
});

const toProviderResult = response => ({
    text: String(response?.text || ''),
    finishReason: response?.finishReason || null,
    usage: toUsage(response?.usageMetadata || response?.usage),
    toolCalls: Array.isArray(response?.toolCalls) ? response.toolCalls : []
});

const throwIfAborted = signal => {
    if (!signal?.aborted) return;
    throw new AIError('AI request was cancelled.', {
        code: 'AI_CANCELLED',
        category: 'cancelled',
        retryable: false
    });
};

const runWithDeadline = async ({ operation, signal, timeoutMs, execute }) => {
    throwIfAborted(signal);
    const controller = new AbortController();
    let timeout;
    let abortListener;
    let timedOut = false;
    let cancellationPromise = null;

    const abort = reason => {
        if (!controller.signal.aborted) controller.abort(reason);
    };
    if (signal) {
        cancellationPromise = new Promise((_, reject) => {
            abortListener = () => {
                abort(signal.reason);
                reject(new AIError(`${operation} AI request was cancelled.`, {
                    code: 'AI_CANCELLED',
                    category: 'cancelled',
                    retryable: false
                }));
            };
        });
        signal.addEventListener('abort', abortListener, { once: true });
    }

    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            timedOut = true;
            abort(new Error('AI request timed out.'));
            reject(new AIError(`${operation} AI request timed out.`, {
                code: 'AI_TIMEOUT',
                category: 'timeout',
                retryable: true
            }));
        }, timeoutMs);
    });

    try {
        const promises = [execute(controller.signal), timeoutPromise];
        if (cancellationPromise) promises.push(cancellationPromise);
        return await Promise.race(promises);
    } catch (error) {
        if (signal?.aborted && !timedOut) {
            throw new AIError(`${operation} AI request was cancelled.`, {
                code: 'AI_CANCELLED',
                category: 'cancelled',
                retryable: false,
                cause: error
            });
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        if (signal && abortListener) signal.removeEventListener('abort', abortListener);
    }
};

const reserveBudget = ({ budget, task, operation }) => {
    if (!budget) return;
    if (budget.calls >= budget.maxCalls) {
        throw createBudgetError({ task, label: operation, calls: budget.calls, maxCalls: budget.maxCalls });
    }
    budget.calls += 1;
};

export const createAIClient = ({
    registry = createProviderRegistry(),
    logger = defaultLogger,
    profiles = undefined,
    fallbackProviders = undefined,
    fallbackRoutes = undefined,
    providerLiveness = runWithProviderLiveness
} = {}) => {
    const configuredFallbackRoutes = fallbackRoutes ?? (fallbackProviders === undefined ? undefined : []);

    const run = async ({
        task,
        messages,
        systemInstruction,
        tools,
        signal = null,
        operation = task,
        providerOverride = null,
        mode = null,
        maxAttempts = null,
        excludeProviders = [],
        excludeRoutes = [],
        budget = null,
        onActivity = null
    } = {}) => {
        const policy = getTaskPolicy(task, { mode });
        const routes = resolveProviderRoutes(task, {
            registry,
            providerOverride,
            mode,
            maxAttempts,
            excludeProviders,
            excludeRoutes,
            profiles,
            fallbackProviders,
            fallbackRoutes: configuredFallbackRoutes
        });
        let lastError = null;

        for (let index = 0; index < routes.length; index += 1) {
            const route = routes[index];
            const attempt = index + 1;
            reserveBudget({ budget, task, operation });
            onActivity?.({ type: 'provider_attempt', operation, attempt, maxAttempts: routes.length });

            try {
                logger.info('[AI Attempt]', JSON.stringify({
                    task,
                    operation,
                    attempt,
                    maxAttempts: routes.length,
                    provider: route.providerName,
                    model: route.model
                }));

                const rawResponse = await providerLiveness({
                    operation,
                    attempt,
                    maxAttempts: routes.length,
                    provider: route.providerName,
                    model: route.model,
                    onActivity,
                    execute: () => runWithDeadline({
                        operation,
                        signal,
                        timeoutMs: registry.timeoutMs || 30_000,
                        execute: attemptSignal => route.provider.generateContent(messages, {
                            systemInstruction,
                            model: route.model,
                            responseMimeType: policy.responseFormat === 'json' ? 'application/json' : undefined,
                            maxCompletionTokens: policy.maxCompletionTokens,
                            operation,
                            ...(policy.allowTools && Array.isArray(tools) && route.provider.supportsToolCalls === true
                                ? { tools }
                                : {}),
                            signal: attemptSignal,
                            timeoutMs: registry.timeoutMs || 30_000
                        })
                    })
                });

                const result = toProviderResult(rawResponse);
                let json = null;
                if (policy.responseFormat === 'json') {
                    try {
                        json = parseAiJson(result.text, {
                            recoverTruncation: false,
                            // Workflow proposals go through strict semantic validation after
                            // parsing, so recover the one unambiguous missing-comma defect
                            // emitted by some OpenAI-compatible providers.
                            recoverMissingSeparator: task.startsWith('workflow.')
                        });
                    } catch (error) {
                        throw new AIError(`${operation} AI returned invalid JSON.`, {
                            code: 'AI_INVALID_OUTPUT',
                            category: 'invalid_output',
                            retryable: false,
                            task,
                            operation,
                            rawText: result.text,
                            response: { ...result, provider: route.providerName, model: route.model },
                            parserError: error.message
                        });
                    }
                }

                logger.info('[AI Complete]', JSON.stringify({
                    task,
                    operation,
                    attempt,
                    provider: route.providerName,
                    model: route.model,
                    finishReason: result.finishReason,
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens
                }));
                onActivity?.({ type: 'provider_complete', operation, attempt, maxAttempts: routes.length });

                return {
                    ...result,
                    json,
                    usageMetadata: result.usage,
                    provider: route.providerName,
                    model: route.model,
                    attempt
                };
            } catch (error) {
                const normalized = normalizeAIError(error, {
                    task,
                    operation,
                    provider: route.providerName,
                    model: route.model,
                    attempt
                });
                lastError = normalized;

                logger.warn('[AI Failed]', JSON.stringify({
                    task,
                    operation,
                    attempt,
                    provider: route.providerName,
                    model: route.model,
                    category: normalized.category,
                    status: normalized.status || null,
                    retryAfterSeconds: normalized.retryAfterSeconds || null
                }));

                const nextRoute = routes[index + 1];
                if (!shouldFailover({ error: normalized, currentRoute: route, nextRoute })) throw normalized;

                onActivity?.({
                    type: 'provider_fallback', operation, attempt, maxAttempts: routes.length,
                    category: normalized.category
                });

                logger.warn('[AI Fallback]', JSON.stringify({
                    task,
                    operation,
                    reason: normalized.category,
                    from: route.providerName,
                    fromModel: route.model,
                    to: nextRoute.providerName,
                    toModel: nextRoute.model,
                    retryAfterSeconds: normalized.retryAfterSeconds || null
                }));
            }
        }

        throw lastError || new AIError(`${operation} returned no response.`, {
            code: 'AI_ATTEMPTS_EXHAUSTED',
            category: 'unavailable',
            retryable: true,
            task,
            operation
        });
    };

    return Object.freeze({ run });
};

export const ai = createAIClient();
