import Workflow from '../../models/workflows/Workflow.js';
import WorkflowVersion from '../../models/workflows/WorkflowVersion.js';
import { Op } from 'sequelize';
import { AutomationRun, WorkflowContinuation } from '../../models/index.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { NodeFactory } from '../../../nodes/NodeFactory.js';
import { validateWorkflow } from './workflowValidator.js';
import { buildExecutionGraph, mergeExecutionResult, selectOutgoingEdges } from './executionGraph.js';
import { recordTerminalRunMetric } from './dashboardMetricsService.js';

const validationError = issues => new Error(
    `Workflow validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`
);

const RUN_CANCELLED_CODE = 'RUN_CANCELLED';
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const runCancelledError = () => Object.assign(
    new Error('Automation was deleted while this run was executing.'),
    { code: RUN_CANCELLED_CODE }
);
const workflowNotFoundError = () => Object.assign(
    new Error('Workflow not found'),
    { code: 'WORKFLOW_NOT_FOUND', status: 404 }
);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const defineRuntime = (contextData, runtimeState) => {
    Object.defineProperty(contextData, '__runtime', {
        value: runtimeState,
        enumerable: false,
        configurable: true,
        writable: true
    });
    return contextData;
};

const serializeState = ({ contextData, incomingRemaining, activeIncoming, activeIncomingSources, queued, settled, queue, unhandledFailures, stepLogs, workflowOutput, suspendedNodeId = null, suspendedInputNodeIds = [] }) => ({
    contextData: clone(contextData),
    incomingRemaining: [...incomingRemaining.entries()],
    activeIncoming: [...activeIncoming.entries()],
    activeIncomingSources: [...activeIncomingSources.entries()],
    queued: [...queued],
    settled: [...settled],
    queue: clone(queue),
    unhandledFailures: [...unhandledFailures.entries()],
    stepLogs: clone(stepLogs),
    workflowOutput: clone(workflowOutput),
    suspendedNodeId,
    suspendedInputNodeIds: clone(suspendedInputNodeIds)
});

const restoreState = state => ({
    contextData: state.contextData || {},
    incomingRemaining: new Map(state.incomingRemaining || []),
    activeIncoming: new Map(state.activeIncoming || []),
    activeIncomingSources: new Map(state.activeIncomingSources || []),
    queued: new Set(state.queued || []),
    settled: new Set(state.settled || []),
    queue: state.queue || [],
    unhandledFailures: new Map(state.unhandledFailures || []),
    stepLogs: state.stepLogs || [],
    workflowOutput: state.workflowOutput || null,
    suspendedNodeId: state.suspendedNodeId || null,
    suspendedInputNodeIds: state.suspendedInputNodeIds || []
});

const logDataFor = ({ workflowId, workflowNameSnapshot, revisionId, userId, status, trigger, error, steps, output, durationMs }) => ({
    workflowId,
    ...(workflowNameSnapshot ? { workflowNameSnapshot } : {}),
    revisionId,
    userId,
    durationMs,
    status,
    trigger: trigger || 'Manual Test Run',
    tags: ['Engine', status],
    error,
    steps,
    output
});

const persistLog = async ({ run, ...data }) => {
    const payload = logDataFor(data);
    if (run) {
        const [updatedCount, updatedRows] = await AutomationRun.update({
            ...payload,
            completedAt: TERMINAL_RUN_STATUSES.has(payload.status) ? new Date() : null
        }, {
            where: { id: run.id, status: { [Op.ne]: 'cancelled' } },
            returning: true
        });
        const saved = updatedCount > 0
            ? updatedRows[0]
            : await AutomationRun.findByPk(run.id) || run;
        if (TERMINAL_RUN_STATUSES.has(saved.status)) await recordTerminalRunMetric(saved.id);
        return saved;
    }
    const created = await AutomationRun.create(payload);
    if (TERMINAL_RUN_STATUSES.has(payload.status)) await recordTerminalRunMetric(created.id);
    return created;
};

