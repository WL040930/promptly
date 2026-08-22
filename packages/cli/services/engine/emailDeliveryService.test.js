import test from 'node:test';
import assert from 'node:assert/strict';
import AutomationRun from '../../models/execution/AutomationRun.js';
import EmailDelivery from '../../models/execution/EmailDelivery.js';
import WorkflowContinuation from '../../models/execution/WorkflowContinuation.js';
import {
    EMAIL_DELIVERY_CONTINUATION_KIND,
    enqueueEmailDeliveries,
    enqueueEmailDelivery,
    processQueuedEmailContinuation
} from './emailDeliveryService.js';

const restore = (target, values) => {
    for (const [key, value] of Object.entries(values)) target[key] = value;
};

test('async email delivery persists a resolved message and a durable queue entry before continuing', async () => {
    const originals = {
        transaction: EmailDelivery.sequelize.transaction,
        findOne: EmailDelivery.findOne,
        create: EmailDelivery.create,
        createContinuation: WorkflowContinuation.create
    };
    const calls = [];
    try {
        EmailDelivery.sequelize.transaction = async callback => callback({ id: 'transaction_1', LOCK: { UPDATE: 'UPDATE' } });
        EmailDelivery.findOne = async () => null;
        EmailDelivery.create = async values => {
            calls.push({ kind: 'delivery', values });
            return { id: 'delivery_1', ...values };
        };
        WorkflowContinuation.create = async values => {
            calls.push({ kind: 'continuation', values });
            return { id: 'continuation_1', ...values };
        };

        const result = await enqueueEmailDelivery({
            context: { metadata: { workflowId: 'workflow_1', userId: 'user_1', runId: 'run_1', idempotencyKey: 'event_1' } },
            nodeId: 'email_1',
            provider: 'system-default',
            message: {
                to: ['member@example.com'],
                cc: [],
                bcc: [],
                replyTo: [],
                subject: 'Welcome',
                text: 'Hello',
                html: ''
            }
        });

        assert.deepEqual(result, { deliveryId: 'delivery_1', deliveryStatus: 'queued', deduplicated: false, continuationId: 'continuation_1' });
        assert.equal(calls[0].values.status, 'pending');
        assert.equal(calls[1].values.kind, EMAIL_DELIVERY_CONTINUATION_KIND);
        assert.deepEqual(calls[1].values.payload.message, {
            to: ['member@example.com'], cc: [], bcc: [], replyTo: [], subject: 'Welcome', text: 'Hello', html: ''
        });
    } finally {
        restore(EmailDelivery.sequelize, { transaction: originals.transaction });
        restore(EmailDelivery, { findOne: originals.findOne, create: originals.create });
        restore(WorkflowContinuation, { create: originals.createContinuation });
    }
});

test('individual-recipient emails queue all messages in one transaction with recipient-specific keys', async () => {
    const originals = {
        transaction: EmailDelivery.sequelize.transaction,
        findOne: EmailDelivery.findOne,
        create: EmailDelivery.create,
        createContinuation: WorkflowContinuation.create
    };
    const calls = [];
    try {
        EmailDelivery.sequelize.transaction = async callback => {
            calls.push({ kind: 'transaction' });
            return callback({ id: 'transaction_1', LOCK: { UPDATE: 'UPDATE' } });
        };
        EmailDelivery.findOne = async () => null;
        EmailDelivery.create = async values => {
            calls.push({ kind: 'delivery', values });
            return { id: `delivery_${calls.filter(call => call.kind === 'delivery').length}`, ...values };
        };
        WorkflowContinuation.create = async values => {
            calls.push({ kind: 'continuation', values });
            return { id: `continuation_${calls.filter(call => call.kind === 'continuation').length}`, ...values };
        };

        const result = await enqueueEmailDeliveries({
            context: { metadata: { workflowId: 'workflow_1', userId: 'user_1', runId: 'run_1', idempotencyKey: 'event_1' } },
            nodeId: 'email_1',
            provider: 'system-default',
            messages: [
                { to: 'ada@example.com', subject: 'Hello Ada', text: 'Hi Ada' },
                { to: 'bea@example.com', subject: 'Hello Bea', text: 'Hi Bea' }
            ]
        });

        assert.equal(calls.filter(call => call.kind === 'transaction').length, 1);
        assert.equal(calls.filter(call => call.kind === 'delivery').length, 2);
        assert.equal(calls.filter(call => call.kind === 'continuation').length, 2);
        assert.equal(result.queuedCount, 2);
        assert.equal(result.deduplicatedCount, 0);
        assert.equal(result.deliveries.length, 2);
        assert.notEqual(calls[1].values.idempotencyKey, calls[3].values.idempotencyKey);
        assert.match(calls[1].values.idempotencyKey, /^event_1:recipient:/);
    } finally {
        restore(EmailDelivery.sequelize, { transaction: originals.transaction });
        restore(EmailDelivery, { findOne: originals.findOne, create: originals.create });
        restore(WorkflowContinuation, { create: originals.createContinuation });
    }
});

test('individual-recipient batch validation happens before any queue transaction', async () => {
    const originalTransaction = EmailDelivery.sequelize.transaction;
    let transactionCalled = false;
    try {
        EmailDelivery.sequelize.transaction = async () => {
            transactionCalled = true;
            throw new Error('should not start');
        };
        await assert.rejects(() => enqueueEmailDeliveries({
            context: { metadata: { workflowId: 'workflow_1', userId: 'user_1', runId: 'run_1', idempotencyKey: 'event_1' } },
            nodeId: 'email_1',
            provider: 'system-default',
            messages: [
                { to: 'ada@example.com', subject: 'Hello Ada', text: 'Hi Ada' },
                { to: 'not-an-email', subject: 'Hello', text: 'Hi' }
            ]
        }), /Invalid email recipient/);
        assert.equal(transactionCalled, false);
    } finally {
        restore(EmailDelivery.sequelize, { transaction: originalTransaction });
    }
});

test('a malformed persisted async email fails safely without attempting a provider send', async () => {
    const originals = {
        findDelivery: EmailDelivery.findByPk,
        updateContinuation: WorkflowContinuation.update,
        findContinuation: WorkflowContinuation.findByPk,
        findRun: AutomationRun.findByPk
    };
    const updates = [];
    try {
        EmailDelivery.findByPk = async () => ({
            id: 'delivery_1',
            nodeId: 'email_1',
            status: 'pending',
            update: async values => updates.push({ target: 'delivery', values })
        });
        WorkflowContinuation.update = async values => {
            updates.push({ target: 'continuation', values });
            return [1, []];
        };
        WorkflowContinuation.findByPk = async () => null;
        AutomationRun.findByPk = async () => null;

        await processQueuedEmailContinuation({
            id: 'continuation_1',
            runId: 'run_1',
            payload: { deliveryId: 'delivery_1', message: {} }
        });

        assert.equal(updates.find(item => item.target === 'delivery').values.status, 'failed');
        assert.equal(updates.find(item => item.target === 'continuation').values.status, 'failed');
    } finally {
        restore(EmailDelivery, { findByPk: originals.findDelivery });
        restore(WorkflowContinuation, {
            update: originals.updateContinuation,
            findByPk: originals.findContinuation
        });
        restore(AutomationRun, { findByPk: originals.findRun });
    }
});
