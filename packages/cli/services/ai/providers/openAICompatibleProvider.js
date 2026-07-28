import { BaseAIProvider } from './baseProvider.js';
import { fetchWithTimeout } from './requestUtils.js';
import { applyToolOptions, normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';
import env from '../../../config/env.js';

/**
 * Shared adapter for providers that expose the OpenAI chat-completions shape.
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
    supportsToolCalls = true;

    constructor({ apiKey, baseUrl, displayName, defaultModel, timeoutMs = env.aiTimeoutMs, requestBodyExtras = null }) {
        super();
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.displayName = displayName;
        this.defaultModel = defaultModel;
        this.timeoutMs = timeoutMs;
        this.requestBodyExtras = requestBodyExtras;

        if (!this.apiKey) {
            console.warn(`${this.displayName} API key is missing.`);
        }
    }

    async generateContent(contents, options = {}) {
        const {
            systemInstruction,
            responseMimeType,
            model = this.defaultModel,
            maxCompletionTokens
        } = options;

        const body = {
            model,
            messages: toChatCompletionMessages(contents, systemInstruction),
            ...(typeof this.requestBodyExtras === 'function' ? this.requestBodyExtras(options) : this.requestBodyExtras || {})
        };

        if (responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }
        if (Number.isInteger(maxCompletionTokens) && maxCompletionTokens > 0) {
            body.max_tokens = maxCompletionTokens;
        }
        applyToolOptions(body, options);

        const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: options.signal
        }, options.timeoutMs || this.timeoutMs);

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`${this.displayName} API Error: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.headers = response.headers;
            throw error;
        }

        const data = await response.json();
        const choice = data.choices?.[0] || {};
        const message = choice.message || {};
        const usage = data.usage;

        return {
            text: message.content || '',
            finishReason: choice.finish_reason || choice.finishReason || null,
            usageMetadata: usage ? {
                promptTokenCount: usage.prompt_tokens,
                candidatesTokenCount: usage.completion_tokens,
                totalTokenCount: usage.total_tokens
            } : null,
            toolCalls: normalizeToolCalls(message)
        };
    }
}