const currentRun = async run => AutomationRun.findByPk(run.id, {
    attributes: ['id', 'status', 'workflowNameSnapshot', 'workflowDeletedAt']
});

const assertRunCanContinue = async run => {
    const latest = await currentRun(run);
    if (!latest || latest.status === 'cancelled') throw runCancelledError();
    return latest;
};

const updateRunIfActive = async (run, values) => {
    const [updatedCount, updatedRows] = await AutomationRun.update(values, {
        where: { id: run.id, status: { [Op.ne]: 'cancelled' } },
        returning: true
    });
    return updatedCount > 0
        ? updatedRows[0]
        : await AutomationRun.findByPk(run.id) || run;
};

const createContinuation = async ({ run, node, suspension }) => {
    return WorkflowContinuation.sequelize.transaction(async transaction => {
        const lockedRun = await AutomationRun.findByPk(run.id, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!lockedRun || lockedRun.status === 'cancelled') return { continuation: null, cancelled: true };
        const continuation = await WorkflowContinuation.create({
            runId: lockedRun.id,
            workflowId: lockedRun.workflowId,
            userId: lockedRun.userId,
            nodeId: node.id,
            kind: suspension.kind,
            status: 'pending',
            availableAt: new Date(suspension.availableAt || Date.now()),
            payload: suspension.payload || {}
        }, { transaction });
        return { continuation, cancelled: false };
    });
};

const resolveSuspendedResult = ({ node, resumeResult }) => ({
    success: true,
    outputData: resumeResult,
    ...(resumeResult?.targetHandle ? { targetHandle: resumeResult.targetHandle } : {}),
    ...(node.subType === 'approval' && resumeResult?.decision ? { targetHandle: resumeResult.decision === 'approved' ? 'approved' : 'rejected' } : {})
});

