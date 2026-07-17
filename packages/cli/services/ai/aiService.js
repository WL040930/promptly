import env from '../../config/env.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenRouterProvider } from './providers/openRouterProvider.js';
import { GroqProvider } from './providers/groqProvider.js';
import { CerebrasProvider } from './providers/cerebrasProvider.js';

const providerFactories = {
    gemini: () => new GeminiProvider(),
    openrouter: () => new OpenRouterProvider(),
    groq: () => new GroqProvider(),
    cerebras: () => new CerebrasProvider()
};

const providerInstances = new Map();

export const getAITaskConfig = task => {
    const tier = env.ai?.tasks?.[task] || 'default';
    return env.ai.tiers[tier] || env.ai.tiers.default;
};

const getAIProvider = (providerName = env.ai.tiers.default.provider) => {
    if (providerInstances.has(providerName)) return providerInstances.get(providerName);

    const provider = (providerFactories[providerName] || providerFactories.gemini)();
    providerInstances.set(providerName, provider);
    return provider;
};

export const getAIProviderForTask = task => {
    const { provider } = getAITaskConfig(task);
    return getAIProvider(provider);
};

/**
 * Execute an AI prompt for a workflow node.
 */
export const executeNodePrompt = async (prompt, systemInstruction = '') => {
    try {
        const taskConfig = getAITaskConfig('node');
        const provider = getAIProviderForTask('node');
        const response = await provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
            systemInstruction: systemInstruction || 'You are a helpful AI assistant.',
            model: taskConfig.model,
            maxCompletionTokens: env.aiNodeMaxCompletionTokens,
            operation: 'node'
        });
        return response.text;
    } catch (error) {
        console.error('AI Service Error (Node):', error);
        throw error;
    }
};
