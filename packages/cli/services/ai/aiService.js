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

const getDefaultProviderModel = providerName => ({
    gemini: 'gemini-3.5-flash',
    openrouter: 'openai/gpt-4o-mini',
    groq: 'llama3-8b-8192',
    cerebras: 'llama3.1-8b'
}[providerName]);

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

const hasProviderCredentials = providerName => Boolean(env[providerName]?.apiKey);

const addProviderRoute = (routes, seen, route, { required = false } = {}) => {
    const providerName = String(route?.provider || '').trim().toLowerCase();
    const model = String(route?.model || '').trim();
    if (!providerName || !model || (!required && !hasProviderCredentials(providerName))) return;

    const key = `${providerName}:${model}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({ providerName, model, provider: getAIProvider(providerName) });
};

export const getAIProviderRoutesForTask = task => {
    const routes = [];
    const seen = new Set();
    const primary = getAITaskConfig(task);

    // Keep the task route first, then use the other configured tiers as
    // provider/model fallbacks before consulting the explicit provider list.
    addProviderRoute(routes, seen, primary, { required: true });
    for (const tier of ['fast', 'quality', 'default']) addProviderRoute(routes, seen, env.ai.tiers[tier]);

    for (const providerName of env.ai.fallbackProviders || []) {
        const configuredTier = Object.values(env.ai.tiers).find(tier => tier.provider === providerName);
        const model = configuredTier?.model || getDefaultProviderModel(providerName);
        addProviderRoute(routes, seen, { provider: providerName, model });
    }

    return routes;
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
