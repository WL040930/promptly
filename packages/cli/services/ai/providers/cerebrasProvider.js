import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import { DEFAULT_AI_MODELS } from '../../../config/aiConfig.js';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { applyToolOptions, normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';

export class CerebrasProvider extends BaseAIProvider {
    supportsToolCalls = true;

    constructor({ apiKey = env.cerebras.apiKey, timeoutMs = env.aiTimeoutMs } = {}) {
        super();
        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
        if (!this.apiKey) {
            console.warn('Cerebras API key is missing.');
        }
        this.client = new Cerebras({
            apiKey: this.apiKey,
            timeout: timeoutMs,
            maxRetries: 0,
        });
    }

    async generateContent(contents, options = {}) {
        const {
            systemInstruction,
            responseMimeType,
            model = DEFAULT_AI_MODELS.cerebras,
            maxCompletionTokens
        } = options;

        const messages = toChatCompletionMessages(contents, systemInstruction);

        const body = {
            model,
            messages,
        };

        if (responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }
        if (Number.isInteger(maxCompletionTokens) && maxCompletionTokens > 0) {
            body.max_completion_tokens = maxCompletionTokens;
        }
        applyToolOptions(body, options);

        const response = await this.client.chat.completions.create(body, {
            timeout: this.timeoutMs,
            ...(options.signal ? { signal: options.signal } : {}),
        });

        const choice = response.choices?.[0] || {};
        const message = choice.message || {};
        const text = message.content || '';
        const usage = response.usage;
        const finishReason = choice.finish_reason || choice.finishReason || null;

        return {
            text,
            finishReason,
            usageMetadata: usage ? {
                promptTokenCount: usage.prompt_tokens,
                candidatesTokenCount: usage.completion_tokens,
                totalTokenCount: usage.total_tokens
            } : null,
            toolCalls: normalizeToolCalls(message)
        };
    }
}
