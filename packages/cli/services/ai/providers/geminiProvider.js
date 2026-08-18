import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { BaseAIProvider } from './baseProvider.js';
import env from '../../../config/env.js';

const getThinkingLevel = (model, configuredLevel) => {
    if (!/^gemini-3/i.test(String(model || ''))) return null;

    const key = String(configuredLevel || 'minimal').toUpperCase();
    return ThinkingLevel[key] || ThinkingLevel.MINIMAL;
};

const textFromParts = parts => Array.isArray(parts)
    ? parts.map(part => part?.text || '').filter(Boolean).join('\n')
    : String(parts || '');

const serializeToolCall = call => {
    if (!call?.name) return '';
    return `<TOOL>${JSON.stringify({ name: call.name, args: call.args || {} })}</TOOL>`;
};

/**
 * Gemini's generateContent API accepts Content objects with `parts` and only
 * supports `user`/`model` roles here. The chat service also uses the
 * OpenAI-compatible `tool`/`content` shape for providers that support native
 * function calling. Render those events as the textual fallback protocol so
 * sessions can safely continue on Gemini or after provider failover.
 */
export const toGeminiContents = contents => (contents || []).flatMap(content => {
    if (typeof content === 'string') {
        return [{ role: 'user', parts: [{ text: content }] }];
    }

    if (content?.role === 'tool') {
        const response = content.content ?? textFromParts(content.parts);
        return [{
            role: 'user',
            parts: [{ text: `<TOOL_RESPONSE>${response}</TOOL_RESPONSE>` }]
        }];
    }

    const role = content?.role === 'model' ? 'model' : 'user';
    const text = textFromParts(content?.parts);
    const toolCalls = Array.isArray(content?.toolCalls)
        ? content.toolCalls.map(serializeToolCall).filter(Boolean)
        : [];
    const combinedText = [text, ...toolCalls].filter(Boolean).join('\n');

    return combinedText ? [{ role, parts: [{ text: combinedText }] }] : [];
});

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
            model = 'gemini-3.5-flash-lite',
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
            contents: toGeminiContents(contents),
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
