import { AutomationRun, Workflow } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { QueryTypes } from 'sequelize';
import asyncHandler from '../../utils/asyncHandler.js';

export const getDashboardMetrics = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    // Run queries concurrently for better performance
    const [
        activeWorkflowCount,
        runAggregate,
        weeklyData,
        recentActivities
    ] = await Promise.all([
        Workflow.count({ where: { userId, status: 'Active' } }),

        // Single aggregate query replaces two separate COUNT queries
        sequelize.query(
            `SELECT
                COUNT(*) AS "totalRuns",
                COUNT(*) FILTER (WHERE status = 'succeeded') AS "successRuns",
                COUNT(*) FILTER (WHERE status IN ('succeeded', 'failed')) AS "completedRuns"
             FROM automation_runs
             WHERE "userId" = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        // Real GROUP BY date query for the last 7 days
        sequelize.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('day', "createdAt"), 'Dy') AS day,
                COUNT(*) AS runs
             FROM automation_runs
             WHERE "userId" = :userId
               AND "createdAt" >= NOW() - INTERVAL '7 days'
             GROUP BY DATE_TRUNC('day', "createdAt")
             ORDER BY DATE_TRUNC('day', "createdAt") ASC`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        ),

        AutomationRun.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: 5,
            include: [{ model: Workflow, as: 'workflow', attributes: ['name'] }]
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

    res.json({
        activeWorkflowCount,
        totalRuns: totalRunsNum,
        successRate,
        weeklyData: filledWeeklyData,
        recentActivities: recentActivities.map(log => ({
            id: log.id,
            action: `${log.workflow ? log.workflow.name : 'Workflow'} ${log.status}`,
            detail: `Triggered by ${log.trigger}`,
            time: log.time,
            type: ['success', 'succeeded'].includes(String(log.status || '').toLowerCase()) ? 'success' : ['waiting', 'running', 'resuming', 'pending'].includes(String(log.status || '').toLowerCase()) ? 'pending' : 'error',
            latency: `${log.durationMs}ms`
        }))
    });
});
