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

export const selectOutgoingEdges = (node, result = {}, edges = []) => {
    if (node.type !== 'logic') return edges;

    const targetEdgeId = result.targetEdgeId || edges.find(edge => edge.sourceHandle === result.targetHandle)?.id;
    return targetEdgeId ? edges.filter(edge => edge.id === targetEdgeId) : edges;
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
