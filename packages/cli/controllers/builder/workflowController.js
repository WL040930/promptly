import { Op, QueryTypes } from 'sequelize';
import { Workflow, WorkflowVersion } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import { recordTerminalRunMetric } from '../../services/engine/dashboardMetricsService.js';
import { retainRunsForDeletedWorkflow } from '../../services/engine/runRetentionService.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../services/engine/workflowValidator.js';
import { reconcileWorkflow, removeWorkflow } from '../../services/triggers/triggerRuntime.js';
import { normalizeWorkflowForWrite, saveAutomationDraft, publishAutomation, pauseAutomation } from '../../services/automations/automationService.js';
import { deactivateWorkflowTriggerBindings } from '../../services/triggers/workflowTriggerBindingService.js';
import { DEFAULT_AUTOMATION_NAME } from '../../../shared/automationDefaults.js';
import { invalidateDashboardMetrics } from '../dashboard/dashboardController.js';

const graphsMatch = (leftNodes = [], leftEdges = [], rightNodes = [], rightEdges = []) => (
    JSON.stringify(leftNodes || []) === JSON.stringify(rightNodes || [])
    && JSON.stringify(leftEdges || []) === JSON.stringify(rightEdges || [])
);

const releaseSummaryFrom = (workflow, published = null) => {
    return {
        publishedVersionId: published?.id || null,
        publishedVersionNumber: published?.versionNumber || null,
        isLive: Boolean(workflow.isActive && published),
        hasDraftChanges: Boolean(published && !graphsMatch(workflow.nodes, workflow.edges, published.nodes, published.edges))
    };
};

const releaseSummary = async workflow => {
    const published = workflow.publishedRevisionId
        ? await WorkflowVersion.findOne({ where: { id: workflow.publishedRevisionId, workflowId: workflow.id } })
        : null;
    return releaseSummaryFrom(workflow, published);
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

const parsePage = (value, fallback = 1) => Math.max(Number.parseInt(value, 10) || fallback, 1);
const parsePageSize = (value, fallback = 10) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 50);

const workflowWhere = ({ userId, search = '', status = 'All' }) => {
    const where = { userId };
    if (search.trim()) where.name = { [Op.iLike]: `%${search.trim()}%` };
    if (status === 'Active') where.isActive = true;
    if (status === 'Paused') {
        where.isActive = false;
        where.status = 'Paused';
    }
    if (status === 'Draft') {
        where.isActive = false;
        where.status = { [Op.ne]: 'Paused' };
    }
    return where;
};

export const workflowHealthSql = `
    SELECT "workflowId", status, "createdAt", rank
    FROM (
        SELECT "workflowId", status, "createdAt",
            ROW_NUMBER() OVER (PARTITION BY "workflowId" ORDER BY "createdAt" DESC, id DESC) AS rank
        FROM "automation_runs"
        WHERE "userId" = :userId AND "workflowId" IN (:workflowIds)
    ) recent
    WHERE rank <= 5
`;

const healthForWorkflows = async ({ userId, workflowIds }) => {
    if (workflowIds.length === 0) return new Map();
    const rows = await Workflow.sequelize.query(workflowHealthSql, { replacements: { userId, workflowIds }, type: QueryTypes.SELECT });
    const statusesByWorkflow = new Map();
    for (const row of rows) {
        const statuses = statusesByWorkflow.get(row.workflowId) || [];
        statuses.push(row);
        statusesByWorkflow.set(row.workflowId, statuses);
    }
    return new Map(workflowIds.map(id => {
        const runs = statusesByWorkflow.get(id) || [];
        const health = runs.length === 0 ? 'No runs' : runs.some(run => String(run.status || '').toLowerCase() === 'failed') ? 'Needs attention' : 'Healthy';
        const latest = runs.find(run => Number(run.rank) === 1) || null;
        return [id, { health, latestRun: latest ? { status: latest.status, time: latest.createdAt } : null }];
    }));
};

