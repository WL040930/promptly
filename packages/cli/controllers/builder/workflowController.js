import { Workflow, WorkflowVersion } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../services/engine/workflowValidator.js';
import { reconcileWorkflow, removeWorkflow } from '../../services/triggers/triggerRuntime.js';
import { saveAutomationDraft, publishAutomation, pauseAutomation, saveAutomationVersion } from '../../services/automations/automationService.js';

const workflowValidationResponse = (res, workflow) => {
    const validation = validateWorkflow({
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        isActive: Boolean(workflow.isActive),
        registry: NodeRegistry
    });
    if (validation.valid) return null;
    return res.status(400).json({ message: 'Invalid workflow definition.', issues: validation.issues });
};

const syncSchedule = (workflowId, userId, nodes, isActive) => {
    const scheduleNode = (nodes || []).find(node => node.type === 'trigger' && node.subType === 'schedule');
    if (scheduleNode && isActive) {
        const { cronExpression = '0 9 * * *', timezone = 'UTC' } = scheduleNode.config || {};
        SchedulerService.register(workflowId, userId, cronExpression, timezone);
    } else {
        SchedulerService.deregister(workflowId);
    }
};

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
    const { name, description, folderId, isActive, status, lifecycleStatus, icon, iconColor, iconBg, nodes = [], edges = [], source = 'system', summary = 'Initial automation draft' } = req.body;
    const validationResponse = workflowValidationResponse(res, { nodes, edges, isActive });
    if (validationResponse) return validationResponse;
    const workflow = await Workflow.create({
        name, description, folderId, isActive, status: status || lifecycleStatus || 'Draft', icon, iconColor, iconBg, nodes, edges, revision: 1,
        userId: req.user.id
    });
    const initialVersion = await WorkflowVersion.create({ workflowId: workflow.id, versionNumber: 1, baseRevisionId: null, nodes, edges, source, summary });
    await workflow.update({ draftRevisionId: initialVersion.id });
    try {
        await reconcileWorkflow(workflow);
    } catch (error) {
        await workflow.update({ isActive: false, status: 'Trigger setup failed' });
        return res.status(503).json({ message: 'Workflow trigger could not be connected.', error: error.message });
    }
    syncSchedule(workflow.id, req.user.id, nodes, Boolean(isActive));
    res.status(201).json(workflow);
});

export const updateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, folderId, isActive, status, lifecycleStatus, icon, iconColor, iconBg, nodes, edges, expectedRevision, source = 'visual', summary } = req.body;
    
    let workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });

    const nextNodes = nodes === undefined ? (workflow.nodes || []) : nodes;
    const nextEdges = edges === undefined ? (workflow.edges || []) : edges;
    const nextIsActive = isActive === undefined ? workflow.isActive : isActive;
    const validationResponse = workflowValidationResponse(res, { nodes: nextNodes, edges: nextEdges, isActive: nextIsActive });
    if (validationResponse) return validationResponse;

    const graphChanged = nodes !== undefined || edges !== undefined;
    if (graphChanged) {
        const saved = await saveAutomationDraft({
            automationId: id,
            userId: req.user.id,
            nodes: nextNodes,
            edges: nextEdges,
            expectedRevision,
            source,
            summary
        });
        workflow = saved.automation;
    }

    await workflow.update({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(folderId !== undefined ? { folderId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(status !== undefined || lifecycleStatus !== undefined ? { status: status || lifecycleStatus } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(iconColor !== undefined ? { iconColor } : {}),
        ...(iconBg !== undefined ? { iconBg } : {})
    });

    try {
        await reconcileWorkflow(workflow);
    } catch (error) {
        await workflow.update({ isActive: false, status: 'Trigger setup failed' });
        return res.status(503).json({ message: 'Workflow trigger could not be connected.', error: error.message });
    }

    // Keep schedule cron jobs in sync with workflow activation and node config.
    syncSchedule(id, req.user.id, nextNodes, Boolean(nextIsActive));

    res.json(workflow);
});

export const deleteWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    // Deregister any scheduled job before deletion
    SchedulerService.deregister(id);
    await removeWorkflow(id);

    await workflow.destroy();
    res.json({ message: 'Workflow deleted' });
});

export const triggerWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { payload, revisionId } = req.body;
    const log = await executeWorkflow(id, req.user.id, payload, { runType: 'test', revisionId, trigger: 'manual-test' });
    res.json(log);
});

export const publishWorkflow = asyncHandler(async (req, res) => {
    const workflow = await publishAutomation({ automationId: req.params.id, userId: req.user.id });
    try {
        await reconcileWorkflow(workflow);
    } catch (error) {
        await workflow.update({ isActive: false, status: 'Trigger setup failed' });
        return res.status(503).json({ message: 'Automation trigger could not be connected.', error: error.message });
    }
    res.json(workflow);
});

export const pauseWorkflow = asyncHandler(async (req, res) => {
    const workflow = await pauseAutomation({ automationId: req.params.id, userId: req.user.id });
    await removeWorkflow(workflow.id);
    res.json(workflow);
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
    const version = await saveAutomationVersion({ automationId: req.params.id, userId: req.user.id, source: req.body?.source || 'system', summary: req.body?.summary || null });
    res.status(201).json(version);
});

export const restoreWorkflowVersion = asyncHandler(async (req, res) => {
    const { id, versionId } = req.params;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    const version = await WorkflowVersion.findOne({ where: { id: versionId, workflowId: id } });
    if (!version) return res.status(404).json({ message: 'Version not found' });

    const validationResponse = workflowValidationResponse(res, {
        nodes: version.nodes || [],
        edges: version.edges || [],
        isActive: workflow.isActive
    });
    if (validationResponse) return validationResponse;
    
    const saved = await saveAutomationDraft({
        automationId: id,
        userId: req.user.id,
        nodes: version.nodes,
        edges: version.edges,
        expectedRevision: workflow.revision,
        source: 'restore',
        summary: `Restored version ${version.versionNumber}`
    });

    res.json(saved.automation);
});
