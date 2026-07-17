const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

const issue = (code, path, message) => ({ code, path, message });

const validateGraph = (nodes, edges) => {
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
    if (visited !== nodes.length) issues.push(issue('CYCLIC_WORKFLOW', 'edges', 'Workflow contains a cycle. Use a bounded loop node for iteration.'));

    return { issues, adjacency };
};

export const validateWorkflow = ({ nodes = [], edges = [], isActive = false, registry }) => {
    const issues = [];
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
            if (isActive && definition.implementationStatus === 'disabled') {
                issues.push(issue('UNSUPPORTED_NODE', `nodes[${index}]`, `Node "${node.type}:${node.subType}" is not implemented.`));
            }
            for (const input of definition.configSchema.inputs || []) {
                if (input.required === true && (node.config?.[input.name] === undefined || node.config?.[input.name] === '')) {
                    issues.push(issue('MISSING_NODE_CONFIG', `nodes[${index}].config.${input.name}`, `Required configuration "${input.name}" is missing.`));
                }
            }
        }
        if (node.type === 'trigger') triggerNodes.push(node);
    }

    if (isActive && nodes.length === 0) issues.push(issue('EMPTY_WORKFLOW', 'nodes', 'An active workflow must contain nodes.'));
    if (isActive && triggerNodes.length !== 1) issues.push(issue('TRIGGER_COUNT', 'nodes', 'An active workflow must contain exactly one trigger node.'));

    const graph = validateGraph(nodes, edges);
    issues.push(...graph.issues);

    if (isActive && nodes.length > 0 && triggerNodes.length > 0) {
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

    return { valid: issues.length === 0, issues };
};
