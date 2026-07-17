import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import { fetchWithTimeout } from './requestUtils.js';
import { applyToolOptions, normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';

export class OpenRouterProvider extends BaseAIProvider {
    supportsToolCalls = true;

    constructor() {
        super();
        this.apiKey = env.openrouter.apiKey;
        if (!this.apiKey) {
            console.warn('OpenRouter API key is missing.');
        }
        this.baseUrl = 'https://openrouter.ai/api/v1';
    }

    async generateContent(contents, options = {}) {
        const { systemInstruction, responseMimeType, model = 'openai/gpt-4o-mini' } = options;

        const messages = toChatCompletionMessages(contents, systemInstruction);

        const body = {
            model,
            messages,
        };

        if (responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }
        applyToolOptions(body, options);

        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body)
            }, env.aiTimeoutMs);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const message = data.choices?.[0]?.message || {};
            const text = message.content || '';
            const usage = data.usage;

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
            console.error('OpenRouter Provider Error:', error);
            throw error;
        }
    }
}
