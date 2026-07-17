import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { applyToolOptions, normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';

export class CerebrasProvider extends BaseAIProvider {
    supportsToolCalls = true;

    constructor() {
        super();
        this.apiKey = env.cerebras.apiKey;
        if (!this.apiKey) {
            console.warn('Cerebras API key is missing.');
        }
        this.client = new Cerebras({
            apiKey: this.apiKey,
            timeout: env.aiTimeoutMs,
            maxRetries: 0,
        });
    }

    async generateContent(contents, options = {}) {
        const {
            systemInstruction,
            responseMimeType,
            model = 'llama3.1-8b',
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

        try {
            const response = await this.client.chat.completions.create(body, {
                timeout: env.aiTimeoutMs,
            });

            const message = response.choices?.[0]?.message || {};
            const text = message.content || '';
            const usage = response.usage;

            return {
                text,
                usageMetadata: usage ? {
                    promptTokenCount: usage.prompt_tokens,
                    candidatesTokenCount: usage.completion_tokens,
                    totalTokenCount: usage.total_tokens
                } : null,
                toolCalls: normalizeToolCalls(message)
            };
        } catch (error) {
            console.error('Cerebras Provider Error:', error);
            throw error;
        }
    }
}
