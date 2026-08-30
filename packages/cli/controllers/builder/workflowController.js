import { Op, QueryTypes } from 'sequelize';
import { Workflow, WorkflowVersion } from '../../models/index.js';
import sequelize from '../../db/index.js';
import { recordTerminalRunMetric } from '../../services/engine/dashboardMetricsService.js';
import { retainRunsForDeletedWorkflow } from '../../services/engine/runRetentionService.js';
import asyncHandler from '../../utils/asyncHandler.js';
import SchedulerService from '../../services/scheduler/schedulerService.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../services/engine/workflowValidator.js';
import { removeWorkflow } from '../../services/triggers/triggerRuntime.js';
import { normalizeWorkflowForWrite, saveAutomationDraft } from '../../services/automations/automationService.js';
import { performWorkflowLifecycleAction } from '../../services/automations/workflowLifecycleService.js';
import { DEFAULT_AUTOMATION_NAME } from '../../../shared/automationDefaults.js';
import { invalidateDashboardMetrics } from '../dashboard/dashboardController.js';
import {
    assertWritableWorkspaceRecord,
    demoKeyForScope,
    workspaceScopeFromRequest,
    workspaceWhere
} from '../../utils/workspaceScope.js';

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

const parsePage = (value, fallback = 1) => Math.max(Number.parseInt(value, 10) || fallback, 1);
const parsePageSize = (value, fallback = 10) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 50);

const workflowWhere = ({ userId, scope = 'live', search = '', status = 'All', extra = {} }) => {
    const where = workspaceWhere({ userId, scope, extra });
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
        WHERE "userId" = :userId
          AND "demoKey" IS NOT DISTINCT FROM :demoKey
          AND "workflowId" IN (:workflowIds)
    ) recent
    WHERE rank <= 5
`;

const healthForWorkflows = async ({ userId, scope = 'live', workflowIds }) => {
    if (workflowIds.length === 0) return new Map();
    const rows = await Workflow.sequelize.query(workflowHealthSql, {
        replacements: { userId, demoKey: demoKeyForScope(scope), workflowIds },
        type: QueryTypes.SELECT
    });
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
    const scope = workspaceScopeFromRequest(req);
    const candidates = await Workflow.findAll({
        where: workflowWhere({ userId: req.user.id, scope, search: String(req.query.search || ''), status }),
        attributes: ['id', 'isActive', 'status', 'updatedAt'],
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
    });
    const healthById = await healthForWorkflows({ userId: req.user.id, scope, workflowIds: candidates.map(item => item.id) });
    const filtered = health === 'All' ? candidates : candidates.filter(item => healthById.get(item.id)?.health === health);
    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
    const pageIds = pageItems.map(item => item.id);
    const workflows = pageIds.length > 0
        ? await Workflow.findAll({ where: workflowWhere({ userId: req.user.id, scope, extra: { id: pageIds } }), order: [['updatedAt', 'DESC'], ['id', 'DESC']] })
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
    const scope = workspaceScopeFromRequest(req);
    const workflows = await Workflow.findAll({ where: workspaceWhere({ userId: req.user.id, scope }) });
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
    const scope = workspaceScopeFromRequest(req);
    const workflow = await Workflow.findOne({ 
        where: workspaceWhere({ userId: req.user.id, scope, extra: { id } })
    });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    res.json({ ...workflow.toJSON(), release: await releaseSummary(workflow) });
});

export const createWorkflow = asyncHandler(async (req, res) => {
    if (workspaceScopeFromRequest(req) === 'demo') {
        return res.status(409).json({ code: 'DEMO_WORKSPACE_READ_ONLY', message: 'The sample workspace is read-only. Exit sample workspace to create an automation.' });
    }
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
    assertWritableWorkspaceRecord(workflow);

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
    assertWritableWorkspaceRecord(workflow);
    
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
        assertWritableWorkspaceRecord(currentWorkflow);

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
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    assertWritableWorkspaceRecord(workflow);
    const { payload, revisionId } = req.body;
    const result = await performWorkflowLifecycleAction({
        workflowId: id,
        userId: req.user.id,
        action: 'test_run',
        payload,
        revisionId,
        trigger: 'manual-test'
    });
    res.json(result.run);
});

export const triggerProductionWorkflow = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    assertWritableWorkspaceRecord(workflow);
    const result = await performWorkflowLifecycleAction({
        workflowId: id,
        userId: req.user.id,
        action: 'live_run',
        payload: req.body?.payload || {},
        trigger: 'manual-production'
    });
    res.json(result.run);
});

export const publishWorkflow = asyncHandler(async (req, res) => {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    assertWritableWorkspaceRecord(workflow);
    const result = await performWorkflowLifecycleAction({
        workflowId: req.params.id,
        userId: req.user.id,
        action: 'publish'
    });
    res.json({ ...result.workflow.toJSON(), release: await releaseSummary(result.workflow) });
});

export const pauseWorkflow = asyncHandler(async (req, res) => {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    assertWritableWorkspaceRecord(workflow);
    const result = await performWorkflowLifecycleAction({
        workflowId: req.params.id,
        userId: req.user.id,
        action: 'pause'
    });
    res.json({ ...result.workflow.toJSON(), release: await releaseSummary(result.workflow) });
});

// --- Versioning Endpoints ---

export const getWorkflowVersions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scope = workspaceScopeFromRequest(req);
    const workflow = await Workflow.findOne({ where: workspaceWhere({ userId: req.user.id, scope, extra: { id } }), attributes: ['id'] });
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
    const scope = workspaceScopeFromRequest(req);
    const workflow = await Workflow.findOne({ where: workspaceWhere({ userId: req.user.id, scope, extra: { id: req.params.id } }), attributes: ['id'] });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    const version = await WorkflowVersion.findOne({ where: { id: req.params.versionId, workflowId: workflow.id } });
    if (!version) return res.status(404).json({ message: 'Workflow version not found' });
    res.json(version);
});

export const restoreWorkflowVersion = asyncHandler(async (req, res) => {
    const { id, versionId } = req.params;
    
    const workflow = await Workflow.findOne({ where: { id, userId: req.user.id } });
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    assertWritableWorkspaceRecord(workflow);
    
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