export const getWorkflowListPage = asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.pageSize);
    const status = ['All', 'Active', 'Draft', 'Paused'].includes(req.query.status) ? req.query.status : 'All';
    const health = ['All', 'Healthy', 'Needs attention', 'No runs'].includes(req.query.health) ? req.query.health : 'All';
    const candidates = await Workflow.findAll({
        where: workflowWhere({ userId: req.user.id, search: String(req.query.search || ''), status }),
        attributes: ['id', 'isActive', 'status', 'updatedAt'],
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
    });
    const healthById = await healthForWorkflows({ userId: req.user.id, workflowIds: candidates.map(item => item.id) });
    const filtered = health === 'All' ? candidates : candidates.filter(item => healthById.get(item.id)?.health === health);
    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
    const pageIds = pageItems.map(item => item.id);
    const workflows = pageIds.length > 0
        ? await Workflow.findAll({ where: { id: pageIds, userId: req.user.id }, order: [['updatedAt', 'DESC'], ['id', 'DESC']] })
        : [];
    const publishedIds = [...new Set(workflows.map(workflow => workflow.publishedRevisionId).filter(Boolean))];
    const publishedVersions = publishedIds.length > 0
        ? await WorkflowVersion.findAll({ where: { id: publishedIds }, attributes: ['id', 'workflowId', 'versionNumber', 'nodes', 'edges'] })
        : [];
    const publishedById = new Map(publishedVersions.map(version => [version.id, version]));
    const workflowById = new Map(workflows.map(workflow => [workflow.id, workflow]));
    const items = pageIds.map(id => workflowById.get(id)).filter(Boolean).map(workflow => {
        const value = workflow.toJSON();
        const nodes = Array.isArray(value.nodes) ? value.nodes : [];
        const edges = Array.isArray(value.edges) ? value.edges : [];
        const triggerNodes = nodes.filter(node => node?.type === 'trigger');
        const trigger = triggerNodes[0] || null;
        delete value.nodes;
        delete value.edges;
        return {
            ...value,
            health: healthById.get(workflow.id)?.health || 'No runs',
            latestRun: healthById.get(workflow.id)?.latestRun || null,
            triggerType: trigger?.subType || null,
            triggerTitle: trigger?.title || null,
            triggerCount: triggerNodes.length,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            hasPublishedVersion: Boolean(value.publishedRevisionId),
            release: releaseSummaryFrom(workflow, publishedById.get(value.publishedRevisionId) || null)
        };
    });
    const summary = filtered.reduce((value, workflow) => ({
        active: value.active + (workflow.isActive ? 1 : 0),
        draft: value.draft + (workflow.isActive ? 0 : 1),
        needsAttention: value.needsAttention + (healthById.get(workflow.id)?.health === 'Needs attention' ? 1 : 0)
    }), { active: 0, draft: 0, needsAttention: 0 });
    res.json({ items, pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) }, summary });
});

export const getWorkflows = asyncHandler(async (req, res) => {
    const workflows = await Workflow.findAll({ where: { userId: req.user.id } });
    const publishedIds = [...new Set(workflows.map(workflow => workflow.publishedRevisionId).filter(Boolean))];
    const publishedVersions = publishedIds.length > 0
        ? await WorkflowVersion.findAll({ where: { id: publishedIds }, attributes: ['id', 'workflowId', 'versionNumber', 'nodes', 'edges'] })
        : [];
    const publishedById = new Map(publishedVersions.map(version => [version.id, version]));

    res.json(workflows.map(workflow => {
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
            release: releaseSummaryFrom(workflow, publishedById.get(value.publishedRevisionId) || null)
        };
    }));
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
    const normalized = await normalizeWorkflowForWrite({ nodes, edges, userId: req.user.id, allowDanglingReferences: true });
    const validationResponse = workflowValidationResponse(res, { nodes: normalized.nodes, edges, isActive: false });
    if (validationResponse) return validationResponse;
    const workflow = await Workflow.create({
        name: String(name || '').trim() || DEFAULT_AUTOMATION_NAME, description, isActive: false, status: status || lifecycleStatus || 'Draft', icon, iconColor, iconBg, nodes: normalized.nodes, edges, revision: 1,
        userId: req.user.id
    });
    res.status(201).json({ ...workflow.toJSON(), draftWarnings: normalized.warnings || [], release: await releaseSummary(workflow) });
});

