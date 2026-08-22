import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { getGoogleClientForUser } from '../triggers/googleTriggerClient.js';
import { sendEmail } from '../../utils/email.js';
import AutomationRun from '../../models/execution/AutomationRun.js';
import EmailDelivery from '../../models/execution/EmailDelivery.js';
import WorkflowContinuation from '../../models/execution/WorkflowContinuation.js';
import {
    MAX_RECIPIENTS,
    buildRawMimeMessage,
    isRetryableEmailError,
    validateEmailMessage
} from '../../../nodes/integrations/generic-connectors/send-email/emailConnector.js';

export const EMAIL_DELIVERY_CONTINUATION_KIND = 'email';

const PENDING_TIMEOUT_MS = 10 * 60 * 1000;
const STALE_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const deliveryKey = ({ workflowId, nodeId, idempotencyKey }) => ({ workflowId, nodeId, idempotencyKey });
const isOpen = status => ['pending', 'resuming'].includes(status);

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

const sendMessage = async ({ userId, provider, message }) => {
    if (provider === 'user-gmail') return sendViaGmail({ userId, message });
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
};

const stableIdempotencyKey = context => (
    context.metadata?.idempotencyKey || context.metadata?.runId || null
);

const updateContinuationIfOpen = async (continuation, values) => {
    const [updatedCount, updatedRows] = await WorkflowContinuation.update(values, {
        where: { id: continuation.id, status: { [Op.in]: ['pending', 'resuming'] } },
        returning: true
    });
    return updatedCount > 0
        ? updatedRows[0]
        : await WorkflowContinuation.findByPk(continuation.id) || continuation;
};

const updateRunStep = async ({ delivery, runId, status, details, error = null, messageId = null }) => {
    if (!runId) return;
    const run = await AutomationRun.findByPk(runId);
    if (!run || run.status === 'cancelled') return;

    let matched = false;
    const steps = (run.steps || []).map(step => {
        if (step.nodeId !== delivery.nodeId || step.metadata?.deliveryId !== delivery.id) return step;
        matched = true;
        return {
            ...step,
            status,
            details,
            ...(error ? { errorCode: 'EMAIL_DELIVERY_FAILED' } : {}),
            metadata: {
                ...(step.metadata || {}),
                deliveryStatus: status,
                ...(messageId ? { messageId } : {}),
                ...(error ? { error } : {})
            }
        };
    });
    if (!matched) return;

    await run.update({
        steps,
        ...(error ? {
            tags: ['Engine', 'failed'],
            ...(run.status !== 'failed' ? { status: 'failed', error } : {})
        } : {})
    });
};

const deliveryResponse = ({ delivery, deduplicated = false }) => ({
    deliveryId: delivery.id,
    deliveryStatus: delivery.status === 'sent' ? 'sent' : 'queued',
    deduplicated
});

const asyncDeliveryContext = ({ context, nodeId }) => {
    const workflowId = context.metadata?.workflowId;
    const userId = context.metadata?.userId;
    const runId = context.metadata?.runId;
    const idempotencyKey = stableIdempotencyKey(context);
    if (!workflowId || !userId || !runId || !nodeId || !idempotencyKey) {
        const error = new Error('Asynchronous email delivery requires an active workflow run.');
        error.code = 'EMAIL_ASYNC_CONTEXT_MISSING';
        throw error;
    }
    return { workflowId, userId, runId, idempotencyKey: String(idempotencyKey) };
};

const perRecipientIdempotencyKey = ({ baseKey, message }) => {
    const recipients = message.to.map(recipient => String(recipient).trim().toLocaleLowerCase()).join(',');
    // Keep the source event recognizable while always fitting the 255-char
    // database column. The hash makes a single workflow event safely fan out.
    return `${String(baseKey).slice(0, 190)}:recipient:${hash(recipients).slice(0, 48)}`;
};

const assertMatchingMessage = ({ delivery, recipientHash, subjectHash }) => {
    if (delivery.recipientHash === recipientHash && delivery.subjectHash === subjectHash) return;
    const error = new Error('The same idempotency key was used with a different email message.');
    error.code = 'EMAIL_IDEMPOTENCY_CONFLICT';
    throw error;
};

