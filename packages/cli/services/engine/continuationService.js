import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { User, WorkflowContinuation, AutomationRun, Workflow, FormResponse, Form } from '../../models/index.js';
import { resumeWorkflowRun } from './executionEngine.js';

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
let timer = null;

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|private[-_]?key)/i;

const safeReviewValue = (value, key = '') => {
    if (SENSITIVE_KEY.test(String(key))) return '[redacted]';
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
    if (Array.isArray(value)) return value.slice(0, 50).map(item => safeReviewValue(item, key));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [childKey, safeReviewValue(childValue, childKey)]));
    return value;
};

const normalizeReviewData = async input => {
    const source = input && typeof input === 'object' ? input : {};
    const responseId = source.responseId || null;
    if (responseId) {
        const response = await FormResponse.findByPk(responseId, { include: [{ model: Form, as: 'form', attributes: ['id', 'title'] }] }).catch(() => null);
        const fields = response?.snapshot || [];
        const values = response?.responseData || source.fields || {};
        const entries = Object.entries(values).map(([id, value]) => {
            const field = fields.find(item => item?.id === id);
            return { id, label: field?.label || field?.name || id, type: field?.type || 'text', value: safeReviewValue(value, `${id} ${field?.label || field?.name || ''}`) };
        });
        return {
            kind: 'form_submission',
            form: response?.form ? { id: response.form.id, title: response.form.title } : null,
            responseId,
            submittedAt: source.submittedAt || response?.createdAt || null,
            entries
        };
    }
    const entries = Object.entries(source).filter(([key]) => !['responseId', 'submittedAt'].includes(key)).map(([key, value]) => ({
        id: key,
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase()),
        value: safeReviewValue(value, key)
    }));
    return { kind: 'event', entries };
};

const displayStatusFor = continuation => {
    if (continuation.status === 'resolved') return continuation.resolution?.decision || 'resolved';
    if (continuation.status === 'resuming') return 'resolving';
    return continuation.status;
};

export const serializeApproval = async continuation => {
    const value = continuation?.toJSON ? continuation.toJSON() : { ...continuation };
    const run = value.run || await AutomationRun.findByPk(value.runId, { include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name', 'description'] }] }).catch(() => null);
    const workflow = value.workflow || run?.workflow || (value.workflowId ? await Workflow.findByPk(value.workflowId, { attributes: ['id', 'name', 'description'] }).catch(() => null) : null);
    const input = value.payload?.input || {};
    const reviewData = await normalizeReviewData(input);
    const resolver = value.resolvedBy ? await User.findByPk(value.resolvedBy, { attributes: ['id', 'email'] }).catch(() => null) : null;
    delete value.tokenHash;
    if (value.payload) delete value.payload.actionToken;
    const safeInput = reviewData.kind === 'form_submission'
        ? { fields: Object.fromEntries(reviewData.entries.map(entry => [entry.label, entry.value])), responseId: reviewData.responseId, submittedAt: reviewData.submittedAt }
        : safeReviewValue(input);
    return {
        ...value,
        payload: value.payload ? { ...value.payload, input: safeInput } : value.payload,
        status: displayStatusFor(value),
        approval: {
            id: value.id,
            title: value.payload?.title || 'Review required',
            instructions: value.payload?.instructions || 'Please review this workflow request.',
            status: displayStatusFor(value),
            createdAt: value.createdAt,
            expiresAt: value.expiresAt,
            assignee: value.assigneeUserId ? 'automation_owner' : (value.assigneeEmail ? 'external_approver' : 'automation_owner')
        },
        workflow: workflow ? { id: workflow.id, name: workflow.name, description: workflow.description || null } : { id: value.workflowId, name: 'Automation', description: null },
        run: run ? { id: run.id, status: run.status, trigger: run.trigger, createdAt: run.createdAt, completedAt: run.completedAt, error: run.error || null } : { id: value.runId, status: 'waiting', trigger: null },
        reviewData,
        decision: value.resolution ? { ...value.resolution, resolvedBy: value.resolvedBy || null, resolvedByEmail: resolver?.email || null } : null
    };
};

const approvalScope = (userId, email) => ({
    [Op.or]: [{ assigneeUserId: userId }, { assigneeEmail: { [Op.iLike]: email } }]
});

const assertDecisionNote = note => {
    if (note === undefined || note === null || note === '') return null;
    const value = String(note).trim();
    if (value.length > 1000) throw new Error('Decision notes must be 1,000 characters or fewer.');
    return value;
};

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

export const resolveApprovalToken = async ({ token, decision, note = null, userId = null }) => {
    if (!token || !['approved', 'rejected'].includes(decision)) throw new Error('A valid approval token and decision are required.');
    const decisionNote = assertDecisionNote(note);
    const continuation = await WorkflowContinuation.findOne({ where: { tokenHash: hash(token), kind: 'approval', status: 'pending' } });
    if (!continuation) throw new Error('This approval link is invalid or has already been used.');
    if (continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now()) {
        await continuation.update({ status: 'expired', resolution: { decision: 'expired' }, resolvedAt: new Date() });
        throw new Error('This approval request has expired.');
    }
    if (userId) {
        const user = await User.findByPk(userId);
        if (user && continuation.assigneeUserId !== userId && continuation.assigneeEmail && user.email.toLowerCase() !== continuation.assigneeEmail.toLowerCase()) throw new Error('You are not the assigned approver.');
    }
    const resolution = { decision, ...(decisionNote ? { note: decisionNote } : {}), resolvedAt: new Date().toISOString() };
    await continuation.update({ status: 'resuming', resolution, resolvedAt: new Date(), resolvedBy: userId });
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run) throw new Error('The workflow run no longer exists.');
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution: { decision, note: decisionNote, continuationId: continuation.id } });
        await continuation.update({ status: 'resolved' });
        return { continuation, log };
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

