import { Op, where as sqlWhere, fn, cast, json } from 'sequelize';
import { getDatabasePoolStats } from '../../db/index.js';
import { User, WorkflowContinuation, AutomationRun, Workflow, FormResponse, Form } from '../../models/index.js';
import { resumeWorkflowRun } from './executionEngine.js';
import { createBackgroundWorkerPoller } from '../backgroundWorkerPoller.js';
import { claimQueueRow, WAIT_CONTINUATION_CLAIM_SQL } from '../queueClaim.js';

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|private[-_]?key)/i;
const serviceError = (message, status, code) => Object.assign(new Error(message), { status, code });
const OPEN_CONTINUATION_STATUSES = Object.freeze(['pending', 'resuming']);

const updateContinuationIfOpen = async (continuation, values) => {
    const [updatedCount, updatedRows] = await WorkflowContinuation.update(values, {
        where: { id: continuation.id, status: { [Op.in]: OPEN_CONTINUATION_STATUSES } },
        returning: true
    });
    return updatedCount > 0
        ? updatedRows[0]
        : await WorkflowContinuation.findByPk(continuation.id) || continuation;
};

const safeReviewValue = (value, key = '') => {
    if (SENSITIVE_KEY.test(String(key))) return '[redacted]';
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
    if (Array.isArray(value)) return value.slice(0, 50).map(item => safeReviewValue(item, key));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [childKey, safeReviewValue(childValue, childKey)]));
    return value;
};