export const updateWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, isActive, status, lifecycleStatus, icon, iconColor, iconBg, nodes, edges, expectedRevision, source = 'visual', summary } = req.body;
    
    let workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });

    const nextNodes = nodes === undefined ? (workflow.nodes || []) : nodes;
    const nextEdges = edges === undefined ? (workflow.edges || []) : edges;
    if (isActive !== undefined) return res.status(400).json({ message: 'Use Publish, Pause, or Resume to change an automation’s live state.' });
    const graphChanged = nodes !== undefined || edges !== undefined;
    // Normalize bindings and legacy references before graph validation. The
    // old order rejected valid user/AI-authored expressions before the
    // persistence layer had a chance to compile them.
    const normalized = Array.isArray(nextNodes) && Array.isArray(nextEdges)
        ? await normalizeWorkflowForWrite({ nodes: nextNodes, edges: nextEdges, userId: req.user.id, allowDanglingReferences: true })
        : { nodes: nextNodes };
    const normalizedNodes = normalized.nodes;
    const validationResponse = workflowValidationResponse(res, { nodes: normalizedNodes, edges: nextEdges, isActive: false });
    if (validationResponse) return validationResponse;

    if (graphChanged) {
        const saved = await saveAutomationDraft({
            automationId: id,
            userId: req.user.id,
            nodes: normalizedNodes,
            edges: nextEdges,
            expectedRevision,
            source,
            summary
        });
        workflow = saved.automation;
    } else {
        // Metadata edits still persist the workflow record. Normalize a
        // historical graph before that write so an old raw reference cannot
        // survive an otherwise unrelated save.
        if (JSON.stringify(normalizedNodes) !== JSON.stringify(workflow.nodes || [])) {
            await workflow.update({ nodes: normalizedNodes });
        }
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

    res.json({ ...workflow.toJSON(), draftWarnings: normalized.warnings || [], release: await releaseSummary(workflow) });
});

export const deleteWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    
    // Stop external work before removing the live automation. Historical runs
    // are handled in the database transaction below and are never destroyed.
    SchedulerService.deregister(id);
    await removeWorkflow(id);

    let deletionSummary = null;
    let deleted = false;
    await sequelize.transaction(async transaction => {
        const currentWorkflow = await Workflow.findOne({
            where: { id, userId: req.user.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!currentWorkflow) return;

        deletionSummary = await retainRunsForDeletedWorkflow({
            workflowId: id,
            userId: req.user.id,
            workflowName: currentWorkflow.name,
            transaction
        });
        await currentWorkflow.destroy({ transaction });
        deleted = true;
    });

    if (!deleted) return res.status(404).json({ message: 'Workflow not found' });

    invalidateDashboardMetrics(req.user.id);

    // Metrics use their own idempotent transaction and must run after the
    // deletion transaction commits. A metrics failure must not undo deletion
    // or put the retained run history at risk.
    await Promise.all((deletionSummary?.cancelledRunIds || []).map(runId => (
        recordTerminalRunMetric(runId).catch(error => {
            console.warn(`[RunRetention] Could not record cancelled run metric ${runId}:`, error.message);
        })
    )));

    res.json({
        message: 'Workflow deleted',
        runsRetained: deletionSummary?.retainedRunCount || 0,
        runsCancelled: deletionSummary?.cancelledRunIds?.length || 0
    });
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
        await deactivateWorkflowTriggerBindings({ workflowId: workflow.id });
        const message = error.code === 'TRIGGER_PUBLIC_ORIGIN_REQUIRED'
            ? error.message
            : 'Automation trigger could not be connected.';
        return res.status(503).json({
            message,
            code: error.code || 'TRIGGER_CONNECTION_FAILED',
            error: error.message
        });
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
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id }, attributes: ['id'] });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.pageSize, 20);
    const where = { workflowId: id };
    if (req.query.source) where.source = String(req.query.source);
    const { rows, count } = await WorkflowVersion.findAndCountAll({
        where,
        order: [['versionNumber', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize
    });
    res.json({
        data: rows.map(version => {
            const value = version.toJSON();
            const nodes = Array.isArray(value.nodes) ? value.nodes : [];
            const edges = Array.isArray(value.edges) ? value.edges : [];
            delete value.nodes;
            delete value.edges;
            return { ...value, nodeCount: nodes.length, edgeCount: edges.length };
        }),
        pagination: { page, pageSize, total: count, totalPages: Math.max(Math.ceil(count / pageSize), 1) }
    });
});

export const getWorkflowVersion = asyncHandler(async (req, res) => {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, userId: req.user.id }, attributes: ['id'] });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    const version = await WorkflowVersion.findOne({ where: { id: req.params.versionId, workflowId: workflow.id } });
    if (!version) return res.status(404).json({ message: 'Workflow version not found' });
    res.json(version);
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
