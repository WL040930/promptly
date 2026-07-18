import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import { fetchWithTimeout } from './requestUtils.js';
import { applyToolOptions, normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';

export class GroqProvider extends BaseAIProvider {
    supportsToolCalls = true;

    constructor() {
        super();
        this.apiKey = env.groq.apiKey;
        if (!this.apiKey) {
            console.warn('Groq API key is missing.');
        }
        this.baseUrl = 'https://api.groq.com/openai/v1';
    }

    async generateContent(contents, options = {}) {
        const { systemInstruction, responseMimeType, model = 'llama3-8b-8192' } = options;

        const messages = toChatCompletionMessages(contents, systemInstruction);

        const body = {
            model,
            messages,
        };

        if (responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }
        if (Number.isInteger(options.maxCompletionTokens) && options.maxCompletionTokens > 0) {
            body.max_tokens = options.maxCompletionTokens;
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
                const error = new Error(`Groq API Error: ${response.status} - ${errorText}`);
                error.status = response.status;
                error.headers = response.headers;
                throw error;
            }

            const data = await response.json();
            const choice = data.choices?.[0] || {};
            const message = choice.message || {};
            const text = message.content || '';
            const usage = data.usage;

            return {
                text,
                finishReason: choice.finish_reason || choice.finishReason || null,
                usageMetadata: usage ? {
                    promptTokenCount: usage.prompt_tokens,
                    candidatesTokenCount: usage.completion_tokens,
                    totalTokenCount: usage.total_tokens
                } : null,
                toolCalls: normalizeToolCalls(message)
            };
        } catch (error) {
            console.error('Groq Provider Error:', error);
            throw error;
        }
    }
}