const enqueueMessage = async ({ transaction, workflowId, userId, runId, nodeId, provider, message, idempotencyKey }) => {
    const recipientHash = hash([...message.to, ...message.cc, ...message.bcc, ...message.replyTo].join(','));
    const subjectHash = hash(message.subject);
    const key = deliveryKey({ workflowId, nodeId, idempotencyKey });
    let delivery = await EmailDelivery.findOne({ where: key, transaction, lock: transaction.LOCK.UPDATE });
    let created = false;

    if (delivery) {
        assertMatchingMessage({ delivery, recipientHash, subjectHash });
        if (delivery.status === 'sent') return deliveryResponse({ delivery, deduplicated: true });
        if (isOpen(delivery.status) && Date.now() - new Date(delivery.updatedAt).getTime() < PENDING_TIMEOUT_MS) {
            return deliveryResponse({ delivery, deduplicated: true });
        }
    } else {
        try {
            delivery = await EmailDelivery.create({
                ...key,
                userId,
                provider,
                recipientHash,
                subjectHash,
                status: 'pending'
            }, { transaction });
            created = true;
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            delivery = await EmailDelivery.findOne({ where: key, transaction, lock: transaction.LOCK.UPDATE });
            if (!delivery) throw error;
            assertMatchingMessage({ delivery, recipientHash, subjectHash });
            if (delivery.status === 'sent') return deliveryResponse({ delivery, deduplicated: true });
            if (isOpen(delivery.status) && Date.now() - new Date(delivery.updatedAt).getTime() < PENDING_TIMEOUT_MS) {
                return deliveryResponse({ delivery, deduplicated: true });
            }
        }
    }

    if (!created) {
        await delivery.update({
            provider,
            recipientHash,
            subjectHash,
            status: 'pending',
            lastError: null
        }, { transaction });
    }

    const continuation = await WorkflowContinuation.create({
        runId,
        workflowId,
        userId,
        nodeId,
        kind: EMAIL_DELIVERY_CONTINUATION_KIND,
        status: 'pending',
        availableAt: new Date(),
        payload: { deliveryId: delivery.id, provider, message }
    }, { transaction });

    return { ...deliveryResponse({ delivery }), continuationId: continuation.id };
};

/**
 * Persist a batch of already-resolved messages before the workflow continues.
 * One transaction means an individual-recipient send is all queued or not
 * queued at all; continuations are the durable queue entries.
 */
export const enqueueEmailDeliveries = async ({ context, nodeId, provider, messages }) => {
    if (!Array.isArray(messages) || messages.length === 0) {
        const error = new Error('At least one email message is required for asynchronous delivery.');
        error.code = 'EMAIL_BATCH_EMPTY';
        throw error;
    }
    if (messages.length > MAX_RECIPIENTS) {
        const error = new Error(`Individual row email cannot have more than ${MAX_RECIPIENTS} messages.`);
        error.code = 'EMAIL_BATCH_TOO_LARGE';
        throw error;
    }

    // Validate the entire batch before the transaction opens, so invalid row
    // data cannot leave a partial set of recipient emails behind.
    const normalizedMessages = messages.map(message => validateEmailMessage(message));
    const { workflowId, userId, runId, idempotencyKey } = asyncDeliveryContext({ context, nodeId });
    return EmailDelivery.sequelize.transaction(async transaction => {
        const deliveries = [];
        for (const message of normalizedMessages) {
            const messageIdempotencyKey = normalizedMessages.length === 1
                ? idempotencyKey
                : perRecipientIdempotencyKey({ baseKey: idempotencyKey, message });
            deliveries.push(await enqueueMessage({
                transaction,
                workflowId,
                userId,
                runId,
                nodeId,
                provider,
                message,
                idempotencyKey: messageIdempotencyKey
            }));
        }

        const deduplicatedCount = deliveries.filter(delivery => delivery.deduplicated).length;
        return {
            deliveryId: deliveries[0]?.deliveryId || null,
            deliveryStatus: deliveries.every(delivery => delivery.deliveryStatus === 'sent') ? 'sent' : 'queued',
            deduplicated: deduplicatedCount === deliveries.length,
            deliveries,
            queuedCount: deliveries.length - deduplicatedCount,
            deduplicatedCount
        };
    });
};

