export class BaseAIProvider {
    supportsToolCalls = false;

    /**
     * Generate content from the model.
     * @param {Array<{role: string, parts: Array<{text: string}>}>} contents - The messages.
     * @param {Object} options - Options including model, systemInstruction, responseMimeType.
     * @returns {Promise<{text: string, finishReason: string|null, usageMetadata: Object}>}
     */
    async generateContent(contents, options) {
        throw new Error('generateContent not implemented');
    }
}
