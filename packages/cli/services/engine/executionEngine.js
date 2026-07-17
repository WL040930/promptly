import Workflow from '../../models/Workflow.js';
import ExecutionLog from '../../models/ExecutionLog.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { NodeFactory } from '../../../nodes/NodeFactory.js';
import { validateWorkflow } from './workflowValidator.js';
import { buildExecutionGraph, mergeExecutionResult, selectOutgoingEdges } from './executionGraph.js';

const validationError = (issues) => new Error(
    `Workflow validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`
);

export const executeWorkflow = async (workflowId, userId, triggerPayload = {}, executionOptions = {}) => {
    const startTime = Date.now();
    let status = 'Success';
    let errorMsg = null;
    const stepLogs = [];
    let workflowOutput = null;

    try {
        const workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
        if (!workflow) throw new Error('Workflow not found');

        const nodes = workflow.nodes || [];
        const edges = workflow.edges || [];
        if (nodes.length === 0) throw new Error('Workflow has no nodes to execute');

        const validation = validateWorkflow({ nodes, edges, isActive: false, registry: NodeRegistry });
        if (!validation.valid) throw validationError(validation.issues);

        const graph = buildExecutionGraph(nodes, edges);
        const nodeMap = new Map();
        for (const nodeData of nodes) nodeMap.set(nodeData.id, NodeFactory.createNode(nodeData));

        const incomingRemaining = new Map([...graph.incoming.entries()].map(([id, incoming]) => [id, incoming.length]));
        const activeIncoming = new Map(nodes.map(node => [node.id, 0]));
        const queued = new Set();
        const settled = new Set();
        const queue = [];
        const activeIncomingSources = new Map(nodes.map(node => [node.id, []]));
        const unhandledFailures = new Map();
        const eventId = executionOptions.eventId
            || triggerPayload?.idempotencyKey
            || triggerPayload?.responseId
            || triggerPayload?.eventId
            || triggerPayload?.requestId;
        const contextData = {
            initialPayload: triggerPayload,
            metadata: {
                userId,
                workflowId,
                errors: [],
                ...(eventId ? { idempotencyKey: String(eventId) } : {}),
                ...(executionOptions.correlationId ? { correlationId: executionOptions.correlationId } : {}),
                ...(executionOptions.causationId ? { causationId: executionOptions.causationId } : {}),
                ...(Number.isInteger(executionOptions.depth) ? { depth: executionOptions.depth } : {})
            }
        };
        const runtimeState = { incomingNodeIds: [] };
        Object.defineProperty(contextData, '__runtime', { value: runtimeState, enumerable: false });

        const schedule = (nodeId, shouldExecute, inputNodeIds = []) => {
            if (queued.has(nodeId) || settled.has(nodeId)) return;
            queued.add(nodeId);
            queue.push({ nodeId, shouldExecute, inputNodeIds });
        };

        for (const node of nodes) {
            if ((incomingRemaining.get(node.id) || 0) === 0) schedule(node.id, true);
        }

        while (queue.length > 0) {
            const { nodeId, shouldExecute, inputNodeIds } = queue.shift();
            if (settled.has(nodeId)) continue;
            const node = nodeMap.get(nodeId);
            const stepStartTime = Date.now();
            runtimeState.incomingNodeIds = inputNodeIds;

            if (!shouldExecute) {
                settled.add(nodeId);
                stepLogs.push({
                    name: node.title || node.type,
                    type: node.type,
                    status: 'skipped',
                    time: `${Date.now() - stepStartTime}ms`,
                    details: 'Skipped because no incoming branch was selected.'
                });
                for (const edge of graph.outgoing.get(nodeId) || []) {
                    incomingRemaining.set(edge.target, incomingRemaining.get(edge.target) - 1);
                    if (incomingRemaining.get(edge.target) === 0) {
                        schedule(edge.target, (activeIncoming.get(edge.target) || 0) > 0, activeIncomingSources.get(edge.target));
                    }
                }
                continue;
            }

            let executionResult;
            let stepStatus = 'success';
            let stepDetails;
            try {
                const validationResult = node.validate?.(contextData);
                if (validationResult === false) throw new Error(`Node validation failed for ${node.title || node.type}`);

                executionResult = await node.execute(contextData);
                executionResult = executionResult ?? { success: true };
                if (executionResult.success === false) {
                    stepStatus = 'failed';
                    const failure = {
                        nodeId,
                        node: node.title || node.type,
                        error: executionResult.error || `Node ${node.title || node.type} reported failure.`,
                        handled: false
                    };
                    unhandledFailures.set(nodeId, failure);
                    contextData.metadata.errors.push(failure);
                    errorMsg ||= failure.error;
                    stepDetails = executionResult.error || 'Node reported failure.';
                } else {
                    stepDetails = `Successfully executed ${node.title || node.type} (${node.subType})`;
                }
            } catch (error) {
                executionResult = { success: false, error: error.message };
                stepStatus = 'failed';
                const failure = { nodeId, node: node.title || node.type, error: error.message, handled: false };
                unhandledFailures.set(nodeId, failure);
                contextData.metadata.errors.push(failure);
                errorMsg ||= error.message;
                stepDetails = `Execution failed: ${error.message}`;
            }

            settled.add(nodeId);
            mergeExecutionResult(contextData, node, executionResult);
            if (node.subType === 'formatResponse' && executionResult.success !== false) {
                workflowOutput = executionResult.outputData || null;
            }
            if (node.subType === 'catchError' && executionResult.handledError && executionResult.failedNodeId) {
                const handledFailure = unhandledFailures.get(executionResult.failedNodeId);
                if (handledFailure) {
                    handledFailure.handled = true;
                    unhandledFailures.delete(executionResult.failedNodeId);
                }
            }
            stepLogs.push({
                name: node.title || node.type,
                type: node.type,
                status: stepStatus,
                time: `${Date.now() - stepStartTime}ms`,
                details: stepDetails,
                ...(executionResult.logEntry ? { metadata: executionResult.logEntry } : {})
            });

            const outgoing = graph.outgoing.get(nodeId) || [];
            const selected = selectOutgoingEdges(node, executionResult, outgoing);
            const selectedIds = new Set(selected.map(edge => edge.id));
            for (const edge of outgoing) {
                incomingRemaining.set(edge.target, incomingRemaining.get(edge.target) - 1);
                if (selectedIds.has(edge.id)) {
                    activeIncoming.set(edge.target, activeIncoming.get(edge.target) + 1);
                    activeIncomingSources.get(edge.target).push(nodeId);
                }
                if (incomingRemaining.get(edge.target) === 0) {
                    schedule(edge.target, (activeIncoming.get(edge.target) || 0) > 0, activeIncomingSources.get(edge.target));
                }
            }
        }

        const unresolved = nodes.filter(node => !settled.has(node.id));
        if (unresolved.length > 0) {
            status = 'Failed';
            errorMsg ||= `Execution stopped before reaching nodes: ${unresolved.map(node => node.id).join(', ')}`;
        }
        if (unresolved.length > 0) {
            status = 'Failed';
        } else if (unhandledFailures.size > 0) {
            status = 'Failed';
            errorMsg = [...unhandledFailures.values()][0].error;
        } else {
            status = 'Success';
            errorMsg = null;
        }
    } catch (error) {
        status = 'Failed';
        errorMsg = errorMsg || error.message;
    }

    return ExecutionLog.create({
        workflowId,
        userId,
        durationMs: Date.now() - startTime,
        status,
        trigger: executionOptions.trigger || 'Manual Test Run',
        tags: ['Engine', status],
        error: errorMsg,
        steps: stepLogs,
        output: workflowOutput
    });
};
