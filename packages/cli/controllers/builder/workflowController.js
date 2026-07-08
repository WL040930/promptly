import { Workflow, WorkflowVersion } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';

export const getWorkflows = asyncHandler(async (req, res) => {
    const workflows = await Workflow.findAll({ 
        where: { userId: req.user.id },
        attributes: { exclude: ['nodes', 'edges'] }
    });
    res.json(workflows);
});

export const getWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ 
        where: { id, userId: req.user.id } 
    });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    res.json(workflow);
});

export const createWorkflow = asyncHandler(async (req, res) => {
    const { name, folderId, isActive, status, icon, iconColor, iconBg, nodes, edges } = req.body;
    const workflow = await Workflow.create({
        name, folderId, isActive, status, icon, iconColor, iconBg, nodes, edges,
        userId: req.user.id
    });
    res.status(201).json(workflow);
});

export const updateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, folderId, isActive, status, icon, iconColor, iconBg, nodes, edges } = req.body;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    await workflow.update({ name, folderId, isActive, status, icon, iconColor, iconBg, nodes, edges });

    // Keep schedule cron jobs in sync with workflow isActive state / node config changes
    const updatedNodes = nodes || workflow.nodes || [];
    const scheduleNode = updatedNodes.find(n => n.type === 'trigger' && n.subType === 'schedule');
    
    // Check the updated isActive state (fallback to existing)
    const isCurrentlyActive = isActive !== undefined ? isActive : workflow.isActive;
    
    if (scheduleNode && isCurrentlyActive) {
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

// --- Versioning Endpoints ---

export const getWorkflowVersions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const versions = await WorkflowVersion.findAll({
        where: { workflowId: id },
        order: [['versionNumber', 'DESC']]
    });
    res.json(versions);
});

export const saveWorkflowVersion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    const count = await WorkflowVersion.count({ where: { workflowId: id } });
    
    const version = await WorkflowVersion.create({
        workflowId: id,
        versionNumber: count + 1,
        nodes: workflow.nodes,
        edges: workflow.edges
    });
    
    res.status(201).json(version);
});

export const restoreWorkflowVersion = asyncHandler(async (req, res) => {
    const { id, versionId } = req.params;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    const version = await WorkflowVersion.findOne({ where: { id: versionId, workflowId: id } });
    if (!version) return res.status(404).json({ message: 'Version not found' });
    
    await workflow.update({
        nodes: version.nodes,
        edges: version.edges
    });
    
    res.json(workflow);
});
