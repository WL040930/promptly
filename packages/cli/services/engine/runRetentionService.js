import { Op } from 'sequelize';
import { AutomationRun, WorkflowContinuation } from '../../models/index.js';

export const ACTIVE_RUN_STATUSES = Object.freeze(['running', 'waiting', 'resuming']);
export const OPEN_CONTINUATION_STATUSES = Object.freeze(['pending', 'resuming']);

export const runCancellationMessage = workflowName => (
    `Automation “${workflowName || 'Deleted automation'}” was deleted before this run completed.`
);

export const cancellableRunIds = runs => runs
    .filter(run => ACTIVE_RUN_STATUSES.includes(String(run.status || '').toLowerCase()))
    .map(run => run.id);

export const openContinuationIds = continuations => continuations.map(continuation => continuation.id);

export const continuationDiscardMessage = workflowName => (
    `Automation “${workflowName || 'Deleted automation'}” was deleted before this continuation could resume.`
);

/**
 * Preserve execution history while severing its dependency on a live
 * automation. The caller owns the transaction so the run updates and the
 * workflow deletion commit or roll back together.
 */
export const retainRunsForDeletedWorkflow = async ({
    workflowId,
    userId,
    workflowName,
    deletedAt = new Date(),
    transaction
}) => {
    if (!transaction) throw new Error('A transaction is required to retain deleted workflow runs.');

    // Lock runs before continuations. Execution and approval resolution use
    // the same order, so deletion cannot race a continuation into a new
    // pending state after the run has been cancelled.
    const runs = await AutomationRun.findAll({
        where: { workflowId, userId },
        attributes: ['id', 'status'],
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    const activeRunIds = cancellableRunIds(runs);

    // New runs snapshot their source name at creation time. Only legacy rows
    // without that snapshot should inherit the name used for deletion; never
    // rewrite a historical name after a workflow has been renamed.
    await AutomationRun.update(
        { workflowNameSnapshot: workflowName || 'Deleted automation' },
        { where: { workflowId, userId, workflowNameSnapshot: null }, transaction }
    );
    await AutomationRun.update(
        { workflowDeletedAt: deletedAt },
        { where: { workflowId, userId }, transaction }
    );

    if (activeRunIds.length > 0) {
        await AutomationRun.update(
            {
                status: 'cancelled',
                error: runCancellationMessage(workflowName),
                completedAt: deletedAt
            },
            { where: { id: { [Op.in]: activeRunIds }, userId }, transaction }
        );
    }

    const continuations = await WorkflowContinuation.findAll({
        where: {
            workflowId,
            userId,
            status: { [Op.in]: OPEN_CONTINUATION_STATUSES }
        },
        attributes: ['id'],
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    const continuationIds = openContinuationIds(continuations);

    let discardedContinuationIds = [];
    if (continuationIds.length > 0) {
        const [discardedCount, discardedRows] = await WorkflowContinuation.update(
            {
                status: 'discarded',
                lastError: continuationDiscardMessage(workflowName),
                resolvedAt: deletedAt
            },
            {
                where: {
                    id: { [Op.in]: continuationIds },
                    userId,
                    status: { [Op.in]: OPEN_CONTINUATION_STATUSES }
                },
                transaction
            }
        );
        if (Array.isArray(discardedRows)) {
            discardedContinuationIds = discardedRows.map(continuation => continuation.id);
        } else if (discardedCount > 0) {
            // Some Sequelize/Postgres configurations return only the affected
            // count for UPDATE even when `returning` is requested.
            const discardedRowsAfterUpdate = await WorkflowContinuation.findAll({
                where: {
                    id: { [Op.in]: continuationIds },
                    userId,
                    status: 'discarded',
                    lastError: continuationDiscardMessage(workflowName),
                    resolvedAt: deletedAt
                },
                attributes: ['id'],
                transaction
            });
            discardedContinuationIds = discardedRowsAfterUpdate.map(continuation => continuation.id);
        }
    }

    return {
        retainedRunCount: runs.length,
        cancelledRunIds: activeRunIds,
        discardedContinuationIds
    };
};
