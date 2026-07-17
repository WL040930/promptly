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
    aiProvider: process.env.AI_PROVIDER || 'gemini',
    aiModel: process.env.AI_MODEL || (
        process.env.AI_PROVIDER === 'openrouter' ? 'openai/gpt-4o-mini' : 
        process.env.AI_PROVIDER === 'groq' ? 'llama3-8b-8192' : 
        process.env.AI_PROVIDER === 'cerebras' ? 'llama3.1-8b' : 
        'gemini-3.5-flash'
    ),
    aiVerifierModel: process.env.AI_VERIFIER_MODEL || process.env.AI_MODEL || (
        process.env.AI_PROVIDER === 'openrouter' ? 'openai/gpt-4o-mini' :
        process.env.AI_PROVIDER === 'groq' ? 'llama3-8b-8192' :
        process.env.AI_PROVIDER === 'cerebras' ? 'llama3.1-8b' :
        'gemini-3.5-flash'
    ),
    aiTimeoutMs: getAiTimeoutMs(),
    aiMaxCompletionTokens: getOptionalPositiveInteger('AI_MAX_COMPLETION_TOKENS'),
    supabase: {
        url: requireEnv('SUPABASE_URL'),
        anonKey: requireEnv('SUPABASE_ANON_KEY')
    }
};

export default env;
