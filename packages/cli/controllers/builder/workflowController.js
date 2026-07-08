import { Workflow } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';

export const getWorkflows = asyncHandler(async (req, res) => {
    const workflows = await Workflow.findAll({ where: { userId: req.user.id } });
    res.json(workflows);
});

export const createWorkflow = asyncHandler(async (req, res) => {
    const { name, folderId, status, icon, iconColor, iconBg, nodes, edges } = req.body;
    const workflow = await Workflow.create({
        name, folderId, status, icon, iconColor, iconBg, nodes, edges,
        userId: req.user.id
    });
    res.status(201).json(workflow);
});

export const updateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, folderId, status, icon, iconColor, iconBg, nodes, edges } = req.body;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    await workflow.update({ name, folderId, status, icon, iconColor, iconBg, nodes, edges });

    // Keep schedule cron jobs in sync with workflow status / node config changes
    const updatedNodes = nodes || workflow.nodes || [];
    const scheduleNode = updatedNodes.find(n => n.type === 'trigger' && n.subType === 'schedule');
    if (scheduleNode && (status ?? workflow.status) === 'Active') {
        const { cronExpression = '0 9 * * *', timezone = 'UTC' } = scheduleNode.config || {};
        SchedulerService.register(id, req.user.id, cronExpression, timezone);
    } else {
        // Deactivated or schedule node removed
        SchedulerService.deregister(id);
    }

    res.json(workflow);
});

export const deleteWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    // Deregister any scheduled job before deletion
    SchedulerService.deregister(id);

    await workflow.destroy();
    res.json({ message: 'Workflow deleted' });
});

export const triggerWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { payload } = req.body;
    const log = await executeWorkflow(id, req.user.id, payload);
    res.json(log);
});
