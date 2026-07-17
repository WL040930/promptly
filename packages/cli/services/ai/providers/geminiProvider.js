import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';

export class GeminiProvider extends BaseAIProvider {
    constructor() {
        super();
        const apiKey = env.gemini.apiKey;
        if (!apiKey) {
            console.warn('Gemini API key is missing.');
        }
        this.ai = new GoogleGenAI({
            apiKey,
            httpOptions: { timeout: env.aiTimeoutMs },
        });
    }

    async generateContent(contents, options = {}) {
        const { systemInstruction, responseMimeType, model = 'gemini-3.5-flash' } = options;
        
        try {
            const response = await this.ai.models.generateContent({
                model,
                contents,
                config: {
                    systemInstruction,
                    responseMimeType,
                }
            });

            return {
                text: response.text,
                usageMetadata: response.usageMetadata ? {
                    promptTokenCount: response.usageMetadata.promptTokenCount,
                    candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
                    totalTokenCount: response.usageMetadata.totalTokenCount
                } : null
            };
        } catch (error) {
            console.error('Gemini Provider Error:', error);
            throw error;
        }
    }
}
