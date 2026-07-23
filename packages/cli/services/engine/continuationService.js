import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { User, WorkflowContinuation, AutomationRun } from '../../models/index.js';
import { resumeWorkflowRun } from './executionEngine.js';

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
let timer = null;

const claim = async () => {
    const transaction = await WorkflowContinuation.sequelize.transaction();
    try {
        const now = new Date();
        const continuation = await WorkflowContinuation.findOne({
            where: {
                status: 'pending',
                [Op.or]: [
                    { kind: 'wait', availableAt: { [Op.lte]: now } },
                    { expiresAt: { [Op.ne]: null, [Op.lte]: now } }
                ]
            },
            order: [['availableAt', 'ASC'], ['createdAt', 'ASC']],
            transaction,
            lock: transaction.LOCK.UPDATE,
            skipLocked: true
        });
        if (!continuation) {
            await transaction.commit();
            return null;
        }
        await continuation.update({ status: 'resuming' }, { transaction });
        await transaction.commit();
        return continuation;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const resume = async continuation => {
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run || run.status !== 'waiting') {
        await continuation.update({ status: 'discarded', lastError: 'Workflow run is no longer waiting.' });
        return;
    }
    const expired = continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now();
    const resolution = continuation.kind === 'approval'
        ? { decision: expired ? 'expired' : 'approved', continuationId: continuation.id }
        : { decision: 'completed', continuationId: continuation.id };
    try {
        await resumeWorkflowRun({ run, userId: run.userId, resolution });
        await continuation.update({ status: 'resolved', resolution, resolvedAt: new Date() });
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

export const resolveApprovalToken = async ({ token, decision, userId = null }) => {
    if (!token || !['approved', 'rejected'].includes(decision)) throw new Error('A valid approval token and decision are required.');
    const continuation = await WorkflowContinuation.findOne({ where: { tokenHash: hash(token), kind: 'approval', status: 'pending' } });
    if (!continuation) throw new Error('This approval link is invalid or has already been used.');
    if (continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now()) {
        await continuation.update({ status: 'expired', resolution: { decision: 'expired' }, resolvedAt: new Date() });
        throw new Error('This approval request has expired.');
    }
    if (userId) {
        const user = await User.findByPk(userId);
        if (user && continuation.assigneeEmail && user.email.toLowerCase() !== continuation.assigneeEmail.toLowerCase()) throw new Error('You are not the assigned approver.');
    }
    await continuation.update({ status: 'resuming', resolution: { decision }, resolvedAt: new Date(), resolvedBy: userId });
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run) throw new Error('The workflow run no longer exists.');
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution: { decision, continuationId: continuation.id } });
        await continuation.update({ status: 'resolved' });
        return { continuation, log };
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

export const resolveApprovalForUser = async ({ id, decision, userId }) => {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('A valid approval decision is required.');
    const user = await User.findByPk(userId);
    const continuation = await WorkflowContinuation.findOne({ where: { id, kind: 'approval', status: 'pending' } });
    if (!user || !continuation || (continuation.assigneeUserId !== userId && continuation.assigneeEmail?.toLowerCase() !== user.email.toLowerCase())) throw new Error('Approval request not found.');
    await continuation.update({ status: 'resuming', resolution: { decision }, resolvedAt: new Date(), resolvedBy: userId });
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run) throw new Error('The workflow run no longer exists.');
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution: { decision, continuationId: continuation.id } });
        await continuation.update({ status: 'resolved' });
        return { continuation, log };
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

export const listApprovals = async ({ userId }) => {
    const user = await User.findByPk(userId);
    if (!user) return [];
    return WorkflowContinuation.findAll({
        where: {
            kind: 'approval',
            status: 'pending',
            [Op.or]: [{ assigneeUserId: userId }, { assigneeEmail: user.email }]
        },
        order: [['createdAt', 'DESC']]
    });
};

export const getApprovalByToken = async token => {
    const continuation = await WorkflowContinuation.findOne({ where: { tokenHash: hash(token), kind: 'approval', status: 'pending' } });
    if (!continuation) throw new Error('This approval link is invalid or has already been used.');
    if (continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now()) throw new Error('This approval request has expired.');
    return continuation;
};

export const processDueContinuations = async ({ limit = 10 } = {}) => {
    let processed = 0;
    while (processed < limit) {
        const continuation = await claim();
        if (!continuation) break;
        await resume(continuation);
        processed += 1;
    }
    return processed;
};

export const startContinuationRuntime = async () => {
    if (timer) return;
    timer = setInterval(() => processDueContinuations().catch(error => console.error('[ContinuationRuntime] Worker failed:', error.message)), 1000);
    await processDueContinuations();
};

export const stopContinuationRuntime = () => {
    if (timer) clearInterval(timer);
    timer = null;
};
