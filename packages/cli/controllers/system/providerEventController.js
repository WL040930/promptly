import { OAuth2Client } from 'google-auth-library';
import env from '../../config/env.js';
import { handleGmailNotification } from '../../services/triggers/gmailTriggerAdapter.js';
import { handleGoogleDriveNotification } from '../../services/triggers/googleSheetsTriggerAdapter.js';

const verifyPubSubRequest = async req => {
    const audience = env.google.pubSubAudience;
    if (!audience) {
        if (process.env.NODE_ENV === 'production') throw new Error('GOOGLE_PUBSUB_AUDIENCE must be configured in production.');
        return;
    }
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new Error('Missing Pub/Sub bearer token.');
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: match[1], audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) throw new Error('Pub/Sub token is not verified.');
};

export const handleGmailProviderEvent = async (req, res) => {
    try {
        await verifyPubSubRequest(req);
        await handleGmailNotification(req.body);
        return res.status(204).end();
    } catch (error) {
        console.error('[ProviderEvent] Gmail notification failed:', error.message);
        return res.status(500).json({ error: 'Notification processing failed.' });
    }
};

export const handleGoogleDriveProviderEvent = async (req, res) => {
    try {
        await handleGoogleDriveNotification(req.headers);
        return res.status(204).end();
    } catch (error) {
        console.error('[ProviderEvent] Google Drive notification failed:', error.message);
        return res.status(500).json({ error: 'Notification processing failed.' });
    }
};
