import crypto from 'node:crypto';
import TriggerSubscription from '../../models/triggers/TriggerSubscription.js';
import { getGoogleClientForUser, requirePublicTriggerOrigin } from './googleTriggerClient.js';
import { ingestEvent } from './triggerRuntime.js';
import { stableRowFingerprint } from './triggerContracts.js';
import env from '../../config/env.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const channelToken = subscriptionId => crypto.createHmac('sha256', env.jwt.secret).update(subscriptionId).digest('hex');
const spreadsheetId = config => {
    const value = String(config?.spreadsheetId || '').trim();
    if (!/^[a-zA-Z0-9_-]{20,200}$/.test(value)) throw new Error('Google Sheets trigger requires a valid spreadsheetId.');
    return value;
};
const range = config => {
    const value = String(config?.range || '').trim();
    if (!value || /[\r\n]/.test(value) || value.length > 500) throw new Error('Google Sheets trigger requires a valid range.');
    return value;
};

const readRange = async (client, id, targetRange) => {
    const url = `${SHEETS_API}/${id}/values/${encodeURIComponent(targetRange)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
    const response = await client.request({ url, method: 'GET' });
    return response.data?.values || [];
};

const stopChannel = async ({ client, channelId, resourceId }) => {
    if (!channelId || !resourceId) return;
    await client.request({ url: `${DRIVE_API}/channels/stop`, method: 'POST', data: { id: channelId, resourceId } });
};

const createChannel = async ({ client, subscription, id }) => {
    const response = await client.request({
        url: `${DRIVE_API}/files/${encodeURIComponent(id)}/watch`,
        method: 'POST',
        data: {
            id: crypto.randomUUID(),
            type: 'web_hook',
            address: `${requirePublicTriggerOrigin()}/api/provider-events/google-drive`,
            token: channelToken(subscription.id),
            expiration: String(Date.now() + 20 * 60 * 60 * 1000)
        }
    });
    return response.data;
};

const sheetsAdapter = {
    async reconcile({ subscription, config, force = false }) {
        const resolvedConfig = config || subscription.config || {};
        const id = spreadsheetId(resolvedConfig);
        const targetRange = range(resolvedConfig);
        const { client } = await getGoogleClientForUser(subscription.userId);
        if (!force && subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now() + 60 * 60 * 1000) return;
        if (subscription.externalSubscriptionId) {
            try {
                await stopChannel({ client, channelId: subscription.externalSubscriptionId, resourceId: subscription.externalResourceId });
            } catch (error) {
                if (Number(error.response?.status || error.responseCode) !== 404) throw error;
            }
        }
        const rows = await readRange(client, id, targetRange);
        const channel = await createChannel({ client, subscription, id });
        await subscription.update({
            externalSubscriptionId: channel.id,
            externalResourceId: channel.resourceId,
            expiresAt: channel.expiration ? new Date(Number(channel.expiration)) : new Date(Date.now() + 20 * 60 * 60 * 1000),
            state: {
                initialized: true,
                rows,
                baselineMode: resolvedConfig.baselineMode || 'ignore-existing',
                initialProcessed: resolvedConfig.baselineMode !== 'process-existing',
                lastMessageNumber: 0,
                spreadsheetId: id,
                range: targetRange
            }
        });
    },
    async remove({ subscription }) {
        if (!subscription.externalSubscriptionId) return;
        const { client } = await getGoogleClientForUser(subscription.userId);
        try {
            await stopChannel({ client, channelId: subscription.externalSubscriptionId, resourceId: subscription.externalResourceId });
        } catch (error) {
            if (Number(error.response?.status || error.responseCode) !== 404) throw error;
        }
    }
};

export const handleGoogleDriveNotification = async headers => {
    const channelId = headers['x-goog-channel-id'];
    const token = headers['x-goog-channel-token'];
    const state = headers['x-goog-resource-state'];
    const messageNumber = Number(headers['x-goog-message-number'] || 0);
    if (!channelId || !token) throw new Error('Google Drive notification is missing channel identity.');
    const subscription = await TriggerSubscription.findOne({ where: { externalSubscriptionId: channelId, provider: 'google-drive', status: 'active' } });
    if (!subscription) return { matched: 0, processed: 0 };
    if (token !== channelToken(subscription.id)) throw new Error('Google Drive notification token is invalid.');
    if (state === 'sync') return { matched: 1, processed: 0 };
    if (messageNumber && messageNumber <= Number(subscription.state?.lastMessageNumber || 0)) return { matched: 1, processed: 0 };

    const config = subscription.config || {};
    const id = spreadsheetId(config);
    const targetRange = range(config);
    const { client } = await getGoogleClientForUser(subscription.userId);
    const rows = await readRange(client, id, targetRange);
    const previousRows = subscription.state?.rows || [];
    const startIndex = subscription.state?.initialProcessed === false ? 0 : previousRows.length;
    let processed = 0;
    if (rows.length >= previousRows.length) {
        for (let index = startIndex; index < rows.length; index += 1) {
            const values = rows[index];
            const fingerprint = stableRowFingerprint(values);
            await ingestEvent({
                provider: 'google-drive',
                eventType: 'row.added',
                externalEventId: `sheet:${id}:${targetRange}:${index + 1}:${fingerprint}`,
                payload: {
                    data: {
                        spreadsheetId: id,
                        range: targetRange,
                        rowNumber: index + 1,
                        values,
                        fingerprint
                    }
                },
                subscriptionId: subscription.id,
                causationId: channelId
            });
            processed += 1;
        }
    }
    await subscription.update({ state: { ...(subscription.state || {}), rows, initialProcessed: true, lastMessageNumber: messageNumber } });
    return { matched: 1, processed };
};

export default sheetsAdapter;
