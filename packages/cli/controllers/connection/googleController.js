import { OAuth2Client } from 'google-auth-library';
import User from '../../models/core/User.js';
import Connection from '../../models/core/Connection.js';
import env from '../../config/env.js';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import googleConnectionHealthChecker from '../../services/triggers/googleConnectionHealth.js';

const oauth2Client = new OAuth2Client(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
);

const getConnectionsPath = () => '/app/settings/connections';

const safeReturnPath = value => {
    const candidate = String(value || '').trim();
    if (!candidate) return null;
    try {
        const origin = new URL(env.app.clientOrigin).origin;
        const url = new URL(candidate, env.app.clientOrigin);
        if (url.origin !== origin || !url.pathname.startsWith('/app/')) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
};

const tokenExpiryDate = tokens => {
    if (tokens?.expiry_date === null || tokens?.expiry_date === undefined || tokens?.expiry_date === '') return null;
    const timestamp = Number(tokens?.expiry_date);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const getGoogleConnectionStatus = async (req, res) => {
    const connection = await Connection.findOne({ where: { userId: req.user.id, provider: 'google', status: 'active' } });
    const status = await googleConnectionHealthChecker({ userId: req.user.id, connection });
    return res.json(status);
};

const redirectToConnections = (res, params, user = null, returnTo = null) => {
    const redirectUrl = new URL(safeReturnPath(returnTo) || getConnectionsPath(), env.app.clientOrigin);

    for (const [key, value] of Object.entries(params)) {
        redirectUrl.searchParams.set(key, value);
    }

    return res.redirect(redirectUrl.toString());
};

const googleConnect = async (req, res) => {
    const returnTo = safeReturnPath(req.query.returnTo) || getConnectionsPath();
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/forms.body.readonly',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/spreadsheets'
        ],
        state: jwt.sign({
            sub: req.user.id,
            purpose: 'google-oauth',
            nonce: crypto.randomUUID(),
            returnTo
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
    let returnTo = getConnectionsPath();
    try {
        const statePayload = jwt.verify(state, env.jwt.secret);
        if (statePayload.purpose !== 'google-oauth') throw new Error('Invalid OAuth state purpose.');
        userId = statePayload.sub;
        returnTo = safeReturnPath(statePayload.returnTo) || getConnectionsPath();
    } catch {
        return redirectToConnections(res, { settings: 'connections', error: 'invalid_oauth_state' });
    }
    const user = await User.findByPk(userId);

    if (!user) {
        return redirectToConnections(res, {
            settings: 'connections',
            error: 'user_not_found'
        }, null, returnTo);
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const response = await oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
        const googleEmail = response.data.email;
        const googleId = response.data.id;

        const [connection] = await Connection.findOrCreate({
            where: { userId: user.id, provider: 'google', externalAccountId: googleId },
            defaults: {
                accountEmail: googleEmail,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || null,
                tokenExpiresAt: tokenExpiryDate(tokens),
                scopes: tokens.scope ? String(tokens.scope).split(' ') : [],
                status: 'active'
            }
        });
        await connection.update({
            accountEmail: googleEmail,
            accessToken: tokens.access_token || connection.accessToken,
            refreshToken: tokens.refresh_token || connection.refreshToken,
            tokenExpiresAt: tokenExpiryDate(tokens) || connection.tokenExpiresAt,
            scopes: tokens.scope ? String(tokens.scope).split(' ') : connection.scopes,
            status: 'active'
        });

        return redirectToConnections(res, {
            settings: 'connections',
            success: 'true'
        }, user, returnTo);
    } catch (err) {
        console.error('Google OAuth Error:', err);
        return redirectToConnections(res, {
            settings: 'connections',
            error: 'oauth_failed'
        }, user, returnTo);
    }
};

const googleDisconnect = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findByPk(userId);
        if (user) await Connection.update({ status: 'revoked' }, { where: { userId: user.id, provider: 'google', status: 'active' } });
        return res.json({ success: true });
    } catch (err) {
        console.error('Google OAuth Disconnect Error:', err);
        return res.status(500).json({ error: 'Failed to disconnect Google account' });
    }
};

export { googleConnect, googleCallback, googleDisconnect, getGoogleConnectionStatus };