/** Backward-compatible single-message API used by existing email nodes. */
export const enqueueEmailDelivery = async ({ context, nodeId, provider, message }) => {
    const batch = await enqueueEmailDeliveries({ context, nodeId, provider, messages: [message] });
    return batch.deliveries[0];
};

const retryAt = attempts => new Date(Date.now() + (2 ** attempts) * 1000);

export const processQueuedEmailContinuation = async continuation => {
    const payload = continuation.payload || {};
    const deliveryId = payload.deliveryId;
    const delivery = deliveryId ? await EmailDelivery.findByPk(deliveryId) : null;
    if (!delivery) {
        await updateContinuationIfOpen(continuation, {
            status: 'failed',
            lastError: 'Queued email delivery record was not found.',
            resolvedAt: new Date()
        });
        return;
    }
    if (delivery.status === 'sent') {
        await updateContinuationIfOpen(continuation, { status: 'resolved', resolvedAt: new Date() });
        return;
    }

    const provider = payload.provider || delivery.provider;
    if (!['system-default', 'smtp', 'user-gmail'].includes(provider)) {
        const error = `Unsupported email provider "${provider}".`;
        await delivery.update({ status: 'failed', lastError: error });
        await updateContinuationIfOpen(continuation, { status: 'failed', lastError: error, resolvedAt: new Date() });
        await updateRunStep({ delivery, runId: continuation.runId, status: 'failed', details: 'Asynchronous email could not be sent.', error });
        return;
    }

    let message;
    try {
        message = validateEmailMessage(payload.message || {});
    } catch (error) {
        await delivery.update({ status: 'failed', lastError: error.message });
        await updateContinuationIfOpen(continuation, { status: 'failed', lastError: error.message, resolvedAt: new Date() });
        await updateRunStep({ delivery, runId: continuation.runId, status: 'failed', details: 'Asynchronous email could not be sent.', error: error.message });
        return;
    }

    const attempts = Number(delivery.attempts || 0) + 1;
    try {
        const messageId = await sendMessage({ userId: delivery.userId, provider, message });
        await delivery.update({ status: 'sent', messageId, attempts, sentAt: new Date(), lastError: null });
        await updateContinuationIfOpen(continuation, {
            status: 'resolved',
            resolution: { decision: 'sent', messageId },
            resolvedAt: new Date(),
            lastError: null
        });
        await updateRunStep({ delivery, runId: continuation.runId, status: 'success', details: 'Email delivered asynchronously.', messageId });
    } catch (error) {
        const retry = isRetryableEmailError(error) && attempts < MAX_DELIVERY_ATTEMPTS;
        await delivery.update({ status: retry ? 'pending' : 'failed', attempts, lastError: error.message });
        if (retry) {
            await updateContinuationIfOpen(continuation, {
                status: 'pending',
                availableAt: retryAt(attempts),
                lastError: error.message
            });
            await updateRunStep({ delivery, runId: continuation.runId, status: 'success', details: `Email delivery will retry automatically (attempt ${attempts + 1} of ${MAX_DELIVERY_ATTEMPTS}).` });
            return;
        }
        await updateContinuationIfOpen(continuation, { status: 'failed', lastError: error.message, resolvedAt: new Date() });
        await updateRunStep({ delivery, runId: continuation.runId, status: 'failed', details: 'Asynchronous email delivery failed.', error: error.message });
    }
};

export const recoverStaleEmailContinuations = async () => {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_TIMEOUT_MS);
    await WorkflowContinuation.update({
        status: 'pending',
        availableAt: new Date(),
        lastError: 'Recovered after an interrupted email delivery worker.'
    }, {
        where: {
            kind: EMAIL_DELIVERY_CONTINUATION_KIND,
            status: 'resuming',
            updatedAt: { [Op.lt]: staleBefore }
        }
    });
};
