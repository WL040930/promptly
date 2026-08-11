import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ai } from '../ai/index.js';
import { AI_TASKS } from '../ai/core/aiTasks.js';
import { AIError } from '../ai/core/aiErrors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructionDir = path.join(__dirname, 'instructions');

const getAgentTask = label => label === 'intent' ? AI_TASKS.AGENT_INTENT : AI_TASKS.AGENT_PLAN;

export const requestAgentJson = async ({ label, prompt, instruction, provider = null, onActivity = null }) => {
    const systemInstruction = instruction || await fs.readFile(path.join(instructionDir, `${label}.md`), 'utf8');
    try {
        const response = await ai.run({
            task: getAgentTask(label),
            messages: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction,
            operation: `agent:${label}`,
            providerOverride: provider,
            onActivity
        });
        return { value: response.json, tokenUsage: response.usage };
    } catch (error) {
        if (!(error instanceof AIError) || error.code !== 'AI_INVALID_OUTPUT') throw error;
        const outputError = new Error(`${label} returned invalid JSON.`);
        outputError.code = 'AGENT_INVALID_JSON';
        outputError.issues = [{ code: 'INVALID_JSON', path: label, message: error.parserError || error.message }];
        throw outputError;
    }
};

export const addUsage = (...usages) => usages.reduce((total, current = {}) => ({
    promptTokens: total.promptTokens + (current.promptTokens || 0),
    completionTokens: total.completionTokens + (current.completionTokens || 0),
    totalTokens: total.totalTokens + (current.totalTokens || 0)
}), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
