import { validateNodeConfig } from '../../../shared/nodeConfigContract.js';

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

const issue = (code, path, message, severity = 'error') => ({ code, path, message, severity });

const validateGraph = (nodes, edges, registry) => {
    const issues = [];
    const nodeIds = new Set(nodes.map(node => node.id));
    const edgeIds = new Set();
    const adjacency = new Map(nodes.map(node => [node.id, []]));
    const indegree = new Map(nodes.map(node => [node.id, 0]));

    for (const [index, edge] of edges.entries()) {
        if (!isObject(edge)) {
            issues.push(issue('INVALID_EDGE', `edges[${index}]`, 'Edge must be an object.'));
            continue;
        }
        if (!edge.id || typeof edge.id !== 'string') {
            issues.push(issue('MISSING_EDGE_ID', `edges[${index}].id`, 'Edge ID is required.'));
        } else if (edgeIds.has(edge.id)) {
            issues.push(issue('DUPLICATE_EDGE_ID', `edges[${index}].id`, `Duplicate edge ID "${edge.id}".`));
        } else {
            edgeIds.add(edge.id);
        }
        if (!nodeIds.has(edge.source)) issues.push(issue('UNKNOWN_EDGE_SOURCE', `edges[${index}].source`, `Node "${edge.source}" does not exist.`));
        if (!nodeIds.has(edge.target)) issues.push(issue('UNKNOWN_EDGE_TARGET', `edges[${index}].target`, `Node "${edge.target}" does not exist.`));
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            const sourceNode = nodes.find(node => node.id === edge.source);
            const targetNode = nodes.find(node => node.id === edge.target);
            const sourceDefinition = registry?.getDefinition(sourceNode.type, sourceNode.subType);
            const targetDefinition = registry?.getDefinition(targetNode.type, targetNode.subType);
            const sourceHandles = (sourceDefinition?.configSchema?.outputs || []).filter(item => item?.isConnection).map(item => item.name).filter(Boolean);
            const targetHandles = (targetDefinition?.configSchema?.inputs || []).filter(item => item?.isConnection).map(item => item.name).filter(Boolean);
            if (edge.sourceHandle && sourceHandles.length > 0 && !sourceHandles.includes(edge.sourceHandle)) {
                issues.push(issue('UNKNOWN_SOURCE_HANDLE', `edges[${index}].sourceHandle`, `Output handle "${edge.sourceHandle}" does not exist on node "${edge.source}".`));
            }
            if (edge.targetHandle && targetHandles.length > 0 && !targetHandles.includes(edge.targetHandle)) {
                issues.push(issue('UNKNOWN_TARGET_HANDLE', `edges[${index}].targetHandle`, `Input handle "${edge.targetHandle}" does not exist on node "${edge.target}".`));
            }
            if (!edge.sourceHandle && sourceHandles.length > 1) {
                issues.push(issue('AMBIGUOUS_SOURCE_HANDLE', `edges[${index}].sourceHandle`, `Choose an output route for node "${edge.source}".`));
            }
            if (!edge.targetHandle && targetHandles.length > 1) {
                issues.push(issue('AMBIGUOUS_TARGET_HANDLE', `edges[${index}].targetHandle`, `Choose an input route for node "${edge.target}".`));
            }
            adjacency.get(edge.source).push(edge.target);
            indegree.set(edge.target, indegree.get(edge.target) + 1);
        }
    }

    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
    let visited = 0;
    while (queue.length > 0) {
        const nodeId = queue.shift();
        visited += 1;
        for (const target of adjacency.get(nodeId) || []) {
            indegree.set(target, indegree.get(target) - 1);
            if (indegree.get(target) === 0) queue.push(target);
        }
    }
    if (visited !== nodes.length) issues.push(issue('CYCLIC_WORKFLOW', 'edges', 'Workflow contains a cycle. Automation workflows must not contain cycles.'));

    return { issues, adjacency };
};

