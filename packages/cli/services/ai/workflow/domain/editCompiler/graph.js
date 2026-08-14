import crypto from 'crypto';

export const nodeKeyFor = node => node.nodeKey || `${node.type}:${node.subType}`;

export const normalizeConfig = (config, schema) => {
    const inputNames = new Set((schema?.inputs || []).map(input => input.name));
    const next = {};
    for (const [name, value] of Object.entries(config || {})) {
        if (inputNames.has(name)) next[name] = value;
    }
    return next;
};

const nodeUiFields = spec => ({
    schema: spec.schema,
    icon: spec.ui?.icon,
    bgColor: spec.ui?.bgColor || spec.ui?.iconBg,
    color: spec.ui?.color || spec.ui?.iconColor,
    iconColor: spec.ui?.iconColor || spec.ui?.color
});

const newId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const safeIssueIdentifier = value => typeof value === 'string' ? value.slice(0, 160) : undefined;
const safeIssueIdentifiers = values => Array.isArray(values)
    ? values.filter(value => typeof value === 'string' && value).slice(0, 20).map(value => value.slice(0, 160))
    : [];

export const throwEditError = (operation, message, details = {}) => {
    const error = new Error(message);
    error.code = details.code || 'WORKFLOW_EDIT_INVALID';
    error.operation = operation;
    const value = safeIssueIdentifier(details.value);
    const allowed = safeIssueIdentifiers(details.allowed);
    error.issues = [{
        code: error.code,
        operation,
        message,
        ...(details.path ? { path: details.path } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(Array.isArray(details.allowed) ? { allowed } : {})
    }];
    throw error;
};

export const connectionHandlesFor = (node, direction) => (node?.schema?.[direction] || [])
    .filter(item => item?.isConnection)
    .map(item => item.name)
    .filter(Boolean);

export const assertConnectionHandle = (node, handle, direction, operation) => {
    if (handle === null || handle === undefined || !Array.isArray(node?.schema?.[direction])) return;
    const validHandles = connectionHandlesFor(node, direction);
    if (!validHandles.includes(handle)) {
        throwEditError(operation, `Unknown ${direction === 'outputs' ? 'source' : 'target'} handle '${handle}'.`, {
            code: 'WORKFLOW_HANDLE_INVALID',
            value: handle,
            allowed: validHandles
        });
    }
};

// Many nodes expose one generic payload input but use different names
// (`triggerData`, `inputData`, or `event`). The generated graph only needs the
// one available port, so normalize an alias instead of failing the proposal.
const normalizeSingleInputHandle = (node, handle) => {
    if (handle === null || handle === undefined) return handle;
    const inputs = connectionHandlesFor(node, 'inputs');
    return inputs.length === 1 && !inputs.includes(handle) ? inputs[0] : handle;
};

// Persisted workflow nodes from older revisions do not always include their
// schema. Semantic operations must still validate supplied source routes.
export const withKnownSchema = (node, specsByNodeKey) => {
    if (Array.isArray(node?.schema?.inputs) || Array.isArray(node?.schema?.outputs)) return node;
    const schema = specsByNodeKey.get(nodeKeyFor(node))?.schema;
    return schema ? { ...node, schema } : node;
};

const connectionKey = ({ source, sourceHandle = null, target, targetHandle = null }) => JSON.stringify({
    source,
    sourceHandle: sourceHandle || null,
    target,
    targetHandle: targetHandle || null
});

const connectionFor = ({ source, sourceHandle = null, target, targetHandle = null, id = null, type = 'deletable' }) => ({
    id: id || newId('edge'),
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: targetHandle || null,
    type
});

export const createEditView = workflow => {
    const nodes = workflow?.nodes || [];
    const refsById = new Map(nodes.map((node, index) => [node.id, `n${index + 1}`]));
    return {
        revision: workflow?.revision ?? null,
        nodes: nodes.map(node => ({
            ref: refsById.get(node.id),
            title: node.title,
            type: node.type,
            subType: node.subType,
            nodeKey: nodeKeyFor(node),
            config: node.config || {},
            position: node.position || null
        })),
        connections: (workflow?.edges || []).map(edge => ({
            from: { nodeRef: refsById.get(edge.source), handle: edge.sourceHandle || null },
            to: { nodeRef: refsById.get(edge.target), handle: edge.targetHandle || null }
        })).filter(connection => connection.from.nodeRef && connection.to.nodeRef)
    };
};

export const normalizeEndpoint = (endpoint, refs, operation, label) => {
    if (!endpoint || typeof endpoint !== 'object' || typeof endpoint.nodeRef !== 'string') {
        throwEditError(operation, `${label} must identify a nodeRef and optional handle.`, { code: 'WORKFLOW_ENDPOINT_INVALID' });
    }
    const nodeId = refs.get(endpoint.nodeRef);
    if (!nodeId) throwEditError(operation, `${label} references an unknown nodeRef '${endpoint.nodeRef}'.`, {
        code: 'WORKFLOW_NODE_REF_INVALID',
        value: endpoint.nodeRef,
        allowed: [...refs.keys()]
    });
    return { nodeId, handle: endpoint.handle || null };
};

export const addNodeFromEdit = ({ operation, nodeDefinition, nodes, refs, specsByNodeKey }) => {
    if (!nodeDefinition || typeof nodeDefinition !== 'object' || typeof nodeDefinition.ref !== 'string') {
        throwEditError(operation, 'create_node requires a new node ref.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    }
    if (refs.has(nodeDefinition.ref)) {
        throwEditError(operation, `Node ref '${nodeDefinition.ref}' is already in use.`, {
            code: 'WORKFLOW_NODE_REF_DUPLICATE',
            value: nodeDefinition.ref,
            allowed: [...refs.keys()]
        });
    }
    const spec = specsByNodeKey.get(nodeDefinition.nodeKey);
    if (!spec) throwEditError(operation, `Unknown nodeKey '${nodeDefinition.nodeKey}'.`, {
        code: 'WORKFLOW_NODE_KEY_INVALID',
        value: nodeDefinition.nodeKey,
        allowed: [...specsByNodeKey.keys()]
    });
    const after = nodeDefinition.afterNodeRef ? refs.get(nodeDefinition.afterNodeRef) : null;
    if (nodeDefinition.afterNodeRef && !after) {
        throwEditError(operation, `afterNodeRef '${nodeDefinition.afterNodeRef}' does not exist.`, {
            code: 'WORKFLOW_NODE_REF_INVALID',
            value: nodeDefinition.afterNodeRef,
            allowed: [...refs.keys()]
        });
    }
    const afterNode = after ? nodes.find(node => node.id === after) : null;
    const x = afterNode
        ? (afterNode.position?.x || 100) + 350
        : Math.max(0, ...nodes.map(node => node.position?.x || 0)) + 350;
    const id = newId('node');
    refs.set(nodeDefinition.ref, id);
    const node = {
        id,
        type: spec.type,
        subType: spec.subType,
        nodeKey: spec.nodeKey || `${spec.type}:${spec.subType}`,
        title: nodeDefinition.title || spec.title,
        description: nodeDefinition.description || spec.description,
        config: normalizeConfig(nodeDefinition.config, spec.schema),
        position: { x, y: afterNode?.position?.y || 150 },
        layoutPinned: false,
        ...nodeUiFields(spec)
    };
    nodes.push(node);
    return node;
};

export const findConnection = (edges, from, to) => edges.find(edge => connectionKey({
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle
}) === connectionKey({
    source: from.nodeId,
    sourceHandle: from.handle,
    target: to.nodeId,
    targetHandle: to.handle
}));

export const connectNodes = ({ operation, edges, from, to, sourceNode, targetNode }) => {
    const resolvedTo = { ...to, handle: normalizeSingleInputHandle(targetNode, to.handle) };
    assertConnectionHandle(sourceNode, from.handle, 'outputs', operation);
    assertConnectionHandle(targetNode, resolvedTo.handle, 'inputs', operation);
    if (findConnection(edges, from, resolvedTo)) return;
    edges.push(connectionFor({ source: from.nodeId, sourceHandle: from.handle, target: resolvedTo.nodeId, targetHandle: resolvedTo.handle }));
};

export const insertBetween = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const from = normalizeEndpoint(operation.connection?.from, refs, operation.op, 'connection.from');
    const to = normalizeEndpoint(operation.connection?.to, refs, operation.op, 'connection.to');
    const match = findConnection(edges, from, to);
    if (!match) throwEditError(operation.op, 'The requested connection does not exist.', { code: 'WORKFLOW_CONNECTION_NOT_FOUND' });
    const inserted = addNodeFromEdit({ operation: operation.op, nodeDefinition: operation.node, nodes, refs, specsByNodeKey });
    const inputHandles = connectionHandlesFor(inserted, 'inputs');
    const outputHandles = connectionHandlesFor(inserted, 'outputs');
    const inputHandle = operation.inputHandle || (inputHandles.length === 1 ? inputHandles[0] : null);
    const outputHandle = operation.outputHandle || (outputHandles.length === 1 ? outputHandles[0] : null);
    if (!inputHandle && inputHandles.length > 1) {
        throwEditError(operation.op, 'insert_between requires an inputHandle when the node has multiple inputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
    }
    if (!outputHandle && outputHandles.length > 1) {
        throwEditError(operation.op, 'insert_between requires an outputHandle when the node has multiple outputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
    }
    edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
    const insertedEndpoint = { nodeId: refs.get(operation.node.ref), handle: inputHandle };
    connectNodes({ operation: operation.op, edges, from, to: insertedEndpoint, sourceNode: nodes.find(node => node.id === from.nodeId), targetNode: inserted });
    connectNodes({ operation: operation.op, edges, from: { nodeId: refs.get(operation.node.ref), handle: outputHandle }, to, sourceNode: inserted, targetNode: nodes.find(node => node.id === to.nodeId) });
};

/**
 * Insert a node after a known route without requiring the model to repeat the
 * destination edge. The compiler owns the fragile "find, replace, reconnect"
 * work, which makes a proposal resilient to generated edge IDs and ordering.
 */
export const insertAfterRoute = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const from = normalizeEndpoint(operation.from, refs, operation.op, 'from');
    const sourceNode = nodes.find(node => node.id === from.nodeId);
    if (!sourceNode) throwEditError(operation.op, 'Route source references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    assertConnectionHandle(sourceNode, from.handle, 'outputs', operation.op);

    let matches = edges.filter(edge => edge.source === from.nodeId && (edge.sourceHandle || null) === from.handle);
    if (operation.beforeNodeRef) {
        const beforeNodeId = refs.get(operation.beforeNodeRef);
        if (!beforeNodeId) throwEditError(operation.op, `Unknown beforeNodeRef '${operation.beforeNodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
        matches = matches.filter(edge => edge.target === beforeNodeId);
    }
    if (matches.length === 0) {
        throwEditError(operation.op, 'The selected route has no connection to extend.', { code: 'WORKFLOW_ROUTE_NOT_FOUND' });
    }
    if (matches.length > 1) {
        throwEditError(operation.op, 'The selected route has multiple destinations. Identify which existing step should follow the new one.', { code: 'WORKFLOW_ROUTE_AMBIGUOUS' });
    }

    const match = matches[0];
    const to = { nodeId: match.target, handle: match.targetHandle || null };
    const targetNode = nodes.find(node => node.id === to.nodeId);
    if (!targetNode) throwEditError(operation.op, 'Route destination references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    const inserted = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: { ...operation.node, afterNodeRef: operation.node?.afterNodeRef || operation.from?.nodeRef },
        nodes,
        refs,
        specsByNodeKey
    });
    const inputHandles = connectionHandlesFor(inserted, 'inputs');
    const outputHandles = connectionHandlesFor(inserted, 'outputs');
    const inputHandle = operation.inputHandle || (inputHandles.length === 1 ? inputHandles[0] : null);
    const outputHandle = operation.outputHandle || (outputHandles.length === 1 ? outputHandles[0] : null);
    if (!inputHandle && inputHandles.length > 1) throwEditError(operation.op, 'insert_after_route requires an inputHandle when the node has multiple inputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });
    if (!outputHandle && outputHandles.length > 1) throwEditError(operation.op, 'insert_after_route requires an outputHandle when the node has multiple outputs.', { code: 'WORKFLOW_HANDLE_REQUIRED' });

    edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
    const insertedId = refs.get(operation.node.ref);
    connectNodes({ operation: operation.op, edges, from, to: { nodeId: insertedId, handle: inputHandle }, sourceNode, targetNode: inserted });
    connectNodes({ operation: operation.op, edges, from: { nodeId: insertedId, handle: outputHandle }, to, sourceNode: inserted, targetNode });
};
