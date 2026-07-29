const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_THINKING_LEVEL = 'minimal';
const DEFAULT_TIMEOUT_MS = 50_000;

export const DEFAULT_AI_MODELS = Object.freeze({
    gemini: 'gemini-3.5-flash',
    nvidia: 'nvidia/nemotron-3-super-120b-a12b',
    openrouter: 'nvidia/nemotron-3-super-120b-a12b:free',
    groq: 'openai/gpt-oss-120b',
    cerebras: 'gpt-oss-120b'
});

export const AI_PROVIDER_NAMES = Object.freeze(Object.keys(DEFAULT_AI_MODELS));

const readString = (source, key) => String(source[key] || '').trim();

const readProvider = (source, key, fallback) =>
    readString(source, key).toLowerCase() || fallback;

const readPositiveInteger = (source, key, fallback = null) => {
    const raw = readString(source, key);
    if (!raw) return fallback;

    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
};

const readBoolean = (source, key, fallback = false) => {
    if (source[key] === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(readString(source, key).toLowerCase());
};

const readThinkingLevel = source => {
    const value = readString(source, 'AI_THINKING_LEVEL').toLowerCase() || DEFAULT_THINKING_LEVEL;
    return ['minimal', 'low', 'medium', 'high'].includes(value) ? value : DEFAULT_THINKING_LEVEL;
};

const defaultModelFor = provider => DEFAULT_AI_MODELS[provider] || DEFAULT_AI_MODELS.gemini;

const readProfile = (source, { providerKey, modelKey, fallbackProvider, fallbackModel = null }) => {
    const provider = readProvider(source, providerKey, fallbackProvider);
    const inheritedModel = typeof fallbackModel === 'function' ? fallbackModel(provider) : fallbackModel;
    const model = readString(source, modelKey) || inheritedModel || defaultModelFor(provider);
    return Object.freeze({ provider, model });
};

const readFallbackProviders = source => Object.freeze([...new Set(
    readString(source, 'AI_FALLBACK_PROVIDERS')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
)]);

/**
 * Builds the complete AI runtime configuration from environment values.
 * The returned shape intentionally preserves the existing env interface so
 * callers do not need to know how defaults and tier inheritance are resolved.
 */
export const createAIConfig = (source = process.env) => {
    const defaultProvider = readProvider(source, 'AI_DEFAULT_PROVIDER', DEFAULT_PROVIDER);
    const defaultProfile = readProfile(source, {
        providerKey: 'AI_DEFAULT_PROVIDER',
        modelKey: 'AI_DEFAULT_MODEL',
        fallbackProvider: defaultProvider
    });
    const fastProfile = readProfile(source, {
        providerKey: 'AI_FAST_PROVIDER',
        modelKey: 'AI_FAST_MODEL',
        fallbackProvider: defaultProfile.provider
    });
    const qualityProfile = readProfile(source, {
        providerKey: 'AI_QUALITY_PROVIDER',
        modelKey: 'AI_QUALITY_MODEL',
        fallbackProvider: defaultProfile.provider,
        fallbackModel: qualityProvider => qualityProvider === defaultProfile.provider
            ? defaultProfile.model
            : null
    });

    const tiers = Object.freeze({
        default: defaultProfile,
        fast: fastProfile,
        quality: qualityProfile
    });

    return Object.freeze({
        ai: Object.freeze({
            tiers,
            fallbackProviders: readFallbackProviders(source)
        }),
        aiThinkingLevel: readThinkingLevel(source),
        aiNvidiaReasoningBudget: readPositiveInteger(source, 'NVIDIA_REASONING_BUDGET', 16_384),
        aiNvidiaEnableThinking: readBoolean(source, 'NVIDIA_ENABLE_THINKING', true),
        aiTimeoutMs: readPositiveInteger(source, 'AI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
        aiUnlimitedCompletionTokens: readBoolean(source, 'AI_UNLIMITED_COMPLETION_TOKENS'),
        aiMaxCompletionTokens: readPositiveInteger(source, 'AI_MAX_COMPLETION_TOKENS'),
        aiFormUnlimitedCompletionTokens: readBoolean(source, 'AI_FORM_UNLIMITED_COMPLETION_TOKENS'),
        aiWorkflowUnlimitedCompletionTokens: readBoolean(source, 'AI_WORKFLOW_UNLIMITED_COMPLETION_TOKENS'),
        aiChatMaxToolLoops: readPositiveInteger(source, 'AI_CHAT_MAX_TOOL_LOOPS', 8),
        aiAgentMaxActions: readPositiveInteger(source, 'AI_AGENT_MAX_ACTIONS', 8),
        aiAgentMaxReplans: readPositiveInteger(source, 'AI_AGENT_MAX_REPLANS', 1)
    });
};
