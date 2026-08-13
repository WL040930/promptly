import { AutomationRun, DashboardRunMetric, Workflow } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { QueryTypes } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

const METRICS_CACHE_TTL_MS = 30_000;
const metricsCache = new Map();

export const invalidateDashboardMetrics = userId => {
    if (userId) metricsCache.delete(userId);
};

export const getDashboardMetrics = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cached = metricsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.value);
    }
    
    // Run queries concurrently for better performance
    const [
        activeWorkflowCount,
        runAggregate,
        weeklyData,
        recentActivities
    ] = await Promise.all([
        Workflow.count({ where: { userId, status: 'Active' } }),

        DashboardRunMetric.findAll({
            where: { userId },
            attributes: [
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('totalRuns')), 0), 'totalRuns'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('successRuns')), 0), 'successRuns'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('completedRuns')), 0), 'completedRuns']
            ],
            raw: true
        }),

        // Real GROUP BY date query for the last 7 days
        sequelize.query(
            `SELECT
                TO_CHAR(day::date, 'Dy') AS day,
                "totalRuns" AS runs
             FROM dashboard_run_metrics
             WHERE "userId" = :userId
               AND day >= (CURRENT_DATE - INTERVAL '6 days')::date
             ORDER BY day ASC`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        AutomationRun.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: 5,
            include: [{ model: Workflow, as: 'workflow', attributes: ['name'], required: false }]
        })
    ]);

    const { totalRuns, successRuns, completedRuns } = runAggregate[0] || { totalRuns: 0, successRuns: 0, completedRuns: 0 };
    const totalRunsNum = parseInt(totalRuns, 10);
    const successRunsNum = parseInt(successRuns, 10);
    const completedRunsNum = parseInt(completedRuns, 10);
    const successRate = completedRunsNum === 0 ? '—' : `${((successRunsNum / completedRunsNum) * 100).toFixed(1)}%`;

    // Fill in any days with zero runs so the chart always shows 7 bars
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return days[d.getDay()];
    });
    const weeklyMap = Object.fromEntries(weeklyData.map(r => [r.day.trim(), parseInt(r.runs, 10)]));
    const filledWeeklyData = last7Days.map(day => ({
        day,
        runs: weeklyMap[day] || 0
    }));

    const metrics = {
        activeWorkflowCount,
        totalRuns: totalRunsNum,
        successRate,
        weeklyData: filledWeeklyData,
        recentActivities: recentActivities.map(log => ({
            id: log.id,
            action: `${log.workflow?.name || log.workflowNameSnapshot || 'Deleted automation'} ${log.status}`,
            detail: `Triggered by ${log.trigger}`,
            time: log.time,
            type: ['success', 'succeeded'].includes(String(log.status || '').toLowerCase()) ? 'success' : ['waiting', 'running', 'resuming', 'pending'].includes(String(log.status || '').toLowerCase()) ? 'pending' : 'error',
            latency: `${log.durationMs}ms`
        }))
    };
    metricsCache.set(userId, { value: metrics, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
    res.json(metrics);
});
