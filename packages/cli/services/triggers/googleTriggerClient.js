import { OAuth2Client } from 'google-auth-library';
import User from '../../models/core/User.js';
import Connection from '../../models/core/Connection.js';
import env from '../../config/env.js';

export const getGoogleClientForUser = async userId => {
    const user = await User.findByPk(userId);
    const connection = await Connection.findOne({ where: { userId, provider: 'google', status: 'active' } });
    if (!connection?.accessToken) throw new Error('Google connection is missing or expired.');
    const client = new OAuth2Client(env.google.clientId, env.google.clientSecret);
    client.setCredentials({ access_token: connection.accessToken, refresh_token: connection.refreshToken });
    client.on('tokens', tokens => {
        if (!tokens.access_token && !tokens.refresh_token) return;
        connection.update({
            ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {})
        }).catch(error => console.error('[GoogleTrigger] Failed to persist refreshed token:', error.message));
    });
    return { client, user, connection };
};

export const requirePublicTriggerOrigin = () => {
    if (!env.app.publicOrigin) throw new Error('TRIGGER_PUBLIC_ORIGIN must be configured for external Google triggers.');
    return env.app.publicOrigin.replace(/\/$/, '');
};
