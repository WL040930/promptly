import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import { fetchWithTimeout } from './requestUtils.js';

export class OpenRouterProvider extends BaseAIProvider {
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

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }

        // Map Gemini style contents to OpenAI style messages
        for (const content of contents) {
            // handle string or object format
            if (typeof content === 'string') {
                messages.push({ role: 'user', content });
                continue;
            }
            
            const role = content.role === 'model' ? 'assistant' : 'user';
            const text = Array.isArray(content.parts) ? content.parts.map(p => p.text).join('\n') : content.parts || '';
            messages.push({ role, content: text });
        }

        const body = {
            model,
            messages,
        };

        if (responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }

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
            const text = data.choices?.[0]?.message?.content || '';
            const usage = data.usage;

            return {
                text,
                usageMetadata: usage ? {
                    promptTokenCount: usage.prompt_tokens,
                    candidatesTokenCount: usage.completion_tokens,
                    totalTokenCount: usage.total_tokens
                } : null
            };
        } catch (error) {
            console.error('OpenRouter Provider Error:', error);
            throw error;
        }
    }
}
