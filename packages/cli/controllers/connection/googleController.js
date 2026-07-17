import { OAuth2Client } from 'google-auth-library';
import User from '../../models/core/User.js';
import env from '../../config/env.js';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const oauth2Client = new OAuth2Client(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
);

const getConnectionsPath = (user) =>
    user?.experienceLevel === 'chat' ? '/chat/dashboard' : '/workflow/dashboard';

const redirectToConnections = (res, params, user = null) => {
    const redirectUrl = new URL(getConnectionsPath(user), env.app.clientOrigin);

    for (const [key, value] of Object.entries(params)) {
        redirectUrl.searchParams.set(key, value);
    }

    return res.redirect(redirectUrl.toString());
};

const googleConnect = async (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.metadata',
            'https://www.googleapis.com/auth/spreadsheets.readonly'
        ],
        state: jwt.sign({
            sub: req.user.id,
            purpose: 'google-oauth',
            nonce: crypto.randomUUID()
        }, env.jwt.secret, { expiresIn: '10m' })
    });

    return res.json({ url });
};

const googleCallback = async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
        return redirectToConnections(res, {
            settings: 'connections',
            error: 'missing_code_or_state'
        });
    }

    let userId;
    try {
        const statePayload = jwt.verify(state, env.jwt.secret);
        if (statePayload.purpose !== 'google-oauth') throw new Error('Invalid OAuth state purpose.');
        userId = statePayload.sub;
    } catch {
        return redirectToConnections(res, { settings: 'connections', error: 'invalid_oauth_state' });
    }
    const user = await User.findByPk(userId);

    if (!user) {
        return redirectToConnections(res, {
            settings: 'connections',
            error: 'user_not_found'
        });
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const response = await oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
        const googleEmail = response.data.email;
        const googleId = response.data.id;

        user.googleId = googleId;
        user.googleEmail = googleEmail;
        user.googleAccessToken = tokens.access_token;
        if (tokens.refresh_token) {
            user.googleRefreshToken = tokens.refresh_token;
        }
        await user.save();

        return redirectToConnections(res, {
            settings: 'connections',
            success: 'true'
        }, user);
    } catch (err) {
        console.error('Google OAuth Error:', err);
        return redirectToConnections(res, {
            settings: 'connections',
            error: 'oauth_failed'
        }, user);
    }
};

const googleDisconnect = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findByPk(userId);
        if (user) {
            user.googleId = null;
            user.googleEmail = null;
            user.googleAccessToken = null;
            user.googleRefreshToken = null;
            await user.save();
        }
        return res.json({ success: true });
    } catch (err) {
        console.error('Google OAuth Disconnect Error:', err);
        return res.status(500).json({ error: 'Failed to disconnect Google account' });
    }
};

export { googleConnect, googleCallback, googleDisconnect };
