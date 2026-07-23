import crypto from 'node:crypto';
import env from '../../config/env.js';
import { sendEmail } from '../../utils/email.js';
import Workflow from '../../models/workflows/Workflow.js';
import WorkflowVersion from '../../models/workflows/WorkflowVersion.js';
import { AutomationRun, WorkflowContinuation } from '../../models/index.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { NodeFactory } from '../../../nodes/NodeFactory.js';
import { validateWorkflow } from './workflowValidator.js';
import { buildExecutionGraph, mergeExecutionResult, selectOutgoingEdges } from './executionGraph.js';

const validationError = issues => new Error(
    `Workflow validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`
);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

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

const logDataFor = ({ workflowId, revisionId, userId, status, trigger, error, steps, output, durationMs }) => ({
    workflowId,
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
        await run.update({ ...payload, completedAt: ['Waiting', 'Success'].includes(payload.status) ? run.completedAt : new Date() });
        return run;
    }
    return AutomationRun.create(payload);
};

const createContinuation = async ({ run, node, suspension }) => {
    const token = suspension.kind === 'approval' ? crypto.randomBytes(32).toString('hex') : null;
    const continuation = await WorkflowContinuation.create({
        runId: run.id,
        workflowId: run.workflowId,
        userId: run.userId,
        nodeId: node.id,
        kind: suspension.kind,
        status: 'pending',
        availableAt: new Date(suspension.availableAt || Date.now()),
        expiresAt: suspension.expiresAt ? new Date(suspension.expiresAt) : null,
        assigneeEmail: suspension.assigneeEmail || null,
        assigneeUserId: suspension.assigneeUserId || null,
        tokenHash: token ? hash(token) : null,
        payload: suspension.payload || {}
    });
    if (token && suspension.assigneeEmail) {
        const approvalUrl = `${env.app.clientOrigin}/app/approvals?token=${encodeURIComponent(token)}`;
        await sendEmail({
            to: suspension.assigneeEmail,
            subject: `Approval required: ${suspension.payload?.title || 'Workflow review'}`,
            text: `${suspension.payload?.instructions || 'A workflow is waiting for your review.'}\n\nOpen Promptly to decide: ${approvalUrl}`,
            html: `<p>${String(suspension.payload?.instructions || 'A workflow is waiting for your review.').replaceAll('<', '&lt;')}</p><p><a href="${approvalUrl}">Open approval in Promptly</a></p>`
        });
    }
    return { continuation, token };
};

const resolveSuspendedResult = ({ node, resumeResult }) => ({
    success: true,
    outputData: resumeResult,
    ...(resumeResult?.targetHandle ? { targetHandle: resumeResult.targetHandle } : {}),
    ...(node.subType === 'approval' && resumeResult?.decision ? { targetHandle: resumeResult.decision === 'approved' ? 'approved' : 'rejected' } : {})
});

