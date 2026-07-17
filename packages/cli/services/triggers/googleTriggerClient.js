import { OAuth2Client } from 'google-auth-library';
import User from '../../models/core/User.js';
import env from '../../config/env.js';

export const getGoogleClientForUser = async userId => {
    const user = await User.findByPk(userId);
    if (!user?.googleAccessToken) throw new Error('Google connection is missing or expired.');
    const client = new OAuth2Client(env.google.clientId, env.google.clientSecret);
    client.setCredentials({ access_token: user.googleAccessToken, refresh_token: user.googleRefreshToken });
    client.on('tokens', tokens => {
        if (!tokens.access_token && !tokens.refresh_token) return;
        user.update({
            ...(tokens.access_token ? { googleAccessToken: tokens.access_token } : {}),
            ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {})
        }).catch(error => console.error('[GoogleTrigger] Failed to persist refreshed token:', error.message));
    });
    return { client, user };
};

export const requirePublicTriggerOrigin = () => {
    if (!env.app.publicOrigin) throw new Error('TRIGGER_PUBLIC_ORIGIN must be configured for external Google triggers.');
    return env.app.publicOrigin.replace(/\/$/, '');
};
