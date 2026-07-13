import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';
import Cerebras from '@cerebras/cerebras_cloud_sdk';

export class CerebrasProvider extends BaseAIProvider {
    constructor() {
        super();
        this.apiKey = env.cerebras.apiKey;
        if (!this.apiKey) {
            console.warn('Cerebras API key is missing.');
        }
        this.client = new Cerebras({
            apiKey: this.apiKey,
        });
    }

    async generateContent(contents, options = {}) {
        const { systemInstruction, responseMimeType, model = 'llama3.1-8b' } = options;

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }

        // Map Gemini style contents to OpenAI style messages
        for (const content of contents) {
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
            const response = await this.client.chat.completions.create(body);

            const text = response.choices?.[0]?.message?.content || '';
            const usage = response.usage;

            return {
                text,
                usageMetadata: usage ? {
                    promptTokenCount: usage.prompt_tokens,
                    candidatesTokenCount: usage.completion_tokens,
                    totalTokenCount: usage.total_tokens
                } : null
            };
        } catch (error) {
            console.error('Cerebras Provider Error:', error);
            throw error;
        }
    }
}
