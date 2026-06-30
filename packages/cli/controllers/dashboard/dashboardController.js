import { ExecutionLog, Workflow } from '../../models/index.js';
import { Op } from 'sequelize';

export const getDashboardMetrics = async (req, res) => {
    const userId = req.user.id;
    
    // Run queries concurrently for better performance
    const [
        activeWorkflowCount,
        totalRuns,
        successRuns,
        recentActivities
    ] = await Promise.all([
        Workflow.count({ where: { userId, status: 'Active' } }),
        ExecutionLog.count({ where: { userId } }),
        ExecutionLog.count({ where: { userId, status: 'Success' } }),
        ExecutionLog.findAll({
            where: { userId },
            order: [['time', 'DESC']],
            limit: 5,
            include: [{ model: Workflow, as: 'workflow', attributes: ['name'] }]
        })
    ]);
    
    const successRate = totalRuns === 0 ? '100%' : `${((successRuns / totalRuns) * 100).toFixed(1)}%`;
    
    // Simulated weekly data for now until we write a complex postgres group-by query
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = days.map(day => ({
        day,
        runs: Math.floor(Math.random() * 500) + 100, // mock data for visual chart
        successRate: '99.5%'
    }));

    res.json({
        activeWorkflowCount,
        totalRuns,
        successRate,
        aiTokensSaved: '14.2M', // mock
        weeklyData,
        recentActivities: recentActivities.map(log => ({
            id: log.id,
            action: `${log.workflow ? log.workflow.name : 'Workflow'} ${log.status}`,
            detail: `Triggered by ${log.trigger}`,
            time: log.time,
            type: log.status === 'Success' ? 'success' : 'error',
            latency: `${log.durationMs}ms`
        }))
    });
};
