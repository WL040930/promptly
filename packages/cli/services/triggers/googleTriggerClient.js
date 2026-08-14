import { OAuth2Client } from 'google-auth-library';
import User from '../../models/core/User.js';
import Connection from '../../models/core/Connection.js';
import env from '../../config/env.js';

const expiryTimestamp = value => {
    if (value === null || value === undefined || value === '') return null;
    const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
};

export const googleCredentialsForConnection = connection => ({
    access_token: connection?.accessToken || undefined,
    refresh_token: connection?.refreshToken || undefined,
    ...(expiryTimestamp(connection?.tokenExpiresAt) ? { expiry_date: expiryTimestamp(connection.tokenExpiresAt) } : {})
});

export const connectionPatchForGoogleTokens = tokens => {
    const expiry = expiryTimestamp(tokens?.expiry_date);
    return {
        ...(tokens?.access_token ? { accessToken: tokens.access_token } : {}),
        ...(tokens?.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(expiry ? { tokenExpiresAt: new Date(expiry) } : {})
    };
};

export const createGoogleClientForUser = ({
    models = { User, Connection },
    OAuth2ClientClass = OAuth2Client
} = {}) => async userId => {
    const user = await models.User.findByPk(userId);
    const connection = await models.Connection.findOne({ where: { userId, provider: 'google', status: 'active' } });
    if (!connection?.accessToken) throw new Error('Google connection is missing or expired.');
    const client = new OAuth2ClientClass(env.google.clientId, env.google.clientSecret);
    const credentials = googleCredentialsForConnection(connection);
    client.setCredentials(credentials);
    let tokenWrite = Promise.resolve();
    const persistTokens = tokens => {
        const patch = connectionPatchForGoogleTokens(tokens);
        if (Object.keys(patch).length === 0) return tokenWrite;
        tokenWrite = tokenWrite.catch(() => {}).then(() => connection.update(patch));
        return tokenWrite;
    };
    client.on('tokens', tokens => {
        void persistTokens(tokens).catch(error => console.error('[GoogleTrigger] Failed to persist refreshed token:', error.message));
    });

    // Legacy records were stored before token expiry was persisted. Refreshing
    // them here means OAuth2Client will not treat a provider 403 as a signal to
    // replay a non-idempotent Drive create request.
    if (!credentials.expiry_date && credentials.refresh_token) {
        const tokenWriteBeforeRefresh = tokenWrite;
        try {
            const refreshed = await client.refreshAccessToken();
            if (tokenWrite === tokenWriteBeforeRefresh) await persistTokens(refreshed?.credentials);
            await tokenWrite;
        } catch (error) {
            console.warn('[GoogleTrigger] Could not refresh a legacy Google credential before use:', error.message);
            throw error;
        }
    }
    return { client, user, connection };
};

export const getGoogleClientForUser = createGoogleClientForUser();

export const requirePublicTriggerOrigin = () => {
    if (!env.app.publicOrigin) {
        const error = new Error(
            'External Google triggers need a public HTTPS callback URL. Set TRIGGER_PUBLIC_ORIGIN to the URL of this API (or a local tunnel), restart the backend, and publish again.'
        );
        error.code = 'TRIGGER_PUBLIC_ORIGIN_REQUIRED';
        error.status = 503;
        throw error;
    }
    return env.app.publicOrigin.replace(/\/$/, '');
};
