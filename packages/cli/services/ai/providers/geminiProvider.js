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
    constructor({ apiKey = env.gemini.apiKey, timeoutMs = env.aiTimeoutMs, thinkingLevel = env.aiThinkingLevel } = {}) {
        super();
        if (!apiKey) {
            console.warn('Gemini API key is missing.');
        }
        this.thinkingLevel = thinkingLevel;
        this.ai = new GoogleGenAI({
            apiKey,
            httpOptions: { timeout: timeoutMs },
        });
    }

    async generateContent(contents, options = {}) {
        const {
            systemInstruction,
            responseMimeType,
            model = 'gemini-3.5-flash',
            maxCompletionTokens
        } = options;
        const maxOutputTokens = Number.isInteger(maxCompletionTokens) && maxCompletionTokens > 0
            ? maxCompletionTokens
            : null;
        const thinkingLevel = getThinkingLevel(model, this.thinkingLevel);
        const config = {
            systemInstruction,
            responseMimeType,
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {})
        };
        const response = await this.ai.models.generateContent({
            model,
            contents,
            config
        });

        const usageMetadata = response.usageMetadata;

        return {
            text: response.text,
            finishReason: response.candidates?.[0]?.finishReason || null,
            usageMetadata: usageMetadata ? {
                promptTokenCount: usageMetadata.promptTokenCount,
                candidatesTokenCount: usageMetadata.candidatesTokenCount,
                totalTokenCount: usageMetadata.totalTokenCount,
                thoughtsTokenCount: usageMetadata.thoughtsTokenCount || 0
            } : null
        };
    }
}