const initializeRun = async ({ workflowId, userId, triggerPayload, executionOptions }) => (
    Workflow.sequelize.transaction(async transaction => {
        // A delete takes this same workflow-row lock before retaining runs.
        // This makes run creation and deletion mutually exclusive: either the
        // new run is visible to retention, or creation fails after deletion.
        const workflow = await Workflow.findOne({
            where: { id: workflowId, userId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!workflow) throw workflowNotFoundError();

        // Live runs are pinned to a published revision. Test runs execute
        // the current working draft, including edits that have not yet been
        // saved into version history.
        const executedRevisionId = executionOptions.revisionId
            || (executionOptions.runType === 'production' ? workflow.publishedRevisionId : null)
            || null;
        const revision = executedRevisionId
            ? await WorkflowVersion.findOne({ where: { id: executedRevisionId, workflowId: workflow.id }, transaction })
            : null;
        const nodes = revision?.nodes || workflow.nodes || [];
        const edges = revision?.edges || workflow.edges || [];
        if (nodes.length === 0) throw new Error('Workflow has no nodes to execute');
        const validation = validateWorkflow({ nodes, edges, isActive: executionOptions.runType === 'production', registry: NodeRegistry });
        if (!validation.valid) throw validationError(validation.issues);

        const eventId = executionOptions.eventId || triggerPayload?.idempotencyKey || triggerPayload?.responseId || triggerPayload?.eventId || triggerPayload?.requestId;
        const contextData = {
            initialPayload: triggerPayload,
            metadata: {
                userId,
                workflowId,
                runType: executionOptions.runType || 'manual',
                errors: [],
                ...(eventId ? { idempotencyKey: String(eventId) } : {}),
                ...(executionOptions.correlationId ? { correlationId: executionOptions.correlationId } : {}),
                ...(executionOptions.causationId ? { causationId: executionOptions.causationId } : {}),
                ...(Number.isInteger(executionOptions.depth) ? { depth: executionOptions.depth } : {})
            }
        };
        const graph = buildExecutionGraph(nodes, edges);
        const state = {
            contextData,
            incomingRemaining: new Map([...graph.incoming.entries()].map(([id, incoming]) => [id, incoming.length])),
            activeIncoming: new Map(nodes.map(node => [node.id, 0])),
            activeIncomingSources: new Map(nodes.map(node => [node.id, []])),
            queued: new Set(),
            settled: new Set(),
            queue: [],
            unhandledFailures: new Map(),
            stepLogs: [],
            workflowOutput: null,
            suspendedNodeId: null,
            suspendedInputNodeIds: []
        };
        const workflowNameSnapshot = workflow.name || null;
        const run = await AutomationRun.create({
            workflowId,
            userId,
            revisionId: executedRevisionId || null,
            definitionSnapshot: { revisionId: executedRevisionId || null, nodes: clone(nodes), edges: clone(edges) },
            workflowNameSnapshot,
            status: 'running',
            trigger: executionOptions.trigger || 'Manual Test Run',
            state: {}
        }, { transaction });
        return { workflow, nodes, edges, state, run, workflowNameSnapshot, executedRevisionId };
    })
);

export const executeWorkflow = async (workflowId, userId, triggerPayload = {}, executionOptions = {}) => {
    const startTime = Date.now();
    let run = null;
    let executedRevisionId = executionOptions.revisionId || null;
    let status = 'succeeded';
    let errorMsg = null;
    let workflowNameSnapshot = null;

    try {
        let workflow;
        let nodes;
        let edges;
        let state;

        if (executionOptions.resumeRunId) {
            run = await AutomationRun.findOne({ where: { id: executionOptions.resumeRunId, workflowId, userId } });
            if (!run) throw new Error('Workflow run not found.');
            if (run.status !== 'waiting') {
                throw Object.assign(new Error('Workflow run is not waiting for a continuation.'), { code: 'RUN_NOT_WAITING' });
            }
            workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
            if (!workflow) throw workflowNotFoundError();
            workflowNameSnapshot = run.workflowNameSnapshot || workflow.name || null;
            executedRevisionId = run.revisionId;
            const revision = await WorkflowVersion.findOne({ where: { id: executedRevisionId, workflowId } });
            nodes = revision?.nodes || workflow.nodes || [];
            edges = revision?.edges || workflow.edges || [];
            state = restoreState(run.state || {});
        } else {
            const initialized = await initializeRun({ workflowId, userId, triggerPayload, executionOptions });
            ({ workflow, nodes, edges, state, run, workflowNameSnapshot, executedRevisionId } = initialized);
            state.contextData.metadata.runId = run.id;
            for (const node of nodes) {
                if ((state.incomingRemaining.get(node.id) || 0) === 0) {
                    state.queued.add(node.id);
                    state.queue.push({ nodeId: node.id, shouldExecute: true, inputNodeIds: [] });
                }
            }
        }

        if (!run) throw new Error('Workflow run could not be initialized.');
        await assertRunCanContinue(run);
        const graph = buildExecutionGraph(nodes, edges);
        const nodeMap = new Map(nodes.map(nodeData => [nodeData.id, NodeFactory.createNode(nodeData)]));
        const runtimeState = { incomingNodeIds: [], currentNodeId: null };
        defineRuntime(state.contextData, runtimeState);

        const schedule = (nodeId, shouldExecute, inputNodeIds = []) => {
            if (state.queued.has(nodeId) || state.settled.has(nodeId)) return;
            state.queued.add(nodeId);
            state.queue.push({ nodeId, shouldExecute, inputNodeIds });
        };

        const completeNode = (nodeId, node, executionResult, inputNodeIds, stepDetails = null, stepStatus = 'success') => {
            state.settled.add(nodeId);
            mergeExecutionResult(state.contextData, node, executionResult);
            if (['formatResponse', 'respondWebhook'].includes(node.subType) && executionResult.success !== false) state.workflowOutput = executionResult.outputData || null;
            if (node.subType === 'catchError' && executionResult.handledError && executionResult.failedNodeId) {
                const handledFailure = state.unhandledFailures.get(executionResult.failedNodeId);
                if (handledFailure) {
                    handledFailure.handled = true;
                    state.unhandledFailures.delete(executionResult.failedNodeId);
                }
            }
            state.stepLogs.push({
                nodeId,
                name: node.title || node.type,
                type: node.type,
                subType: node.subType,
                status: stepStatus,
                time: stepDetails?.time || '0ms',
                details: stepDetails?.details || `Successfully executed ${node.title || node.type} (${node.subType})`,
                ...(executionResult.logEntry ? { metadata: executionResult.logEntry } : {}),
                ...(stepStatus === 'failed' ? { errorCode: executionResult.errorCode || executionResult.code || null } : {})
            });
            const outgoing = graph.outgoing.get(nodeId) || [];
            const selected = selectOutgoingEdges(node, executionResult, outgoing, nodeMap);
            const selectedIds = new Set(selected.map(edge => edge.id));
            for (const edge of outgoing) {
                state.incomingRemaining.set(edge.target, state.incomingRemaining.get(edge.target) - 1);
                if (selectedIds.has(edge.id)) {
                    state.activeIncoming.set(edge.target, state.activeIncoming.get(edge.target) + 1);
                    state.activeIncomingSources.get(edge.target).push(nodeId);
                }
                if (state.incomingRemaining.get(edge.target) === 0) {
                    schedule(edge.target, (state.activeIncoming.get(edge.target) || 0) > 0, state.activeIncomingSources.get(edge.target));
                }
            }
        };

        if (state.suspendedNodeId && executionOptions.resumeResult) {
            const node = nodeMap.get(state.suspendedNodeId);
            if (!node) throw new Error('Suspended node no longer exists in the workflow revision.');
            const previous = [...state.stepLogs].reverse().find(step => step.name === (node.title || node.type) && step.status === 'waiting');
            if (previous) {
                previous.status = executionOptions.resumeResult.decision === 'rejected' ? 'rejected' : 'success';
                previous.details = `Continuation resolved with ${executionOptions.resumeResult.decision || 'completed'}.`;
            }
            completeNode(state.suspendedNodeId, node, resolveSuspendedResult({ node, resumeResult: executionOptions.resumeResult }), state.suspendedInputNodeIds);
            state.suspendedNodeId = null;
            state.suspendedInputNodeIds = [];
            const resumedRun = await updateRunIfActive(run, { status: 'running', suspendedNodeId: null, state: serializeState(state) });
            if (resumedRun.status === 'cancelled') throw runCancelledError();
        }

        while (state.queue.length > 0) {
            await assertRunCanContinue(run);
            const { nodeId, shouldExecute, inputNodeIds } = state.queue.shift();
            state.queued.delete(nodeId);
            if (state.settled.has(nodeId)) continue;
            const node = nodeMap.get(nodeId);
            const stepStartTime = Date.now();
            runtimeState.incomingNodeIds = inputNodeIds;
            runtimeState.currentNodeId = nodeId;

            if (!shouldExecute) {
                completeNode(nodeId, node, { success: true, skipped: true, outputData: null }, inputNodeIds, { time: `${Date.now() - stepStartTime}ms`, details: 'Skipped because no incoming branch was selected.' }, 'skipped');
                continue;
            }

            let executionResult;
            let stepStatus = 'success';
            let stepDetails = null;
            try {
                const validationResult = node.validate?.(state.contextData);
                if (validationResult === false) throw new Error(`Node validation failed for ${node.title || node.type}`);
                executionResult = await node.execute(state.contextData);
                executionResult = executionResult ?? { success: true };
                if (executionResult.success === false) {
                    stepStatus = 'failed';
                    const failure = { nodeId, node: node.title || node.type, error: executionResult.error || `Node ${node.title || node.type} reported failure.`, handled: false };
                    state.unhandledFailures.set(nodeId, failure);
                    state.contextData.metadata.errors.push(failure);
                    errorMsg ||= failure.error;
                    stepDetails = executionResult.error || 'Node reported failure.';
                } else {
                    stepDetails = executionResult.details || `Successfully executed ${node.title || node.type} (${node.subType})`;
                }
            } catch (error) {
                if (error.code === RUN_CANCELLED_CODE) throw error;
                executionResult = { success: false, error: error.message };
                stepStatus = 'failed';
                const failure = { nodeId, node: node.title || node.type, error: error.message, handled: false };
                state.unhandledFailures.set(nodeId, failure);
                state.contextData.metadata.errors.push(failure);
                errorMsg ||= error.message;
                stepDetails = `Execution failed: ${error.message}`;
            }

            if (executionResult.suspend) {
                await assertRunCanContinue(run);
                const { continuation, cancelled } = await createContinuation({ run, node, suspension: executionResult.suspend });
                if (cancelled) throw runCancelledError();
                state.suspendedNodeId = nodeId;
                state.suspendedInputNodeIds = inputNodeIds;
                state.stepLogs.push({ nodeId, name: node.title || node.type, type: node.type, subType: node.subType, status: 'waiting', time: `${Date.now() - stepStartTime}ms`, details: `Waiting for ${executionResult.suspend.kind}.`, continuationId: continuation.id });
                const waitingRun = await updateRunIfActive(run, { status: 'waiting', suspendedNodeId: nodeId, state: serializeState(state) });
                const waitingLog = await persistLog({ run: waitingRun, workflowId, workflowNameSnapshot, revisionId: executedRevisionId, userId, status: 'waiting', trigger: executionOptions.trigger, error: null, steps: state.stepLogs, output: state.workflowOutput, durationMs: Date.now() - startTime });
                return { ...waitingLog.toJSON(), continuationId: continuation.id };
            }

            await assertRunCanContinue(run);
            completeNode(nodeId, node, executionResult, inputNodeIds, { time: `${Date.now() - stepStartTime}ms`, details: stepDetails }, stepStatus);
        }

        const unresolved = nodes.filter(node => !state.settled.has(node.id));
        if (unresolved.length > 0) {
            status = 'failed';
            errorMsg ||= `Execution stopped before reaching nodes: ${unresolved.map(node => node.id).join(', ')}`;
        } else if (state.unhandledFailures.size > 0) {
            status = 'failed';
            errorMsg = [...state.unhandledFailures.values()][0].error;
        }
        const terminalRun = await updateRunIfActive(run, { status, error: errorMsg, state: serializeState(state), suspendedNodeId: null });
        if (terminalRun.status === 'cancelled') return terminalRun;
        return persistLog({ run: terminalRun, workflowId, workflowNameSnapshot, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: state.stepLogs, output: state.workflowOutput, durationMs: Date.now() - startTime });
    } catch (error) {
        if (error.code === 'RUN_NOT_WAITING') throw error;
        if (error.code === 'WORKFLOW_NOT_FOUND') throw error;
        if (error.code === RUN_CANCELLED_CODE) {
            if (!run) return null;
            return await AutomationRun.findByPk(run.id) || run;
        }
        status = 'failed';
        errorMsg = errorMsg || error.message;
        if (run) {
            const failedRun = await updateRunIfActive(run, { status: 'failed', error: errorMsg, completedAt: new Date() }).catch(() => run);
            if (failedRun.status === 'cancelled') return failedRun;
            return persistLog({ run: failedRun, workflowId, workflowNameSnapshot, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: [], output: null, durationMs: Date.now() - startTime });
        }
        return AutomationRun.create(logDataFor({ workflowId, workflowNameSnapshot, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: [], output: null, durationMs: Date.now() - startTime }));
    }
};

export const resumeWorkflowRun = ({ run, userId, resolution }) => executeWorkflow(run.workflowId, userId, {}, {
    resumeRunId: run.id,
    resumeResult: resolution,
    runType: 'production',
    trigger: run.trigger || 'continuation'
});
