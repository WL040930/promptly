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

const env = {
    app: {
        port: Number(process.env.PORT || 3000)
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
        redirectUri: requireEnv('GOOGLE_REDIRECT_URI')
    },
    smtp: {
        host: requireEnv('SMTP_HOST'),
        port: Number(requireEnv('SMTP_PORT')),
        user: requireEnv('SMTP_USER'),
        pass: requireEnv('SMTP_PASS'),
        from: requireEnv('SMTP_FROM')
    }
};

export default env;
