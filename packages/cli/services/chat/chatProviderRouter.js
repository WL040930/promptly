import env from '../../config/env.js';
import { getAITaskConfig, getAIProviderRoutesForTask } from '../ai/core/aiService.js';

const MAX_CHAT_PROVIDER_ATTEMPTS = 4;

const retryAfterSeconds = error => {
    const value = error?.headers?.['retry-after'] || error?.headers?.get?.('retry-after');
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

export const isRetryableChatProviderError = error => {
    const status = Number(error?.status ?? error?.statusCode);
    return [408, 429, 500, 502, 503, 504].includes(status)
        || error?.code === 'RATE_LIMITED'
        || error?.code === 'request_quota_exceeded'
        || error?.code === 'UNAVAILABLE'
        || /timeout|temporarily unavailable|high demand|too many requests|rate limit/i.test(error?.message || '');
};

export const requestChatCompletionWithFallback = async ({
    contents,
    systemInstruction,
    maxCompletionTokens = env.aiChatMaxCompletionTokens,
    operation = 'chat',
    tools,
    routes = null
} = {}) => {
    const chatTaskConfig = getAITaskConfig('chat');
    const providerRoutes = (routes || getAIProviderRoutesForTask('chat')).slice(0, MAX_CHAT_PROVIDER_ATTEMPTS);
    if (providerRoutes.length === 0) {
        const error = new Error('No AI provider is configured for chat.');
        error.code = 'CHAT_AI_PROVIDER_UNAVAILABLE';
        throw error;
    }

    let lastError = null;
    for (let index = 0; index < providerRoutes.length; index += 1) {
        const route = providerRoutes[index];
        try {
            return await route.provider.generateContent(contents, {
                systemInstruction,
                model: route.model || chatTaskConfig.model,
                maxCompletionTokens,
                operation,
                ...(Array.isArray(tools) && route.provider.supportsToolCalls === true ? { tools } : {})
            });
        } catch (error) {
            lastError = error;
            const nextRoute = providerRoutes[index + 1];
            if (!nextRoute || !isRetryableChatProviderError(error)) throw error;

            console.warn('[AI Provider Fallback]', JSON.stringify({
                operation,
                reason: Number(error?.status ?? error?.statusCode) === 429 ? 'rate_limited' : 'provider_error',
                from: route.providerName || 'unknown',
                fromModel: route.model || chatTaskConfig.model,
                to: nextRoute.providerName || 'unknown',
                toModel: nextRoute.model || chatTaskConfig.model,
                retryAfterSeconds: retryAfterSeconds(error)
            }));
        }
    }

    throw lastError || new Error('Chat AI provider did not return a response.');
};