export const executeWorkflow = async (workflowId, userId, triggerPayload = {}, executionOptions = {}) => {
    const startTime = Date.now();
    let run = null;
    let executedRevisionId = executionOptions.revisionId || null;
    let status = 'Success';
    let errorMsg = null;

    try {
        let workflow;
        let nodes;
        let edges;
        let state;

        if (executionOptions.resumeRunId) {
            run = await AutomationRun.findOne({ where: { id: executionOptions.resumeRunId, workflowId, userId } });
            if (!run) throw new Error('Workflow run not found.');
            if (run.status !== 'waiting') throw new Error('Workflow run is not waiting for a continuation.');
            workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
            if (!workflow) throw new Error('Workflow not found');
            executedRevisionId = run.revisionId;
            const revision = await WorkflowVersion.findOne({ where: { id: executedRevisionId, workflowId } });
            nodes = revision?.nodes || workflow.nodes || [];
            edges = revision?.edges || workflow.edges || [];
            state = restoreState(run.state || {});
        } else {
            workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
            if (!workflow) throw new Error('Workflow not found');
            executedRevisionId = executionOptions.revisionId || (executionOptions.runType === 'production' ? workflow.publishedRevisionId : workflow.draftRevisionId) || null;
            const revision = executedRevisionId ? await WorkflowVersion.findOne({ where: { id: executedRevisionId, workflowId: workflow.id } }) : null;
            nodes = revision?.nodes || workflow.nodes || [];
            edges = revision?.edges || workflow.edges || [];
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
            state = {
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
            run = await AutomationRun.create({
                workflowId,
                userId,
                revisionId: executedRevisionId || null,
                status: 'running',
                trigger: executionOptions.trigger || 'Manual Test Run',
                state: {}
            });
            state.contextData.metadata.runId = run.id;
            for (const node of nodes) {
                if ((state.incomingRemaining.get(node.id) || 0) === 0) {
                    state.queued.add(node.id);
                    state.queue.push({ nodeId: node.id, shouldExecute: true, inputNodeIds: [] });
                }
            }
        }

        if (!run) throw new Error('Workflow run could not be initialized.');
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
                name: node.title || node.type,
                type: node.type,
                status: stepStatus,
                time: stepDetails?.time || '0ms',
                details: stepDetails?.details || `Successfully executed ${node.title || node.type} (${node.subType})`,
                ...(executionResult.logEntry ? { metadata: executionResult.logEntry } : {})
            });
            const outgoing = graph.outgoing.get(nodeId) || [];
            const selected = selectOutgoingEdges(node, executionResult, outgoing);
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
            await run.update({ status: 'running', suspendedNodeId: null, state: serializeState(state) });
        }

        while (state.queue.length > 0) {
            const { nodeId, shouldExecute, inputNodeIds } = state.queue.shift();
            state.queued.delete(nodeId);
            if (state.settled.has(nodeId)) continue;
            const node = nodeMap.get(nodeId);
            const stepStartTime = Date.now();
            runtimeState.incomingNodeIds = inputNodeIds;
            runtimeState.currentNodeId = nodeId;

            if (!shouldExecute) {
                completeNode(nodeId, node, { success: true, outputData: null }, inputNodeIds, { time: `${Date.now() - stepStartTime}ms`, details: 'Skipped because no incoming branch was selected.' }, 'skipped');
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
                    stepDetails = `Successfully executed ${node.title || node.type} (${node.subType})`;
                }
            } catch (error) {
                executionResult = { success: false, error: error.message };
                stepStatus = 'failed';
                const failure = { nodeId, node: node.title || node.type, error: error.message, handled: false };
                state.unhandledFailures.set(nodeId, failure);
                state.contextData.metadata.errors.push(failure);
                errorMsg ||= error.message;
                stepDetails = `Execution failed: ${error.message}`;
            }

            if (executionResult.suspend) {
                const { continuation, token } = await createContinuation({ run, node, suspension: executionResult.suspend });
                state.suspendedNodeId = nodeId;
                state.suspendedInputNodeIds = inputNodeIds;
                state.stepLogs.push({ name: node.title || node.type, type: node.type, status: 'waiting', time: `${Date.now() - stepStartTime}ms`, details: `Waiting for ${executionResult.suspend.kind}.`, continuationId: continuation.id });
                await run.update({ status: 'waiting', suspendedNodeId: nodeId, state: serializeState(state) });
                return persistLog({ run, workflowId, revisionId: executedRevisionId, userId, status: 'Waiting', trigger: executionOptions.trigger, error: null, steps: state.stepLogs, output: state.workflowOutput, durationMs: Date.now() - startTime }).then(log => ({ ...log.toJSON(), continuationId: continuation.id, actionToken: token }));
            }

            completeNode(nodeId, node, executionResult, inputNodeIds, { time: `${Date.now() - stepStartTime}ms`, details: stepDetails }, stepStatus);
        }

        const unresolved = nodes.filter(node => !state.settled.has(node.id));
        if (unresolved.length > 0) {
            status = 'Failed';
            errorMsg ||= `Execution stopped before reaching nodes: ${unresolved.map(node => node.id).join(', ')}`;
        } else if (state.unhandledFailures.size > 0) {
            status = 'Failed';
            errorMsg = [...state.unhandledFailures.values()][0].error;
        }
        await run.update({ status: status === 'Success' ? 'succeeded' : 'failed', error: errorMsg, completedAt: new Date(), state: serializeState(state), suspendedNodeId: null });
        return persistLog({ run, workflowId, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: state.stepLogs, output: state.workflowOutput, durationMs: Date.now() - startTime });
    } catch (error) {
        status = 'Failed';
        errorMsg = errorMsg || error.message;
        if (run) {
            await run.update({ status: 'failed', error: errorMsg, completedAt: new Date() }).catch(() => {});
            return persistLog({ run, workflowId, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: [], output: null, durationMs: Date.now() - startTime });
        }
        return AutomationRun.create(logDataFor({ workflowId, revisionId: executedRevisionId, userId, status, trigger: executionOptions.trigger, error: errorMsg, steps: [], output: null, durationMs: Date.now() - startTime }));
    }
};

export const resumeWorkflowRun = ({ run, userId, resolution }) => executeWorkflow(run.workflowId, userId, {}, {
    resumeRunId: run.id,
    resumeResult: resolution,
    runType: 'production',
    trigger: run.trigger || 'continuation'
});
