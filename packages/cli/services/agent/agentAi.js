import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import env from '../../config/env.js';
import { getAITaskConfig, getAIProviderRoutesForTask } from '../ai/core/aiService.js';
import { parseAiJson } from '../../utils/jsonParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructionDir = path.join(__dirname, 'instructions');
const MAX_PROVIDER_ATTEMPTS = 4;

const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        const timeout = new Error(`${label} AI request timed out.`);
        timeout.code = 'AGENT_PROVIDER_TIMEOUT';
        reject(timeout);
    }, timeoutMs);
    Promise.resolve(promise).then(
        value => {
            clearTimeout(timer);
            resolve(value);
        },
        error => {
            clearTimeout(timer);
            reject(error);
        }
    );
});

const usage = (metadata) => ({
    promptTokens: metadata?.promptTokenCount || metadata?.prompt_tokens || 0,
    completionTokens: metadata?.candidatesTokenCount || metadata?.completion_tokens || 0,
    totalTokens: metadata?.totalTokenCount || metadata?.total_tokens || 0
});

export const requestAgentJson = async ({ label, prompt, instruction, maxCompletionTokens = 1200, provider = null }) => {
    const systemInstruction = instruction || await fs.readFile(path.join(instructionDir, `${label}.md`), 'utf8');
    const task = ['intent', 'plan'].includes(label) ? label : 'plan';
    const taskConfig = getAITaskConfig(task);
    const routes = provider
        ? [{ provider, model: taskConfig.model }]
        : getAIProviderRoutesForTask(task).slice(0, MAX_PROVIDER_ATTEMPTS);
    if (routes.length === 0) {
        const error = new Error(`${label} has no configured AI provider.`);
        error.code = 'AGENT_PROVIDER_UNAVAILABLE';
        throw error;
    }

    let response;
    let lastError;
    for (const [index, route] of routes.entries()) {
        try {
            const request = route.provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
                systemInstruction,
                responseMimeType: 'application/json',
                model: route.model,
                maxCompletionTokens,
                operation: `agent:${label}`
            });
            response = await withTimeout(request, env.aiTimeoutMs, label);
            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            const status = Number(error?.status ?? error?.statusCode);
            const retryable = [408, 429, 500, 502, 503, 504].includes(status)
                || error?.code === 'AGENT_PROVIDER_TIMEOUT'
                || error?.code === 'UNAVAILABLE'
                || /timeout|temporarily unavailable|high demand/i.test(error?.message || '');
            if (!retryable || index === routes.length - 1) throw error;
        }
    }
    if (lastError || !response) throw lastError || new Error(`${label} returned no response.`);
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