export const resolveApprovalForUser = async ({ id, decision, note = null, userId }) => {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('A valid approval decision is required.');
    const decisionNote = assertDecisionNote(note);
    const user = await User.findByPk(userId);
    const continuation = await WorkflowContinuation.findOne({ where: { id, kind: 'approval', status: 'pending' } });
    if (!user || !continuation || (continuation.assigneeUserId !== userId && continuation.assigneeEmail?.toLowerCase() !== user.email.toLowerCase())) throw new Error('Approval request not found.');
    if (continuation.expiresAt && new Date(continuation.expiresAt).getTime() <= Date.now()) {
        await continuation.update({ status: 'expired', resolution: { decision: 'expired', resolvedAt: new Date().toISOString() }, resolvedAt: new Date(), resolvedBy: userId });
        throw new Error('This approval request has expired.');
    }
    const resolution = { decision, ...(decisionNote ? { note: decisionNote } : {}), resolvedAt: new Date().toISOString() };
    await continuation.update({ status: 'resuming', resolution, resolvedAt: new Date(), resolvedBy: userId });
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run) throw new Error('The workflow run no longer exists.');
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution: { decision, note: decisionNote, continuationId: continuation.id } });
        await continuation.update({ status: 'resolved' });
        return { continuation, log };
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

export const listApprovals = async ({ userId, status = 'pending', search = '', workflowId = null, limit = 50, offset = 0 }) => {
    const user = await User.findByPk(userId);
    if (!user) return [];
    const normalizedStatus = ['pending', 'history', 'all'].includes(status) ? status : 'pending';
    const where = { kind: 'approval', ...approvalScope(userId, user.email) };
    if (workflowId) where.workflowId = workflowId;
    if (normalizedStatus === 'pending') where.status = 'pending';
    if (normalizedStatus === 'history') where.status = { [Op.in]: ['resolved', 'expired', 'failed', 'discarded'] };
    const rows = await WorkflowContinuation.findAll({
        where,
        order: [['createdAt', 'DESC']]
    });
    const needle = search.trim().toLowerCase();
    const filtered = needle ? rows.filter(row => `${row.payload?.title || ''} ${row.payload?.instructions || ''} ${row.workflowId || ''}`.toLowerCase().includes(needle)) : rows;
    return filtered.slice(Number(offset) || 0, (Number(offset) || 0) + Math.min(Math.max(Number(limit) || 50, 1), 100));
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