const normalizeReviewData = async (input, responseRecord = null) => {
    const source = input && typeof input === 'object' ? input : {};
    const responseId = source.responseId || null;
    if (responseId) {
        const response = responseRecord || await FormResponse.findByPk(responseId, { include: [{ model: Form, as: 'form', attributes: ['id', 'title'] }] }).catch(() => null);
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

export const serializeApproval = async (continuation, { responsesById = null } = {}) => {
    const value = continuation?.toJSON ? continuation.toJSON() : { ...continuation };
    const run = value.run || await AutomationRun.findByPk(value.runId, { include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name', 'description'] }] }).catch(() => null);
    const workflow = value.workflow || run?.workflow || (value.workflowId ? await Workflow.findByPk(value.workflowId, { attributes: ['id', 'name', 'description'] }).catch(() => null) : null);
    const workflowDeleted = Boolean(run?.workflowDeletedAt) || !workflow;
    const workflowName = workflowDeleted
        ? (run?.workflowNameSnapshot || workflow?.name || 'Deleted automation')
        : (workflow?.name || run?.workflowNameSnapshot || 'Automation');
    const responseId = value.payload?.input?.responseId || null;
    const reviewData = await normalizeReviewData(value.payload?.input || {}, responseId ? responsesById?.get(responseId) : null);
    const resolver = value.resolver || (value.resolvedBy ? await User.findByPk(value.resolvedBy, { attributes: ['id', 'email'] }).catch(() => null) : null);
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
        workflow: { id: value.workflowId || workflow?.id || null, name: workflowName, description: workflow?.description || null, deleted: workflowDeleted },
        run: run ? {
            id: run.id,
            status: run.status,
            trigger: run.trigger,
            createdAt: run.createdAt,
            completedAt: run.completedAt,
            error: run.error || null,
            workflowNameSnapshot: run.workflowNameSnapshot || null,
            workflowDeletedAt: run.workflowDeletedAt || null
        } : { id: value.runId, status: 'waiting', trigger: null },
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
    return claimQueueRow({ model: WorkflowContinuation, query: WAIT_CONTINUATION_CLAIM_SQL });
};

const resumeWait = async continuation => {
    const run = await AutomationRun.findByPk(continuation.runId);
    if (!run || run.status !== 'waiting') {
        await updateContinuationIfOpen(continuation, { status: 'discarded', lastError: run?.error || 'Workflow run is no longer waiting.', resolvedAt: new Date() });
        return;
    }
    const resolution = { decision: 'completed', continuationId: continuation.id };
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution });
        if (log?.status === 'cancelled') {
            await updateContinuationIfOpen(continuation, { status: 'discarded', lastError: log.error || 'Automation was deleted before the continuation could resume.', resolvedAt: new Date() });
            return;
        }
        await updateContinuationIfOpen(continuation, { status: 'resolved', resolution, resolvedAt: new Date() });
    } catch (error) {
        const latestRun = await AutomationRun.findByPk(run.id).catch(() => null);
        if (latestRun?.status === 'cancelled') {
            await updateContinuationIfOpen(continuation, { status: 'discarded', lastError: latestRun.error || error.message, resolvedAt: new Date() });
            return;
        }
        await updateContinuationIfOpen(continuation, { status: 'failed', lastError: error.message });
        throw error;
    }
};

const claimApproval = async ({ id, userId, decision, note }) => {
    return WorkflowContinuation.sequelize.transaction(async transaction => {
        const candidate = await WorkflowContinuation.findOne({
            where: { id, userId, kind: 'approval' }
        });
        if (!candidate) throw serviceError('Approval request not found.', 404, 'APPROVAL_NOT_FOUND');
        if (candidate.status !== 'pending') {
            throw serviceError('This approval is already being resolved or has already been decided.', 409, 'APPROVAL_NOT_PENDING');
        }
        const run = await AutomationRun.findOne({
            where: { id: candidate.runId, userId, workflowId: candidate.workflowId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!run || run.status !== 'waiting') {
            throw serviceError('This workflow run is no longer waiting for approval.', 409, 'RUN_NOT_WAITING');
        }
        const continuation = await WorkflowContinuation.findOne({
            where: { id, userId, kind: 'approval', status: 'pending' },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!continuation) {
            throw serviceError('This approval is already being resolved or has already been decided.', 409, 'APPROVAL_NOT_PENDING');
        }
        const resolvedAt = new Date();
        const resolution = { decision, ...(note ? { note } : {}), resolvedAt: resolvedAt.toISOString() };
        await continuation.update({ status: 'resuming', resolution, resolvedAt, resolvedBy: userId, lastError: null }, { transaction });
        return { continuation, run, resolution };
    });
};

export const resolveApprovalForUser = async ({ id, decision, note = null, userId }) => {
    if (!['approved', 'rejected'].includes(decision)) throw serviceError('A valid approval decision is required.', 400, 'APPROVAL_DECISION_INVALID');
    const decisionNote = assertDecisionNote(note);
    const { continuation, run } = await claimApproval({ id, userId, decision, note: decisionNote });
    try {
        const log = await resumeWorkflowRun({ run, userId: run.userId, resolution: { decision, note: decisionNote, continuationId: continuation.id } });
        if (log?.status === 'cancelled') {
            await updateContinuationIfOpen(continuation, { status: 'discarded', lastError: log.error || 'Automation was deleted before the continuation could resume.', resolvedAt: new Date() });
            return { continuation, log };
        }
        await updateContinuationIfOpen(continuation, { status: 'resolved' });
        return { continuation, log };
    } catch (error) {
        const latestRun = await AutomationRun.findByPk(run.id).catch(() => null);
        if (latestRun?.status === 'cancelled') {
            await updateContinuationIfOpen(continuation, { status: 'discarded', lastError: latestRun.error || error.message, resolvedAt: new Date() });
            return { continuation, log: latestRun };
        }
        await updateContinuationIfOpen(continuation, { status: 'failed', lastError: error.message });
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
    return WorkflowContinuation.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        offset: Math.max(Number(offset) || 0, 0),
        limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
        include: [
            { model: Workflow, as: 'workflow', attributes: ['id', 'name', 'description'], required: false },
            { model: User, as: 'resolver', attributes: ['id', 'email'] },
            {
                model: AutomationRun,
                as: 'run',
                attributes: ['id', 'status', 'trigger', 'createdAt', 'completedAt', 'error', 'workflowNameSnapshot', 'workflowDeletedAt'],
                include: [{ model: Workflow, as: 'workflow', attributes: ['id', 'name', 'description'], required: false }]
            }
        ]
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

const continuationWorker = createBackgroundWorkerPoller({
    task: processDueContinuations,
    onError: error => console.error('[ContinuationRuntime] Worker failed:', error.message, getDatabasePoolStats())
});

export const startContinuationRuntime = async () => {
    await continuationWorker.start({ immediate: true });
};

export const stopContinuationRuntime = async () => {
    await continuationWorker.stop();
};
