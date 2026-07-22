import { Op } from 'sequelize';
import TriggerSubscription from '../../models/triggers/TriggerSubscription.js';
import User from '../../models/core/User.js';
import Connection from '../../models/core/Connection.js';
import env from '../../config/env.js';
import { getGoogleClientForUser } from './googleTriggerClient.js';
import { ingestEvent } from './triggerRuntime.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MESSAGE_HEADERS = ['Subject', 'From', 'To', 'Cc', 'Date', 'Message-ID'];

const headerValue = (headers = [], name) => headers.find(header => header.name?.toLowerCase() === name.toLowerCase())?.value || '';
const decodeBody = value => Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const findBodyParts = part => {
    if (!part) return {};
    if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        return part.body?.data ? { [part.mimeType === 'text/plain' ? 'text' : 'html']: decodeBody(part.body.data) } : {};
    }
    return (part.parts || []).reduce((result, child) => ({ ...result, ...findBodyParts(child) }), {});
};

const messageDetails = (message, includeBody) => {
    const payload = message.payload || {};
    const headers = payload.headers || [];
    const parts = [];
    const collectParts = part => {
        if (!part) return;
        if (part.filename) parts.push({ filename: part.filename, mimeType: part.mimeType, size: part.body?.size || 0, attachmentId: part.body?.attachmentId || null });
        (part.parts || []).forEach(collectParts);
    };
    collectParts(payload);
    return {
        messageId: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds || [],
        internalDate: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
        subject: headerValue(headers, 'Subject'),
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        cc: headerValue(headers, 'Cc'),
        date: headerValue(headers, 'Date'),
        messageIdHeader: headerValue(headers, 'Message-ID'),
        snippet: message.snippet || '',
        attachments: parts,
        ...(includeBody ? findBodyParts(payload) : {})
    };
};

const matches = (config, message) => {
    if (Array.isArray(config.labels) && config.labels.length > 0 && !config.labels.every(label => message.labelIds.includes(label))) return false;
    if (config.fromContains && !message.from.toLowerCase().includes(String(config.fromContains).toLowerCase())) return false;
    if (config.subjectContains && !message.subject.toLowerCase().includes(String(config.subjectContains).toLowerCase())) return false;
    if (config.hasAttachment === true || config.hasAttachment === 'true') return message.attachments.length > 0;
    if (config.hasAttachment === false || config.hasAttachment === 'false') return message.attachments.length === 0;
    return true;
};

const listHistory = async (client, startHistoryId, pageToken) => {
    const params = new URLSearchParams({ startHistoryId: String(startHistoryId), historyTypes: 'messageAdded' });
    if (pageToken) params.set('pageToken', pageToken);
    return client.request({ url: `${GMAIL_API}/history?${params}`, method: 'GET' });
};

const fetchMessage = async (client, messageId, includeBody) => {
    const params = new URLSearchParams({ format: includeBody ? 'full' : 'metadata' });
    if (!includeBody) MESSAGE_HEADERS.forEach(header => params.append('metadataHeaders', header));
    const response = await client.request({ url: `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?${params}`, method: 'GET' });
    return response.data;
};

const processHistory = async ({ subscription, client, historyId, eventId }) => {
    const config = subscription.config || {};
    if (!subscription.cursor) {
        await subscription.update({ cursor: String(historyId), state: { ...(subscription.state || {}), baselineAt: new Date().toISOString() } });
        return 0;
    }

    let pageToken;
    let count = 0;
    const seen = new Set();
    do {
        const response = await listHistory(client, subscription.cursor, pageToken);
        for (const history of response.data.history || []) {
            for (const added of history.messagesAdded || []) {
                const messageId = added.message?.id;
                if (!messageId || seen.has(messageId)) continue;
                seen.add(messageId);
                const includeBody = config.includeBody === true || config.includeBody === 'true';
                const message = messageDetails(await fetchMessage(client, messageId, includeBody), includeBody);
                if (!matches(config, message)) continue;
                await ingestEvent({
                    provider: 'gmail',
                    eventType: 'message.received',
                    externalEventId: `gmail:${messageId}`,
                    payload: { occurredAt: message.internalDate, data: message },
                    subscriptionId: subscription.id,
                    causationId: eventId
                });
                count += 1;
            }
        }
        pageToken = response.data.nextPageToken;
    } while (pageToken);

    await subscription.update({ cursor: String(historyId), lastError: null });
    return count;
};

const watch = async ({ subscription, userId, config }) => {
    if (!env.google.gmailPubSubTopic) throw new Error('GOOGLE_GMAIL_PUBSUB_TOPIC must be configured for email triggers.');
    const { client, user, connection } = await getGoogleClientForUser(userId);
    const response = await client.request({
        url: `${GMAIL_API}/watch`,
        method: 'POST',
        data: {
            topicName: env.google.gmailPubSubTopic,
            ...(Array.isArray(config.labels) && config.labels.length ? { labelIds: config.labels, labelFilterBehavior: 'INCLUDE' } : {})
        }
    });
    await subscription.update({
        externalResourceId: connection?.accountEmail || user.email,
        cursor: subscription.cursor || String(response.data.historyId),
        expiresAt: response.data.expiration ? new Date(Number(response.data.expiration)) : null,
        state: { ...(subscription.state || {}), baselineAt: subscription.state?.baselineAt || new Date().toISOString() }
    });
};

const gmailAdapter = {
    async reconcile({ subscription, userId, config, force = false }) {
        if (!force && subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now() + 60 * 60 * 1000) return;
        await watch({ subscription, userId: userId || subscription.userId, config: config || subscription.config || {} });
    },
    async remove({ subscription }) {
        const remaining = await TriggerSubscription.count({
            where: {
                userId: subscription.userId,
                provider: 'gmail',
                status: 'active',
                id: { [Op.ne]: subscription.id }
            }
        });
        if (remaining > 0) return;
        try {
            const { client } = await getGoogleClientForUser(subscription.userId);
            await client.request({ url: `${GMAIL_API}/stop`, method: 'POST', data: {} });
        } catch (error) {
            if (![401, 404].includes(Number(error.response?.status || error.responseCode))) throw error;
        }
    }
};

export const handleGmailNotification = async body => {
    const encoded = body?.message?.data;
    if (!encoded) throw new Error('Gmail Pub/Sub notification is missing message.data.');
    const notification = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!notification.emailAddress || !notification.historyId) throw new Error('Gmail notification is missing emailAddress or historyId.');
    const connection = await Connection.findOne({ where: { provider: 'google', accountEmail: notification.emailAddress, status: 'active' } });
    if (!connection) return { matched: 0, processed: 0 };
    const user = await User.findByPk(connection.userId);
    if (!user) return { matched: 0, processed: 0 };
    const subscriptions = await TriggerSubscription.findAll({ where: { userId: user.id, provider: 'gmail', status: 'active' } });
    let processed = 0;
    for (const subscription of subscriptions) {
        const { client } = await getGoogleClientForUser(user.id);
        try {
            processed += await processHistory({ subscription, client, historyId: notification.historyId, eventId: body.message.messageId });
        } catch (error) {
            if (Number(error.response?.status || error.responseCode) === 404) {
                await subscription.update({ cursor: String(notification.historyId), lastError: 'Gmail history cursor expired; baseline reset.' });
            } else {
                throw error;
            }
        }
    }
    return { matched: subscriptions.length, processed };
};

export default gmailAdapter;
