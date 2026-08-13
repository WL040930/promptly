import sequelize from '../../db/index.js';
import { AutomationRun, DashboardRunMetric } from '../../models/index.js';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export const recordTerminalRunMetric = async runId => sequelize.transaction(async transaction => {
    const run = await AutomationRun.findByPk(runId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!run || !TERMINAL.has(run.status) || run.metricsRecordedAt) return false;
    const day = new Date(run.completedAt || run.updatedAt || run.createdAt).toISOString().slice(0, 10);
    const [metric] = await DashboardRunMetric.findOrCreate({
        where: { userId: run.userId, day },
        defaults: { totalRuns: 0, successRuns: 0, completedRuns: 0 },
        transaction
    });
    await metric.increment({
        totalRuns: 1,
        completedRuns: 1,
        ...(run.status === 'succeeded' ? { successRuns: 1 } : {})
    }, { transaction });
    await run.update({ metricsRecordedAt: new Date() }, { transaction });
    return true;
});
