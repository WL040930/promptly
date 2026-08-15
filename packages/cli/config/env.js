import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createAIConfig } from './aiConfig.js';
import { normalizeOrigin } from './origin.js';

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

const readIntegerEnv = (key, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const rawValue = process.env[key];
    const value = rawValue === undefined || rawValue === '' ? fallback : Number(rawValue);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${key} must be an integer between ${min} and ${max}.`);
    }
    return value;
};

const readOriginEnv = (key, fallback = null) => normalizeOrigin(process.env[key] || fallback, key);

const dbPoolMax = readIntegerEnv('DB_POOL_MAX', 5, { min: 1, max: 50 });
const dbPoolMin = readIntegerEnv('DB_POOL_MIN', 0, { min: 0, max: dbPoolMax });
const dbPoolAcquireMs = readIntegerEnv('DB_POOL_ACQUIRE_MS', 10_000, { min: 100, max: 300_000 });
const dbPoolIdleMs = readIntegerEnv('DB_POOL_IDLE_MS', 10_000, { min: 1_000, max: 600_000 });
const dbIdleInTransactionTimeoutMs = readIntegerEnv('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 15_000, { min: 1_000, max: 600_000 });

const aiConfig = createAIConfig();

const env = {
    app: {
        port: Number(process.env.PORT || 3000),
        // Browser-facing frontend origin. Used for CORS and post-auth redirects.
        clientOrigin: readOriginEnv('CLIENT_ORIGIN', 'http://localhost:5173'),
        // Public origin that routes provider callbacks and external triggers to the API.
        triggerPublicOrigin: readOriginEnv('TRIGGER_PUBLIC_ORIGIN'),
        // Canonical site origin used by robots.txt and sitemap.xml. This is
        // intentionally independent from the trigger/API origin.
        siteOrigin: readOriginEnv('SITE_URL'),
        slowRequestMs: Number(process.env.PERF_SLOW_REQUEST_MS || 750)
    },
    db: {
        host: requireEnv('DB_HOST'),
        port: readIntegerEnv('DB_PORT', 5432, { min: 1, max: 65_535 }),
        user: requireEnv('DB_USER'),
        password: requireEnv('DB_PASSWORD'),
        database: requireEnv('DB_DATABASE'),
        applicationName: process.env.DB_APPLICATION_NAME || 'promptly-api',
        idleInTransactionTimeoutMs: dbIdleInTransactionTimeoutMs,
        pool: {
            max: dbPoolMax,
            min: dbPoolMin,
            acquire: dbPoolAcquireMs,
            idle: dbPoolIdleMs
        }
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
    nvidia: {
        apiKey: process.env.NVIDIA_API_KEY
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
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    ...aiConfig,
    supabase: {
        url: requireEnv('SUPABASE_URL'),
        anonKey: requireEnv('SUPABASE_ANON_KEY'),
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null
    }
};

export default env;
