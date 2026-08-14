import test from 'node:test';
import assert from 'node:assert/strict';
import AutomationRun from '../../models/execution/AutomationRun.js';
import EmailDelivery from '../../models/execution/EmailDelivery.js';
import WorkflowContinuation from '../../models/execution/WorkflowContinuation.js';
import {
    EMAIL_DELIVERY_CONTINUATION_KIND,
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
