import { Workflow, WorkflowVersion } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../services/engine/workflowValidator.js';
import { reconcileWorkflow, removeWorkflow } from '../../services/triggers/triggerRuntime.js';
import { saveAutomationDraft, publishAutomation, pauseAutomation } from '../../services/automations/automationService.js';

const graphsMatch = (leftNodes = [], leftEdges = [], rightNodes = [], rightEdges = []) => (
    JSON.stringify(leftNodes || []) === JSON.stringify(rightNodes || [])
    && JSON.stringify(leftEdges || []) === JSON.stringify(rightEdges || [])
);

const releaseSummary = async workflow => {
    const published = workflow.publishedRevisionId
        ? await WorkflowVersion.findOne({ where: { id: workflow.publishedRevisionId, workflowId: workflow.id } })
        : null;
    return {
        publishedVersionId: published?.id || null,
        publishedVersionNumber: published?.versionNumber || null,
        isLive: Boolean(workflow.isActive && published),
        hasDraftChanges: Boolean(published && !graphsMatch(workflow.nodes, workflow.edges, published.nodes, published.edges))
    };
};

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
    const workflows = await Workflow.findAll({ where: { userId: req.user.id } });
    res.json(await Promise.all(workflows.map(async workflow => {
        const value = workflow.toJSON();
        const nodes = Array.isArray(value.nodes) ? value.nodes : [];
        const edges = Array.isArray(value.edges) ? value.edges : [];
        const triggerNodes = nodes.filter(node => node?.type === 'trigger');
        const trigger = triggerNodes[0] || null;
        // Keep the list response compact while exposing the information needed
        // to render a useful automation summary and run controls.
        delete value.nodes;
        delete value.edges;
        return {
            ...value,
            triggerType: trigger?.subType || null,
            triggerTitle: trigger?.title || null,
            triggerCount: triggerNodes.length,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            hasPublishedVersion: Boolean(value.publishedRevisionId),
            release: await releaseSummary(workflow)
        };
    })));
});

export const getWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ 
        where: { id, userId: req.user.id } 
    });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    res.json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
});

export const createWorkflow = asyncHandler(async (req, res) => {
    const { name, description, status, lifecycleStatus, icon, iconColor, iconBg, nodes = [], edges = [] } = req.body;
    const validationResponse = workflowValidationResponse(res, { nodes, edges, isActive: false });
    if (validationResponse) return validationResponse;
    const workflow = await Workflow.create({
        name, description, isActive: false, status: status || lifecycleStatus || 'Draft', icon, iconColor, iconBg, nodes, edges, revision: 1,
        userId: req.user.id
    });
    res.status(201).json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
});

export const updateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, isActive, status, lifecycleStatus, icon, iconColor, iconBg, nodes, edges, expectedRevision, source = 'visual', summary } = req.body;
    
    let workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });

    const nextNodes = nodes === undefined ? (workflow.nodes || []) : nodes;
    const nextEdges = edges === undefined ? (workflow.edges || []) : edges;
    if (isActive !== undefined) return res.status(400).json({ message: 'Use Publish, Pause, or Resume to change an automation’s live state.' });
    const validationResponse = workflowValidationResponse(res, { nodes: nextNodes, edges: nextEdges, isActive: false });
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
        ...(status !== undefined || lifecycleStatus !== undefined ? { status: status || lifecycleStatus } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(iconColor !== undefined ? { iconColor } : {}),
        ...(iconBg !== undefined ? { iconBg } : {})
    });

    // Draft updates must not change live subscriptions. The publish lifecycle
    // is the only place that reconciles triggers and schedules.

    res.json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
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

export const triggerProductionWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    if (!workflow.publishedRevisionId) return res.status(409).json({ message: 'Publish this automation before running it live.' });
    if (!workflow.isActive) return res.status(409).json({ message: 'Activate this automation before running it live.' });

    const log = await executeWorkflow(id, req.user.id, req.body?.payload || {}, {
        runType: 'production',
        revisionId: workflow.publishedRevisionId,
        trigger: 'manual-production'
    });
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
    syncSchedule(workflow.id, req.user.id, workflow.nodes, true);
    res.json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
});

export const pauseWorkflow = asyncHandler(async (req, res) => {
    const workflow = await pauseAutomation({ automationId: req.params.id, userId: req.user.id });
    await removeWorkflow(workflow.id);
    SchedulerService.deregister(workflow.id);
    res.json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
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
