import { AutomationRun, DashboardRunMetric, Workflow } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { QueryTypes } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';
import { workspaceScopeFromRequest, workspaceWhere } from '../../utils/workspaceScope.js';

const METRICS_CACHE_TTL_MS = 30_000;
const metricsCache = new Map();

export const invalidateDashboardMetrics = userId => {
    if (!userId) return;
    for (const key of metricsCache.keys()) {
        if (String(key).startsWith(`${userId}:`)) metricsCache.delete(key);
    }
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const weeklyDataForRuns = runs => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(today);
        day.setHours(0, 0, 0, 0);
        day.setDate(today.getDate() - (6 - index));
        const next = new Date(day);
        next.setDate(day.getDate() + 1);
        const runsOnDay = runs.filter(run => {
            const createdAt = new Date(run.createdAt);
            return createdAt >= day && createdAt < next;
        }).length;
        return { day: days[day.getDay()], runs: runsOnDay };
    });
};

const activityTypeFor = status => {
    const normalized = String(status || '').toLowerCase();
    return ['success', 'succeeded'].includes(normalized)
        ? 'success'
        : ['waiting', 'running', 'resuming', 'pending'].includes(normalized)
            ? 'pending'
            : 'error';
};

export const getDashboardMetrics = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const scope = workspaceScopeFromRequest(req);
    const cacheKey = `${userId}:${scope}`;
    const cached = metricsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.value);
    }

    if (scope === 'demo') {
        const [activeWorkflowCount, demoRuns] = await Promise.all([
            Workflow.count({ where: workspaceWhere({ userId, scope, extra: { isActive: true } }) }),
            AutomationRun.findAll({
                where: workspaceWhere({ userId, scope }),
                order: [['createdAt', 'DESC']],
                limit: 100,
                include: [{ model: Workflow, as: 'workflow', attributes: ['name'], required: false }]
            })
        ]);
        const completedRuns = demoRuns.filter(run => !['waiting', 'running', 'resuming', 'pending'].includes(String(run.status || '').toLowerCase()));
        const successfulRuns = completedRuns.filter(run => ['success', 'succeeded'].includes(String(run.status || '').toLowerCase()));
        const metrics = {
            activeWorkflowCount,
            totalRuns: demoRuns.length,
            successRate: completedRuns.length === 0 ? '—' : `${((successfulRuns.length / completedRuns.length) * 100).toFixed(1)}%`,
            weeklyData: weeklyDataForRuns(demoRuns),
            recentActivities: demoRuns.slice(0, 5).map(log => ({
                id: log.id,
                action: `${log.workflow?.name || log.workflowNameSnapshot || 'Sample automation'} ${log.status}`,
                detail: `Triggered by ${log.trigger}`,
                time: log.time,
                type: activityTypeFor(log.status),
                latency: log.durationMs === null || log.durationMs === undefined ? '—' : `${log.durationMs}ms`
            }))
        };
        metricsCache.set(cacheKey, { value: metrics, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
        return res.json(metrics);
    }
    
    // Run queries concurrently for better performance
    const [
        activeWorkflowCount,
        runAggregate,
        weeklyData,
        recentActivities
    ] = await Promise.all([
        Workflow.count({ where: workspaceWhere({ userId, scope, extra: { isActive: true } }) }),

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
            where: workspaceWhere({ userId, scope }),
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
    metricsCache.set(cacheKey, { value: metrics, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
    res.json(metrics);
});
