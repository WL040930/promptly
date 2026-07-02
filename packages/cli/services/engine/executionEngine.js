import Workflow from '../../models/Workflow.js';
import ExecutionLog from '../../models/ExecutionLog.js';
import { NodeFactory } from '../../../nodes/NodeFactory.js';

export const executeWorkflow = async (workflowId, userId, triggerPayload = {}) => {
    const startTime = Date.now();
    let status = 'Success';
    let errorMsg = null;
    let stepLogs = [];

    try {
        const workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
        
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        const nodes = workflow.nodes || [];
        const edges = workflow.edges || [];
        
        if (nodes.length === 0) {
            throw new Error('Workflow has no nodes to execute');
        }

        // Build Adjacency List and Node Map
        const nodeMap = {};
        const inDegree = {};
        const adj = {};

        nodes.forEach(n => {
            // Instantiate backend node logic object via Factory
            nodeMap[n.id] = NodeFactory.createNode(n);
            inDegree[n.id] = 0;
            adj[n.id] = [];
        });

        edges.forEach(e => {
            if (adj[e.source] && inDegree[e.target] !== undefined) {
                adj[e.source].push({ target: e.target, edgeId: e.id });
                inDegree[e.target]++;
            }
        });

        // Find starting nodes (0 in-degree)
        let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
        
        // Fallback if there are cycles and no 0 in-degree nodes
        if (queue.length === 0 && nodes.length > 0) {
            queue = [nodes[0].id];
        }

        // Context state passed along the DAG
        let contextData = { initialPayload: triggerPayload };
        const executedNodes = new Set();

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (executedNodes.has(nodeId)) continue;
            
            const node = nodeMap[nodeId];
            const stepStartTime = Date.now();
            let stepStatus = 'success';
            let stepDetails = '';
            
            // Execute specialized node logic
            try {
                const executionResult = await node.execute(contextData);
                contextData = { ...contextData, [node.id]: executionResult };
                stepDetails = `Successfully executed ${node.title || node.type} (${node.subType})`;
                
                // For logic nodes, determine which path to follow
                if (node.type === 'logic') {
                    // Expect logic nodes to optionally return a targetEdgeId
                    if (executionResult.targetEdgeId) {
                        stepDetails += ` Routing down edge ${executionResult.targetEdgeId}`;
                    }
                }
            } catch (err) {
                stepStatus = 'failed';
                stepDetails = `Execution failed: ${err.message}`;
                status = 'Failed';
                errorMsg = err.message;
                
                stepLogs.push({
                    name: node.title || node.type,
                    type: node.type,
                    status: stepStatus,
                    time: `${Date.now() - stepStartTime}ms`,
                    details: stepDetails
                });
                break; // Stop execution on error
            }

            executedNodes.add(nodeId);
            stepLogs.push({
                name: node.title || node.type,
                type: node.type,
                status: stepStatus,
                time: `${Date.now() - stepStartTime}ms`,
                details: stepDetails
            });

            // Enqueue downstream nodes
            const neighbors = adj[nodeId] || [];
            for (const neighbor of neighbors) {
                inDegree[neighbor.target]--;
                
                // If it's a logic node and specified a target edge, only follow that edge
                if (node.type === 'logic' && contextData[node.id]?.targetEdgeId) {
                    if (neighbor.edgeId !== contextData[node.id].targetEdgeId) {
                        continue; // Skip this branch
                    }
                }
                
                if (inDegree[neighbor.target] <= 0) {
                    queue.push(neighbor.target);
                }
            }
        }

    } catch (err) {
        status = 'Failed';
        errorMsg = err.message;
    }

    const durationMs = Date.now() - startTime;

    // Create Execution Log
    const log = await ExecutionLog.create({
        workflowId,
        userId,
        durationMs,
        status,
        trigger: 'Manual Test Run',
        tags: ['Engine', status],
        error: errorMsg,
        steps: stepLogs
    });

    return log;
};
