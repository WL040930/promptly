import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';

const supportsThinkingLevel = model => /^(?:gemma-4|gemini-3)/i.test(String(model || ''));

const getThinkingLevel = (model, configuredLevel) => {
    if (!supportsThinkingLevel(model)) return null;

    // Gemma 4 supports thinking as an on/off switch. Keep interactive work off
    // by default while still allowing an explicit high setting for complex work.
    if (/^gemma-4/i.test(String(model))) {
        return configuredLevel === 'minimal' ? ThinkingLevel.MINIMAL : ThinkingLevel.HIGH;
    }

    const key = String(configuredLevel || 'minimal').toUpperCase();
    return ThinkingLevel[key] || ThinkingLevel.MINIMAL;
};

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
        const {
            systemInstruction,
            responseMimeType,
            model = 'gemini-3.5-flash',
            maxCompletionTokens,
            operation = 'unknown'
        } = options;
        const maxOutputTokens = Number.isInteger(maxCompletionTokens) && maxCompletionTokens > 0
            ? maxCompletionTokens
            : null;
        const thinkingLevel = getThinkingLevel(model, env.aiThinkingLevel);
        const config = {
            systemInstruction,
            responseMimeType,
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {})
        };
        const startedAt = Date.now();
        
        try {
            const response = await this.ai.models.generateContent({
                model,
                contents,
                config
            });

            const usageMetadata = response.usageMetadata;
            console.info('[AI Performance]', JSON.stringify({
                operation,
                provider: 'gemini',
                model,
                elapsedMs: Date.now() - startedAt,
                maxOutputTokens,
                thinkingLevel: thinkingLevel || null,
                promptTokens: usageMetadata?.promptTokenCount || 0,
                completionTokens: usageMetadata?.candidatesTokenCount || 0,
                totalTokens: usageMetadata?.totalTokenCount || 0,
                thoughtTokens: usageMetadata?.thoughtsTokenCount || 0
            }));

            return {
                text: response.text,
                usageMetadata: usageMetadata ? {
                    promptTokenCount: usageMetadata.promptTokenCount,
                    candidatesTokenCount: usageMetadata.candidatesTokenCount,
                    totalTokenCount: usageMetadata.totalTokenCount,
                    thoughtsTokenCount: usageMetadata.thoughtsTokenCount || 0
                } : null
            };
        } catch (error) {
            console.warn('[AI Performance]', JSON.stringify({
                operation,
                provider: 'gemini',
                model,
                elapsedMs: Date.now() - startedAt,
                maxOutputTokens,
                thinkingLevel: thinkingLevel || null,
                status: error?.status || error?.statusCode || null,
                error: error?.code || error?.name || 'provider_error'
            }));
            console.error('Gemini Provider Error:', error);
            throw error;
        }
    }
}