export const validateWorkflow = ({ nodes = [], edges = [], isActive = false, requireConnected = false, validateConfig = true, registry }) => {
    const issues = [];
    const warnings = [];
    if (!Array.isArray(nodes)) return { valid: false, issues: [issue('INVALID_NODES', 'nodes', 'Nodes must be an array.')] };
    if (!Array.isArray(edges)) return { valid: false, issues: [issue('INVALID_EDGES', 'edges', 'Edges must be an array.')] };

    const nodeIds = new Set();
    const triggerNodes = [];
    for (const [index, node] of nodes.entries()) {
        if (!isObject(node)) {
            issues.push(issue('INVALID_NODE', `nodes[${index}]`, 'Node must be an object.'));
            continue;
        }
        if (!node.id || typeof node.id !== 'string') {
            issues.push(issue('MISSING_NODE_ID', `nodes[${index}].id`, 'Node ID is required.'));
        } else if (nodeIds.has(node.id)) {
            issues.push(issue('DUPLICATE_NODE_ID', `nodes[${index}].id`, `Duplicate node ID "${node.id}".`));
        } else {
            nodeIds.add(node.id);
        }
        if (!node.type || !node.subType) {
            issues.push(issue('MISSING_NODE_TYPE', `nodes[${index}]`, 'Node type and subtype are required.'));
            continue;
        }

        const definition = registry?.getDefinition(node.type, node.subType);
        if (!definition) {
            issues.push(issue('UNKNOWN_NODE', `nodes[${index}]`, `Unknown node "${node.type}:${node.subType}".`));
        } else {
            if (isActive && ['disabled', 'coming_soon', 'retired'].includes(definition.implementationStatus)) {
                issues.push(issue('UNSUPPORTED_NODE', `nodes[${index}]`, `Node "${node.type}:${node.subType}" is not implemented.`));
            }
            if (validateConfig) {
                const configValidation = validateNodeConfig({
                    schema: definition.configSchema || {},
                    config: node.config || {},
                    mode: isActive ? 'active' : 'draft'
                });
                configValidation.issues.forEach(configIssue => {
                    const target = issue(
                        configIssue.code === 'MISSING_REQUIRED_CONFIG' ? 'MISSING_NODE_CONFIG' : `INVALID_NODE_CONFIG_${configIssue.code}`,
                        `nodes[${index}].${configIssue.path}`,
                        configIssue.message,
                        configIssue.severity
                    );
                    if (target.severity === 'warning') warnings.push(target);
                    else issues.push(target);
                });
            }
        }
        if (node.type === 'trigger') triggerNodes.push(node);
    }

    if ((isActive || requireConnected) && nodes.length === 0) issues.push(issue('EMPTY_WORKFLOW', 'nodes', 'An executable workflow must contain nodes.'));
    if ((isActive || requireConnected) && triggerNodes.length !== 1) issues.push(issue('TRIGGER_COUNT', 'nodes', 'An executable workflow must contain exactly one trigger node.'));

    const graph = validateGraph(nodes, edges, registry);
    issues.push(...graph.issues);

    const webhookTrigger = triggerNodes.find(node => node.subType === 'webhook');
    if (isActive && webhookTrigger?.config?.deliveryMode === 'sync') {
        const responseNodes = nodes.filter(node => ['formatResponse', 'respondWebhook'].includes(node.subType));
        const terminalNodes = nodes.filter(node => (graph.adjacency.get(node.id) || []).length === 0);
        if (responseNodes.length === 0 || terminalNodes.some(node => !['formatResponse', 'respondWebhook'].includes(node.subType))) {
            issues.push(issue('SYNC_WEBHOOK_RESPONSE_REQUIRED', 'nodes', 'Every synchronous webhook path must end with a response step.'));
        }
        if (nodes.some(node => ['approval', 'delay', 'waitUntil'].includes(node.subType))) {
            issues.push(issue('SYNC_WEBHOOK_CANNOT_SUSPEND', 'nodes', 'Synchronous webhooks cannot contain approval or durable wait steps.'));
        }
    }

    if ((isActive || requireConnected) && nodes.length > 0 && triggerNodes.length === 1) {
        const reachable = new Set([triggerNodes[0].id]);
        const queue = [triggerNodes[0].id];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const target of graph.adjacency.get(current) || []) {
                if (!reachable.has(target)) {
                    reachable.add(target);
                    queue.push(target);
                }
            }
        }
        nodes.forEach((node, index) => {
            if (!reachable.has(node.id)) issues.push(issue('UNREACHABLE_NODE', `nodes[${index}]`, `Node "${node.id}" cannot be reached from the trigger.`));
        });
    }

    return { valid: issues.length === 0, ready: issues.length === 0 && warnings.length === 0, issues, warnings };
};
