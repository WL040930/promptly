import { Op, where as sqlWhere, fn, cast, json } from 'sequelize';
import { User, WorkflowContinuation, AutomationRun, Workflow, FormResponse, Form } from '../../models/index.js';
import { resumeWorkflowRun } from './executionEngine.js';

let timer = null;

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|private[-_]?key)/i;
const serviceError = (message, status, code) => Object.assign(new Error(message), { status, code });

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
    return {
        kind: 'event',
        entries: Object.entries(source).filter(([key]) => !['responseId', 'submittedAt'].includes(key)).map(([key, value]) => ({
            id: key,
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase()),
            value: safeReviewValue(value, key)
        }))
    };
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
    const reviewData = await normalizeReviewData(value.payload?.input || {});
    const resolver = value.resolvedBy ? await User.findByPk(value.resolvedBy, { attributes: ['id', 'email'] }).catch(() => null) : null;
    const safeInput = reviewData.kind === 'form_submission'
        ? { fields: Object.fromEntries(reviewData.entries.map(entry => [entry.label, entry.value])), responseId: reviewData.responseId, submittedAt: reviewData.submittedAt }
        : safeReviewValue(value.payload?.input || {});
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
            assignee: 'automation_owner'
        },
        workflow: workflow ? { id: workflow.id, name: workflow.name, description: workflow.description || null } : { id: value.workflowId, name: 'Automation', description: null },
        run: run ? { id: run.id, status: run.status, trigger: run.trigger, createdAt: run.createdAt, completedAt: run.completedAt, error: run.error || null } : { id: value.runId, status: 'waiting', trigger: null },
        reviewData,
        decision: value.resolution ? { ...value.resolution, resolvedBy: value.resolvedBy || null, resolvedByEmail: resolver?.email || null } : null
    };
};

const assertDecisionNote = note => {
    if (note === undefined || note === null || note === '') return null;
    const value = String(note).trim();
    if (value.length > 1000) throw serviceError('Decision notes must be 1,000 characters or fewer.', 400, 'APPROVAL_NOTE_TOO_LONG');
    return value;
};

const claimDueWait = async () => {
    const transaction = await WorkflowContinuation.sequelize.transaction();
    try {
        const continuation = await WorkflowContinuation.findOne({
            where: { kind: 'wait', status: 'pending', availableAt: { [Op.lte]: new Date() } },
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

const resumeWait = async continuation => {
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run || run.status !== 'waiting') {
        await continuation.update({ status: 'discarded', lastError: 'Workflow run is no longer waiting.' });
        return;
    }
    const resolution = { decision: 'completed', continuationId: continuation.id };
    try {
        await resumeWorkflowRun({ run, userId: run.userId, resolution });
        await continuation.update({ status: 'resolved', resolution, resolvedAt: new Date() });
    } catch (error) {
        await continuation.update({ status: 'failed', lastError: error.message });
        throw error;
    }
};

const claimApproval = async ({ id, userId, decision, note }) => {
    const transaction = await WorkflowContinuation.sequelize.transaction();
    try {
        const continuation = await WorkflowContinuation.findOne({
            where: { id, userId, kind: 'approval' },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!continuation) throw serviceError('Approval request not found.', 404, 'APPROVAL_NOT_FOUND');
        if (continuation.status !== 'pending') {
            throw serviceError('This approval is already being resolved or has already been decided.', 409, 'APPROVAL_NOT_PENDING');
        }
        const run = await AutomationRun.findOne({
            where: { id: continuation.runId, userId, workflowId: continuation.workflowId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!run || run.status !== 'waiting') {
            throw serviceError('This workflow run is no longer waiting for approval.', 409, 'RUN_NOT_WAITING');
        }
        const resolvedAt = new Date();
        const resolution = { decision, ...(note ? { note } : {}), resolvedAt: resolvedAt.toISOString() };
        await continuation.update({ status: 'resuming', resolution, resolvedAt, resolvedBy: userId, lastError: null }, { transaction });
        await transaction.commit();
        return { continuation, run, resolution };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

export const resolveApprovalForUser = async ({ id, decision, note = null, userId }) => {
    if (!['approved', 'rejected'].includes(decision)) throw serviceError('A valid approval decision is required.', 400, 'APPROVAL_DECISION_INVALID');
    const decisionNote = assertDecisionNote(note);
    const { continuation, run } = await claimApproval({ id, userId, decision, note: decisionNote });
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
    const normalizedStatus = ['pending', 'history', 'all'].includes(status) ? status : 'pending';
    const where = { kind: 'approval', userId };
    if (workflowId) where.workflowId = workflowId;
    if (normalizedStatus === 'pending') where.status = { [Op.in]: ['pending', 'resuming'] };
    if (normalizedStatus === 'history') where.status = { [Op.in]: ['resolved', 'failed', 'discarded'] };
    const needle = search.trim().toLowerCase();
    if (needle) {
        where[Op.or] = [
            { workflowId: { [Op.iLike]: `%${needle}%` } },
            sqlWhere(fn('LOWER', cast(json('payload.title'), 'text')), { [Op.like]: `%${needle}%` }),
            sqlWhere(fn('LOWER', cast(json('payload.instructions'), 'text')), { [Op.like]: `%${needle}%` })
        ];
    }
    return WorkflowContinuation.findAll({
        where,
        order: [['createdAt', 'DESC']],
        offset: Math.max(Number(offset) || 0, 0),
        limit: Math.min(Math.max(Number(limit) || 50, 1), 100)
    });
};

export const getApprovalSummary = async userId => ({
    pendingCount: await WorkflowContinuation.count({ where: { kind: 'approval', userId, status: 'pending' } })
});

export const processDueContinuations = async ({ limit = 10 } = {}) => {
    let processed = 0;
    while (processed < limit) {
        const continuation = await claimDueWait();
        if (!continuation) break;
        await resumeWait(continuation);
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
