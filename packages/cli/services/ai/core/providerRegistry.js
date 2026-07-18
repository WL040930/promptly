import env from '../../../config/env.js';
import { GeminiProvider } from '../providers/geminiProvider.js';
import { OpenRouterProvider } from '../providers/openRouterProvider.js';
import { GroqProvider } from '../providers/groqProvider.js';
import { CerebrasProvider } from '../providers/cerebrasProvider.js';

const providerFactories = Object.freeze({
    gemini: options => new GeminiProvider(options),
    openrouter: options => new OpenRouterProvider(options),
    groq: options => new GroqProvider(options),
    cerebras: options => new CerebrasProvider(options)
});

export const DEFAULT_PROVIDER_MODELS = Object.freeze({
    gemini: 'gemini-3.5-flash',
    openrouter: 'openai/gpt-4o-mini',
    groq: 'llama3-8b-8192',
    cerebras: 'llama3.1-8b'
});

export const getDefaultProviderModel = providerName => DEFAULT_PROVIDER_MODELS[providerName];

export const createProviderRegistry = ({ config = env } = {}) => {
    const instances = new Map();
    const get = (providerName = config.ai.tiers.default.provider) => {
        if (instances.has(providerName)) return instances.get(providerName);

        const factory = providerFactories[providerName] || providerFactories.gemini;
        const provider = factory({
            apiKey: config[providerName]?.apiKey,
            timeoutMs: config.aiTimeoutMs,
            thinkingLevel: config.aiThinkingLevel
        });
        instances.set(providerName, provider);
        return provider;
    };

    return Object.freeze({
        get,
        hasCredentials: providerName => Boolean(config[providerName]?.apiKey),
        getDefaultModel: providerName => DEFAULT_PROVIDER_MODELS[providerName],
        timeoutMs: config.aiTimeoutMs
    });
};
