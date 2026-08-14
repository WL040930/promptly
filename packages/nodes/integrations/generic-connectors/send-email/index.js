import crypto from 'node:crypto';
import { BaseNode } from '../../../BaseNode.js';
import EmailDelivery from '../../../../cli/models/execution/EmailDelivery.js';
import { sendEmail } from '../../../../cli/utils/email.js';
import { getGoogleClientForUser } from '../../../../cli/services/triggers/googleTriggerClient.js';
import {
    buildRawMimeMessage,
    isRetryableEmailError,
    validateEmailMessage,
    withRetries
} from './emailConnector.js';
import { enqueueEmailDelivery } from '../../../../cli/services/engine/emailDeliveryService.js';

const DEBUG_PREFIX = '[DEBUG-send-email]';
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

const isDebugEnabled = () => process.env.SEND_EMAIL_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const preview = (value, maxLength = 160) => {
    const raw = value === undefined ? '<undefined>' : value === null ? '<null>' : String(value);
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
};
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const logDebug = (label, details) => {
    if (isDebugEnabled()) console.log(`${DEBUG_PREFIX} ${label}`, JSON.stringify(details));
};

const logFailure = (label, details) => console.error(`${DEBUG_PREFIX} ${label}`, JSON.stringify(details));

const getDelivery = async (context, message, provider) => {
    const idempotencyKey = context.metadata?.idempotencyKey;
    const workflowId = context.metadata?.workflowId;
    const userId = context.metadata?.userId;
    if (!idempotencyKey || !workflowId || !userId) return null;

    const recipientHash = hash([...message.to, ...message.cc, ...message.bcc, ...message.replyTo].join(','));
    const subjectHash = hash(message.subject);
    let delivery = await EmailDelivery.findOne({ where: { workflowId, nodeId: thisNodeId(context), idempotencyKey } });
    if (delivery && (delivery.recipientHash !== recipientHash || delivery.subjectHash !== subjectHash)) {
        const error = new Error('The same idempotency key was used with a different email message.');
        error.code = 'EMAIL_IDEMPOTENCY_CONFLICT';
        throw error;
    }
    if (delivery?.status === 'sent') return { delivery, duplicate: true };
    if (delivery?.status === 'pending' && Date.now() - new Date(delivery.updatedAt).getTime() < PENDING_TIMEOUT_MS) {
        const error = new Error('An email delivery with this idempotency key is already in progress.');
        error.code = 'EMAIL_DELIVERY_IN_PROGRESS';
        throw error;
    }

    if (!delivery) {
        try {
            delivery = await EmailDelivery.create({
                workflowId,
                userId,
                nodeId: thisNodeId(context),
                idempotencyKey,
                provider,
                recipientHash,
                subjectHash,
                status: 'pending'
            });
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            delivery = await EmailDelivery.findOne({ where: { workflowId, nodeId: thisNodeId(context), idempotencyKey } });
            if (delivery?.status === 'sent') return { delivery, duplicate: true };
            throw new Error('Email delivery could not acquire its idempotency lock.');
        }
    } else {
        await delivery.update({ status: 'pending', provider, recipientHash, subjectHash, lastError: null });
    }
    return { delivery, duplicate: false };
};

const thisNodeId = context => context.__runtime?.currentNodeId || context.metadata?.currentNodeId;

const sendViaGmail = async ({ userId, message }) => {
    const { client } = await getGoogleClientForUser(userId);
    const raw = Buffer.from(buildRawMimeMessage(message)).toString('base64url');
    const response = await client.request({
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        method: 'POST',
        data: { raw }
    });
    return response.data.id;
};

export default class SendEmailNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const provider = config.emailProvider || 'system-default';
        if (!['system-default', 'smtp', 'user-gmail'].includes(provider)) {
            return { success: false, errorCode: 'EMAIL_CONFIG_INVALID', error: `Unsupported email provider "${provider}".` };
        }

        let message;
        try {
            message = validateEmailMessage({
                to: config.to,
                cc: config.cc,
                bcc: config.bcc,
                replyTo: config.replyTo,
                subject: config.subject,
                text: config.body,
                html: config.htmlBody
            });
        } catch (error) {
            logFailure('invalid-config', { error: error.message, to: preview(config.to), subject: preview(config.subject) });
            return { success: false, errorCode: 'EMAIL_CONFIG_INVALID', error: error.message };
        }

        logDebug('execute-start', { nodeId: this.id, provider, recipients: message.to.length, subject: preview(message.subject) });
        const contextWithNode = context;
        if (!contextWithNode.__runtime) {
            Object.defineProperty(contextWithNode, '__runtime', {
                value: {},
                enumerable: false,
                configurable: true,
                writable: true
            });
        }
        contextWithNode.__runtime.currentNodeId = this.id;

        if ((config.deliveryMode || 'async') === 'async') {
            try {
                const queued = await enqueueEmailDelivery({
                    context: contextWithNode,
                    nodeId: this.id,
                    provider,
                    message
                });
                return {
                    success: true,
                    outputData: queued,
                    ...queued,
                    to: message.to.join(', '),
                    subject: message.subject,
                    logEntry: { deliveryId: queued.deliveryId, deliveryStatus: queued.deliveryStatus, asynchronous: true },
                    details: queued.deduplicated
                        ? 'Email delivery was already queued for this event.'
                        : 'Email queued for asynchronous delivery.'
                };
            } catch (error) {
                return { success: false, errorCode: error.code || 'EMAIL_QUEUE_FAILED', error: error.message };
            }
        }

        let delivery;
        try {
            delivery = await getDelivery.call(this, contextWithNode, message, provider);
        } catch (error) {
            return { success: false, errorCode: error.code || 'EMAIL_IDEMPOTENCY_FAILED', error: error.message };
        }

        if (delivery?.duplicate) {
            return {
                success: true,
                deduplicated: true,
                messageId: delivery.delivery.messageId,
                outputData: { messageId: delivery.delivery.messageId, provider, deduplicated: true },
                to: message.to.join(', '),
                subject: message.subject
            };
        }

        try {
            const { result: messageId, attempts } = await withRetries(async () => {
                if (provider === 'user-gmail') return sendViaGmail({ userId: context.metadata?.userId, message });
                const mailInfo = await sendEmail({
                    to: message.to.join(', '),
                    cc: message.cc.join(', ') || undefined,
                    bcc: message.bcc.join(', ') || undefined,
                    replyTo: message.replyTo.join(', ') || undefined,
                    subject: message.subject,
                    text: message.text,
                    html: message.html || undefined
                });
                return mailInfo?.messageId || `dev-${crypto.randomUUID()}`;
            }, { maxRetries: delivery?.delivery ? 2 : 0, shouldRetry: isRetryableEmailError });

            if (delivery?.delivery) await delivery.delivery.update({ status: 'sent', messageId, attempts, sentAt: new Date(), lastError: null });
            return {
                success: true,
                outputData: { messageId, provider, attempts, deduplicated: false },
                messageId,
                attempts,
                to: message.to.join(', '),
                subject: message.subject
            };
        } catch (error) {
            const attempts = error.attempts || 1;
            if (delivery?.delivery) await delivery.delivery.update({ status: 'failed', attempts, lastError: error.message });
            logFailure('delivery-failed', { provider, attempts, error: error.message });
            return { success: false, errorCode: 'EMAIL_DELIVERY_FAILED', error: error.message, attempts };
        }
    }
}
