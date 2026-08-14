const nodeKey = (nodeId) => String(nodeId);

export const buildExecutionGraph = (nodes = [], edges = []) => {
    const nodeMap = new Map(nodes.map(node => [nodeKey(node.id), node]));
    const outgoing = new Map(nodes.map(node => [nodeKey(node.id), []]));
    const incoming = new Map(nodes.map(node => [nodeKey(node.id), []]));

    for (const edge of edges) {
        if (!nodeMap.has(nodeKey(edge.source)) || !nodeMap.has(nodeKey(edge.target))) continue;
        const normalized = {
            ...edge,
            source: nodeKey(edge.source),
            target: nodeKey(edge.target)
        };
        outgoing.get(normalized.source).push(normalized);
        incoming.get(normalized.target).push(normalized);
    }

    return { nodeMap, outgoing, incoming };
};

export const selectOutgoingEdges = (node, result = {}, edges = [], nodeMap = null) => {
    if (result.success === false) {
        return edges.filter(edge => nodeMap?.get(nodeKey(edge.target))?.subType === 'catchError');
    }
    if (node.type !== 'logic') return edges;

    // A routing result chooses an output handle, not a single destination.
    // Keep every edge attached to that handle so an approved route can fan out
    // to (for example) a response Sheet and a follow-up Condition.
    if (result.targetEdgeId) return edges.filter(edge => edge.id === result.targetEdgeId);
    if (result.targetHandle !== undefined && result.targetHandle !== null) {
        const selected = edges.filter(edge => edge.sourceHandle === result.targetHandle);
        return selected.length > 0 ? selected : edges;
    }
    return edges;
};

export const mergeExecutionResult = (context, node, result) => {
    context[node.id] = result;
    if (node.title) context[node.title] = result;
    context[`${node.type}:${node.subType}`] = result;
    if (result?.success !== false && result?.variables && typeof result.variables === 'object') {
        context.metadata ||= {};
        context.metadata.variables = { ...(context.metadata.variables || {}), ...result.variables };
        for (const [name, value] of Object.entries(result.variables)) {
            if (/^(?:__proto__|prototype|constructor|metadata|initialPayload)$/.test(name)) continue;
            context[name] = value;
        }
    }
    return context;
};
