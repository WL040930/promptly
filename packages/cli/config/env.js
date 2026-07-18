import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const requireEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var: ${key}`);
    }
    return value;
};

const getJwtSecret = () => {
    const secret = requireEnv('JWT_SECRET');
    if (secret.trim().length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters.');
    }
    return secret;
};

const getAiTimeoutMs = () => {
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 30000);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
};

const getOptionalPositiveInteger = (key) => {
    if (!process.env[key]) return null;
    const value = Number(process.env[key]);
    return Number.isInteger(value) && value > 0 ? value : null;
};

const getBoolean = (key, fallback = false) => {
    if (process.env[key] === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[key]).trim().toLowerCase());
};

// These are fallback safeguards when provider-managed form completion is disabled.
// Keep them internal so the environment only exposes the intentional mode switch.
const FORM_COMPLETION_LIMITS = Object.freeze({
    planner: 1800,
    'planner repair': 2200,
    worker: 3072,
    'worker repair': 3072,
    verifier: 768,
    'verifier repair': 1024
});

const getAiThinkingLevel = () => {
    const value = String(process.env.AI_THINKING_LEVEL || 'minimal').trim().toLowerCase();
    return ['minimal', 'low', 'medium', 'high'].includes(value) ? value : 'minimal';
};

const supportedAiProviders = new Set(['gemini', 'openrouter', 'groq', 'cerebras']);

const normalizeAiProvider = value => {
    const normalized = String(value || '').trim().toLowerCase();
    return supportedAiProviders.has(normalized) ? normalized : 'gemini';
};

const getAiFallbackProviders = () => [...new Set(
    String(process.env.AI_FALLBACK_PROVIDERS || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(value => supportedAiProviders.has(value))
)];

const getDefaultAiModel = provider => {
    if (provider === 'openrouter') return 'openai/gpt-4o-mini';
    if (provider === 'groq') return 'llama3-8b-8192';
    if (provider === 'cerebras') return 'llama3.1-8b';
    return 'gemini-3.5-flash';
};

const configuredProvider = normalizeAiProvider(process.env.AI_DEFAULT_PROVIDER || 'gemini');
const defaultAiModel = process.env.AI_DEFAULT_MODEL || getDefaultAiModel(configuredProvider);
const fastProvider = normalizeAiProvider(process.env.AI_FAST_PROVIDER || configuredProvider);
const qualityProvider = normalizeAiProvider(process.env.AI_QUALITY_PROVIDER || configuredProvider);
const fastModel = process.env.AI_FAST_MODEL || getDefaultAiModel(fastProvider);
const qualityModel = process.env.AI_QUALITY_MODEL || (
    qualityProvider === configuredProvider ? defaultAiModel : getDefaultAiModel(qualityProvider)
);

const getAiTaskTier = (key, fallback) => {
    const value = String(process.env[`AI_TASK_${key}`] || fallback).trim().toLowerCase();
    return ['default', 'fast', 'quality'].includes(value) ? value : fallback;
};

const aiTiers = {
    default: { provider: configuredProvider, model: defaultAiModel },
    fast: { provider: fastProvider, model: fastModel },
    quality: { provider: qualityProvider, model: qualityModel }
};

const aiTasks = {
    chat: getAiTaskTier('CHAT', 'fast'),
    intent: getAiTaskTier('INTENT', 'fast'),
    plan: getAiTaskTier('PLAN', 'fast'),
    formPlanner: getAiTaskTier('FORM_PLANNER', 'fast'),
    formWorker: getAiTaskTier('FORM_WORKER', 'quality'),
    formVerifier: getAiTaskTier('FORM_VERIFIER', 'fast'),
    workflowClassifier: getAiTaskTier('WORKFLOW_CLASSIFIER', 'fast'),
    workflowAssembler: getAiTaskTier('WORKFLOW_ASSEMBLER', 'quality'),
    workflowPatcher: getAiTaskTier('WORKFLOW_PATCHER', 'quality'),
    node: getAiTaskTier('NODE', 'quality')
};

const env = {
    app: {
        port: Number(process.env.PORT || 3000),
        clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
        publicOrigin: process.env.TRIGGER_PUBLIC_ORIGIN || null
    },
    db: {
        host: requireEnv('DB_HOST'),
        port: Number(process.env.DB_PORT || 5432),
        user: requireEnv('DB_USER'),
        password: requireEnv('DB_PASSWORD'),
        database: requireEnv('DB_DATABASE')
    },
    jwt: {
        secret: getJwtSecret(),
        expiresIn: process.env.JWT_EXPIRES_IN || '90d'
    },
    google: {
        clientId: requireEnv('GOOGLE_CLIENT_ID'),
        clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
        redirectUri: requireEnv('GOOGLE_REDIRECT_URI'),
        gmailPubSubTopic: process.env.GOOGLE_GMAIL_PUBSUB_TOPIC || null,
        pubSubAudience: process.env.GOOGLE_PUBSUB_AUDIENCE || null
    },
    smtp: {
        host: requireEnv('SMTP_HOST'),
        port: Number(requireEnv('SMTP_PORT')),
        user: requireEnv('SMTP_USER'),
        pass: requireEnv('SMTP_PASS'),
        from: requireEnv('SMTP_FROM')
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY
    },
    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY
    },
    groq: {
        apiKey: process.env.GROQ_API_KEY
    },
    cerebras: {
        apiKey: process.env.CEREBRAS_API_KEY
    },
    ai: {
        tiers: aiTiers,
        tasks: aiTasks,
        fallbackProviders: getAiFallbackProviders()
    },
    aiThinkingLevel: getAiThinkingLevel(),
    aiTimeoutMs: getAiTimeoutMs(),
    aiFormUnlimitedCompletionTokens: getBoolean('AI_FORM_UNLIMITED_COMPLETION_TOKENS'),
    aiFormCompletionLimits: FORM_COMPLETION_LIMITS,
    aiChatMaxCompletionTokens: getOptionalPositiveInteger('AI_CHAT_MAX_COMPLETION_TOKENS') || 700,
    aiWorkflowMaxCompletionTokens: getOptionalPositiveInteger('AI_WORKFLOW_MAX_COMPLETION_TOKENS') || 1200,
    aiNodeMaxCompletionTokens: getOptionalPositiveInteger('AI_NODE_MAX_COMPLETION_TOKENS') || 1000,
    supabase: {
        url: requireEnv('SUPABASE_URL'),
        anonKey: requireEnv('SUPABASE_ANON_KEY')
    }
};

export default env;
