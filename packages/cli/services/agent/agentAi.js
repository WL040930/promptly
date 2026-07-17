import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import env from '../../config/env.js';
import { getAIProvider } from '../ai/aiService.js';
import { parseAiJson } from '../../utils/jsonParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructionDir = path.join(__dirname, 'instructions');

const usage = (metadata) => ({
    promptTokens: metadata?.promptTokenCount || metadata?.prompt_tokens || 0,
    completionTokens: metadata?.candidatesTokenCount || metadata?.completion_tokens || 0,
    totalTokens: metadata?.totalTokenCount || metadata?.total_tokens || 0
});

export const requestAgentJson = async ({ label, prompt, instruction, maxCompletionTokens = 1200, provider = getAIProvider() }) => {
    const systemInstruction = instruction || await fs.readFile(path.join(instructionDir, `${label}.md`), 'utf8');
    const response = await provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
        systemInstruction,
        responseMimeType: 'application/json',
        model: env.aiModel,
        maxCompletionTokens
    });
    let value;
    try {
        value = parseAiJson(response.text || '{}');
    } catch (error) {
        const outputError = new Error(`${label} returned invalid JSON.`);
        outputError.code = 'AGENT_INVALID_JSON';
        outputError.issues = [{ code: 'INVALID_JSON', path: label, message: error.message }];
        throw outputError;
    }
    return { value, tokenUsage: usage(response.usageMetadata) };
};

export const addUsage = (...usages) => usages.reduce((total, current = {}) => ({
    promptTokens: total.promptTokens + (current.promptTokens || 0),
    completionTokens: total.completionTokens + (current.completionTokens || 0),
    totalTokens: total.totalTokens + (current.totalTokens || 0)
}), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
