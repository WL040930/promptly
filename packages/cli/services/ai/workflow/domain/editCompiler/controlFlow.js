import {
    addNodeFromEdit,
    assertConnectionHandle,
    connectNodes,
    connectionHandlesFor,
    findConnection,
    normalizeEndpoint,
    throwEditError,
    withKnownSchema
} from './graph.js';
import {
    CONTROL_FLOW_NODE_KEYS,
    SEMANTIC_CONTROL_FLOW_NODE_KEYS,
    SWITCH_BRANCH_HANDLES,
    SWITCH_DEFAULT_HANDLE
} from './contracts.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const valueIsMissing = value => value === undefined || value === null || (typeof value === 'string' && !value.trim());
const operatorsWithoutSecondValue = new Set(['exists', 'empty', 'truthy', 'falsy']);
const mergeModes = new Set(['object', 'array', 'last']);

const requireNamedSourceRoute = ({ operation, endpoint, label, code, nodes, refs, specsByNodeKey }) => {
    if (typeof endpoint?.handle !== 'string' || !endpoint.handle.trim()) {
        throwEditError(operation.op, `${operation.op} requires the ${label} route handle.`, {
            code,
            path: `${label === 'source' ? 'from' : label}.handle`
        });
    }
    const from = normalizeEndpoint(endpoint, refs, operation.op, label === 'source' ? 'from' : label);
    const sourceNode = nodes.find(node => node.id === from.nodeId);
    if (!sourceNode) throwEditError(operation.op, `${label} route references a missing node.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
    const sourceForValidation = withKnownSchema(sourceNode, specsByNodeKey);
    assertConnectionHandle(sourceForValidation, from.handle, 'outputs', operation.op);
    return { from, sourceNode: sourceForValidation };
};

const requireExistingConnection = ({ operation, connection, nodes, edges, refs, specsByNodeKey }) => {
    const from = normalizeEndpoint(connection?.from, refs, operation.op, 'connection.from');
    const to = normalizeEndpoint(connection?.to, refs, operation.op, 'connection.to');
    const match = findConnection(edges, from, to);
    if (!match) throwEditError(operation.op, 'The selected connection does not exist.', { code: 'WORKFLOW_CONNECTION_NOT_FOUND' });
    const sourceNode = nodes.find(node => node.id === from.nodeId);
    const targetNode = nodes.find(node => node.id === to.nodeId);
    if (!sourceNode || !targetNode) throwEditError(operation.op, 'Connection references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
    const sourceForValidation = withKnownSchema(sourceNode, specsByNodeKey);
    const targetForValidation = withKnownSchema(targetNode, specsByNodeKey);
    assertConnectionHandle(sourceForValidation, from.handle, 'outputs', operation.op);
    assertConnectionHandle(targetForValidation, to.handle, 'inputs', operation.op);
    return { from, to, match, sourceNode: sourceForValidation, targetNode: targetForValidation };
};

const assertNodePorts = ({ operation, node, inputs = [], outputs = [], code, message }) => {
    const nodeInputs = connectionHandlesFor(node, 'inputs');
    const nodeOutputs = connectionHandlesFor(node, 'outputs');
    if (inputs.some(handle => !nodeInputs.includes(handle)) || outputs.some(handle => !nodeOutputs.includes(handle))) {
        throwEditError(operation.op, message, { code });
    }
};

const requireSingleInputPort = ({ operation, node, code, message }) => {
    const inputs = connectionHandlesFor(node, 'inputs');
    if (inputs.length !== 1) throwEditError(operation.op, message, { code });
    return inputs[0];
};

const assertNodeDefinition = ({ operation, definition, path, message, code }) => {
    if (!isObject(definition)) {
        throwEditError(operation.op, message, { code, path });
    }
    if (typeof definition.ref !== 'string' || !definition.ref.trim()) {
        throwEditError(operation.op, `${message} It needs a new node ref.`, { code, path: `${path}.ref` });
    }
    if (!isObject(definition.config)) {
        throwEditError(operation.op, `${message} It needs a config object.`, { code, path: `${path}.config` });
    }
};

const addSingleInputAction = ({ operation, definition, path, name, afterNodeRef, nodes, refs, specsByNodeKey, code }) => {
    assertNodeDefinition({
        operation,
        definition,
        path,
        message: `${operation.op} requires a ${name} action.`,
        code
    });
    if (SEMANTIC_CONTROL_FLOW_NODE_KEYS.has(definition.nodeKey)) {
        throwEditError(operation.op, `The ${name} action cannot create ${definition.nodeKey} directly. Use its semantic operation in a separate step.`, {
            code,
            path: `${path}.nodeKey`
        });
    }
    const action = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: { ...definition, afterNodeRef: definition.afterNodeRef || afterNodeRef },
        nodes,
        refs,
        specsByNodeKey
    });
    const inputs = connectionHandlesFor(action, 'inputs');
    if (inputs.length !== 1) {
        throwEditError(operation.op, `The ${name} action must have exactly one connection input.`, {
            code,
            path: `${path}.nodeKey`
        });
    }
    return { action, inputHandle: inputs[0] };
};

const assertConditionConfig = (operation, condition) => {
    if (!isObject(condition.config)) {
        throwEditError(operation.op, 'add_condition_branch requires a condition config object.', {
            code: 'WORKFLOW_CONDITION_CONFIG_INVALID', path: 'condition.config'
        });
    }
    if (valueIsMissing(condition.config.valueA)) {
        throwEditError(operation.op, 'add_condition_branch requires condition.config.valueA.', {
            code: 'WORKFLOW_CONDITION_CONFIG_INVALID', path: 'condition.config.valueA'
        });
    }
    if (valueIsMissing(condition.config.operator)) {
        throwEditError(operation.op, 'add_condition_branch requires condition.config.operator.', {
            code: 'WORKFLOW_CONDITION_CONFIG_INVALID', path: 'condition.config.operator'
        });
    }
    if (!operatorsWithoutSecondValue.has(condition.config.operator) && valueIsMissing(condition.config.valueB)) {
        throwEditError(operation.op, 'add_condition_branch requires condition.config.valueB for this operator.', {
            code: 'WORKFLOW_CONDITION_CONFIG_INVALID', path: 'condition.config.valueB'
        });
    }
};

/**
 * Compile an if/otherwise request as one atomic semantic operation. The AI
 * names the source, condition, and two outcomes; this compiler owns every
 * fragile Condition port. Existing source destinations are retained so a
 * successful route can fan out safely when the request calls for it.
 */
export const addConditionBranch = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const { from, sourceNode } = requireNamedSourceRoute({
        operation,
        endpoint: operation.from,
        label: 'source',
        code: 'WORKFLOW_CONDITION_SOURCE_HANDLE_REQUIRED',
        nodes,
        refs,
        specsByNodeKey
    });
    const condition = operation.condition;
    assertNodeDefinition({
        operation,
        definition: condition,
        path: 'condition',
        message: 'add_condition_branch requires a condition definition.',
        code: 'WORKFLOW_CONDITION_BRANCH_INVALID'
    });
    assertConditionConfig(operation, condition);
    const conditionNode = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: {
            ref: condition.ref,
            nodeKey: CONTROL_FLOW_NODE_KEYS.condition,
            title: condition.title,
            description: condition.description,
            config: condition.config,
            afterNodeRef: condition.afterNodeRef || operation.from.nodeRef
        },
        nodes,
        refs,
        specsByNodeKey
    });
    assertNodePorts({
        operation,
        node: conditionNode,
        inputs: ['input1'],
        outputs: ['true', 'false'],
        code: 'WORKFLOW_CONDITION_SCHEMA_INVALID',
        message: 'The Condition node schema does not expose input1, true, and false routes.'
    });
    const whenTrue = addSingleInputAction({
        operation,
        definition: operation.whenTrue,
        path: 'whenTrue',
        name: 'true outcome',
        afterNodeRef: condition.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_CONDITION_BRANCH_ACTION_INVALID'
    });
    const whenFalse = addSingleInputAction({
        operation,
        definition: operation.whenFalse,
        path: 'whenFalse',
        name: 'false outcome',
        afterNodeRef: condition.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_CONDITION_BRANCH_ACTION_INVALID'
    });

    connectNodes({
        operation: operation.op,
        edges,
        from,
        to: { nodeId: conditionNode.id, handle: 'input1' },
        sourceNode,
        targetNode: conditionNode
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: conditionNode.id, handle: 'true' },
        to: { nodeId: whenTrue.action.id, handle: whenTrue.inputHandle },
        sourceNode: conditionNode,
        targetNode: whenTrue.action
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: conditionNode.id, handle: 'false' },
        to: { nodeId: whenFalse.action.id, handle: whenFalse.inputHandle },
        sourceNode: conditionNode,
        targetNode: whenFalse.action
    });
};

const assertSwitchCaseValue = ({ operation, value, path }) => {
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        throwEditError(operation.op, 'Each Switch case value must be a string, number, boolean, or null.', {
            code: 'WORKFLOW_SWITCH_CASE_INVALID', path
        });
    }
};

/**
 * Compile up to two named Switch routes plus a default route. The underlying
 * node deliberately exposes fixed handles, so this operation keeps route
 * configuration and graph handles in one place.
 */
export const addSwitchRoutes = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const { from, sourceNode } = requireNamedSourceRoute({
        operation,
        endpoint: operation.from,
        label: 'source',
        code: 'WORKFLOW_SWITCH_SOURCE_HANDLE_REQUIRED',
        nodes,
        refs,
        specsByNodeKey
    });
    const switchDefinition = operation.switch;
    assertNodeDefinition({
        operation,
        definition: switchDefinition,
        path: 'switch',
        message: 'add_switch_routes requires a Switch definition.',
        code: 'WORKFLOW_SWITCH_INVALID'
    });
    if (valueIsMissing(switchDefinition.config.valueToTest)) {
        throwEditError(operation.op, 'add_switch_routes requires switch.config.valueToTest.', {
            code: 'WORKFLOW_SWITCH_CONFIG_INVALID', path: 'switch.config.valueToTest'
        });
    }
    const cases = operation.cases;
    if (!Array.isArray(cases) || cases.length === 0 || cases.length > SWITCH_BRANCH_HANDLES.length) {
        throwEditError(operation.op, `add_switch_routes requires one or two cases.`, {
            code: 'WORKFLOW_SWITCH_CASES_INVALID', path: 'cases'
        });
    }
    const caseValueKeys = new Set();
    cases.forEach((routeCase, index) => {
        if (!isObject(routeCase)) {
            throwEditError(operation.op, 'Each Switch case must be an object.', {
                code: 'WORKFLOW_SWITCH_CASE_INVALID', path: `cases[${index}]`
            });
        }
        if (!Object.hasOwn(routeCase, 'value')) {
            throwEditError(operation.op, 'Each Switch case requires a value.', {
                code: 'WORKFLOW_SWITCH_CASE_INVALID', path: `cases[${index}].value`
            });
        }
        assertSwitchCaseValue({ operation, value: routeCase.value, path: `cases[${index}].value` });
        const valueKey = JSON.stringify(routeCase.value);
        if (caseValueKeys.has(valueKey)) {
            throwEditError(operation.op, 'Switch case values must be unique.', {
                code: 'WORKFLOW_SWITCH_CASE_INVALID', path: `cases[${index}].value`
            });
        }
        caseValueKeys.add(valueKey);
    });
    const switchNode = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: {
            ref: switchDefinition.ref,
            nodeKey: CONTROL_FLOW_NODE_KEYS.switch,
            title: switchDefinition.title,
            description: switchDefinition.description,
            config: {
                valueToTest: switchDefinition.config.valueToTest,
                cases: cases.map((routeCase, index) => ({ value: routeCase.value, handle: SWITCH_BRANCH_HANDLES[index] }))
            },
            afterNodeRef: switchDefinition.afterNodeRef || operation.from.nodeRef
        },
        nodes,
        refs,
        specsByNodeKey
    });
    assertNodePorts({
        operation,
        node: switchNode,
        inputs: ['input1'],
        outputs: [...SWITCH_BRANCH_HANDLES, SWITCH_DEFAULT_HANDLE],
        code: 'WORKFLOW_SWITCH_SCHEMA_INVALID',
        message: 'The Switch node schema does not expose input1, branchA, branchB, and default routes.'
    });
    const caseActions = cases.map((routeCase, index) => addSingleInputAction({
        operation,
        definition: routeCase.action,
        path: `cases[${index}].action`,
        name: `case ${index + 1}`,
        afterNodeRef: switchDefinition.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_SWITCH_CASE_ACTION_INVALID'
    }));
    const otherwise = addSingleInputAction({
        operation,
        definition: operation.otherwise,
        path: 'otherwise',
        name: 'default route',
        afterNodeRef: switchDefinition.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_SWITCH_DEFAULT_ACTION_INVALID'
    });

    connectNodes({
        operation: operation.op,
        edges,
        from,
        to: { nodeId: switchNode.id, handle: 'input1' },
        sourceNode,
        targetNode: switchNode
    });
    caseActions.forEach((route, index) => {
        connectNodes({
            operation: operation.op,
            edges,
            from: { nodeId: switchNode.id, handle: SWITCH_BRANCH_HANDLES[index] },
            to: { nodeId: route.action.id, handle: route.inputHandle },
            sourceNode: switchNode,
            targetNode: route.action
        });
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: switchNode.id, handle: SWITCH_DEFAULT_HANDLE },
        to: { nodeId: otherwise.action.id, handle: otherwise.inputHandle },
        sourceNode: switchNode,
        targetNode: otherwise.action
    });
};

/**
 * Insert a Catch Error node on one existing route. The compiler replaces the
 * original connection with success and failure paths, and binds the handler
 * to exactly the source node that can fail.
 */
export const addErrorHandler = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const { from, to, match, sourceNode, targetNode } = requireExistingConnection({
        operation,
        connection: operation.connection,
        nodes,
        edges,
        refs,
        specsByNodeKey
    });
    const handler = operation.handler;
    assertNodeDefinition({
        operation,
        definition: handler,
        path: 'handler',
        message: 'add_error_handler requires an error handler definition.',
        code: 'WORKFLOW_ERROR_HANDLER_INVALID'
    });
    const handlerNode = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: {
            ref: handler.ref,
            nodeKey: CONTROL_FLOW_NODE_KEYS.catchError,
            title: handler.title,
            description: handler.description,
            config: { ...handler.config, errorSource: from.nodeId },
            afterNodeRef: handler.afterNodeRef || operation.connection.from.nodeRef
        },
        nodes,
        refs,
        specsByNodeKey
    });
    assertNodePorts({
        operation,
        node: handlerNode,
        outputs: ['errorPath', 'successPath'],
        code: 'WORKFLOW_ERROR_HANDLER_SCHEMA_INVALID',
        message: 'The Catch Error node schema does not expose errorPath and successPath.'
    });
    const handlerInput = requireSingleInputPort({
        operation,
        node: handlerNode,
        code: 'WORKFLOW_ERROR_HANDLER_SCHEMA_INVALID',
        message: 'The Catch Error node schema must expose exactly one connection input.'
    });
    const whenError = addSingleInputAction({
        operation,
        definition: operation.whenError,
        path: 'whenError',
        name: 'error recovery',
        afterNodeRef: handler.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_ERROR_HANDLER_RECOVERY_INVALID'
    });

    edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
    connectNodes({
        operation: operation.op,
        edges,
        from,
        to: { nodeId: handlerNode.id, handle: handlerInput },
        sourceNode,
        targetNode: handlerNode
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: handlerNode.id, handle: 'successPath' },
        to,
        sourceNode: handlerNode,
        targetNode
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: handlerNode.id, handle: 'errorPath' },
        to: { nodeId: whenError.action.id, handle: whenError.inputHandle },
        sourceNode: handlerNode,
        targetNode: whenError.action
    });
};

/**
 * Insert an Approval node on one existing connection. Approved work continues
 * through the original target; the optional rejected action gets the rejected
 * route without requiring model-authored ports or rewiring.
 */
export const addApprovalGate = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    const { from, to, match, sourceNode, targetNode } = requireExistingConnection({
        operation,
        connection: operation.connection,
        nodes,
        edges,
        refs,
        specsByNodeKey
    });
    const approval = operation.approval;
    assertNodeDefinition({
        operation,
        definition: approval,
        path: 'approval',
        message: 'add_approval_gate requires an approval definition.',
        code: 'WORKFLOW_APPROVAL_GATE_INVALID'
    });
    const approvalNode = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: {
            ref: approval.ref,
            nodeKey: CONTROL_FLOW_NODE_KEYS.approval,
            title: approval.title,
            description: approval.description,
            config: approval.config,
            afterNodeRef: approval.afterNodeRef || operation.connection.from.nodeRef
        },
        nodes,
        refs,
        specsByNodeKey
    });
    assertNodePorts({
        operation,
        node: approvalNode,
        outputs: ['approved', 'rejected'],
        code: 'WORKFLOW_APPROVAL_GATE_SCHEMA_INVALID',
        message: 'The Approval node schema does not expose approved and rejected routes.'
    });
    const approvalInput = requireSingleInputPort({
        operation,
        node: approvalNode,
        code: 'WORKFLOW_APPROVAL_GATE_SCHEMA_INVALID',
        message: 'The Approval node schema must expose exactly one connection input.'
    });
    const whenRejected = operation.whenRejected
        ? addSingleInputAction({
            operation,
            definition: operation.whenRejected,
            path: 'whenRejected',
            name: 'rejected outcome',
            afterNodeRef: approval.ref,
            nodes,
            refs,
            specsByNodeKey,
            code: 'WORKFLOW_APPROVAL_REJECTED_ACTION_INVALID'
        })
        : null;

    edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
    connectNodes({
        operation: operation.op,
        edges,
        from,
        to: { nodeId: approvalNode.id, handle: approvalInput },
        sourceNode,
        targetNode: approvalNode
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: approvalNode.id, handle: 'approved' },
        to,
        sourceNode: approvalNode,
        targetNode
    });
    if (whenRejected) {
        connectNodes({
            operation: operation.op,
            edges,
            from: { nodeId: approvalNode.id, handle: 'rejected' },
            to: { nodeId: whenRejected.action.id, handle: whenRejected.inputHandle },
            sourceNode: approvalNode,
            targetNode: whenRejected.action
        });
    }
};

/**
 * Move an existing approval gate onto one different, AI-selected connection.
 * The AI identifies intent by choosing the current approval and route; the
 * compiler owns the fragile reconnection so the graph stays connected and any
 * rejection route remains unchanged.
 */
export const moveApprovalGate = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    if (typeof operation.approvalNodeRef !== 'string' || !operation.approvalNodeRef.trim()) {
        throwEditError(operation.op, 'move_approval_gate requires the existing Approval node reference.', {
            code: 'WORKFLOW_APPROVAL_MOVE_INVALID', path: 'approvalNodeRef'
        });
    }
    const approvalId = refs.get(operation.approvalNodeRef);
    const approval = nodes.find(node => node.id === approvalId);
    if (!approval) {
        throwEditError(operation.op, `Unknown Approval nodeRef '${operation.approvalNodeRef}'.`, {
            code: 'WORKFLOW_NODE_REF_INVALID', value: operation.approvalNodeRef, allowed: [...refs.keys()]
        });
    }
    if ((approval.nodeKey || `${approval.type}:${approval.subType}`) !== CONTROL_FLOW_NODE_KEYS.approval) {
        throwEditError(operation.op, 'approvalNodeRef must identify an existing Approval step.', {
            code: 'WORKFLOW_APPROVAL_MOVE_INVALID', path: 'approvalNodeRef', value: operation.approvalNodeRef
        });
    }
    const approvalForValidation = withKnownSchema(approval, specsByNodeKey);
    assertNodePorts({
        operation,
        node: approvalForValidation,
        outputs: ['approved', 'rejected'],
        code: 'WORKFLOW_APPROVAL_GATE_SCHEMA_INVALID',
        message: 'The Approval node schema does not expose approved and rejected routes.'
    });
    const approvalInput = requireSingleInputPort({
        operation,
        node: approvalForValidation,
        code: 'WORKFLOW_APPROVAL_GATE_SCHEMA_INVALID',
        message: 'The Approval node schema must expose exactly one connection input.'
    });
    const incoming = edges.filter(edge => edge.target === approvalId);
    const approved = edges.filter(edge => edge.source === approvalId && edge.sourceHandle === 'approved');
    if (incoming.length !== 1 || approved.length !== 1) {
        throwEditError(operation.op, 'The selected Approval must have one incoming route and one approved route before it can move.', {
            code: 'WORKFLOW_APPROVAL_MOVE_UNSAFE'
        });
    }
    const oldIncoming = incoming[0];
    const oldApproved = approved[0];
    if ((oldIncoming.targetHandle || null) !== approvalInput) {
        throwEditError(operation.op, 'The selected Approval has an unsupported incoming route.', {
            code: 'WORKFLOW_APPROVAL_MOVE_UNSAFE'
        });
    }
    const oldSource = nodes.find(node => node.id === oldIncoming.source);
    const oldTarget = nodes.find(node => node.id === oldApproved.target);
    if (!oldSource || !oldTarget) {
        throwEditError(operation.op, 'The selected Approval has a connection to a missing step.', {
            code: 'WORKFLOW_NODE_REF_INVALID'
        });
    }
    const next = requireExistingConnection({
        operation,
        connection: operation.connection,
        nodes,
        edges,
        refs,
        specsByNodeKey
    });
    if (next.from.nodeId === approvalId || next.to.nodeId === approvalId) {
        throwEditError(operation.op, 'Choose a different route for the Approval step.', {
            code: 'WORKFLOW_APPROVAL_MOVE_INVALID', path: 'connection'
        });
    }
    if (operation.approvalUpdates !== undefined && !isObject(operation.approvalUpdates)) {
        throwEditError(operation.op, 'Approval updates must be an object.', {
            code: 'WORKFLOW_APPROVAL_MOVE_INVALID', path: 'approvalUpdates'
        });
    }
    if (operation.approvalUpdates?.config !== undefined && !isObject(operation.approvalUpdates.config)) {
        throwEditError(operation.op, 'Approval updates need a config object.', {
            code: 'WORKFLOW_APPROVAL_MOVE_INVALID', path: 'approvalUpdates.config'
        });
    }
    if (operation.approvalUpdates) {
        const updates = operation.approvalUpdates;
        approval.title = typeof updates.title === 'string' && updates.title.trim() ? updates.title.trim() : approval.title;
        approval.description = typeof updates.description === 'string' && updates.description.trim() ? updates.description.trim() : approval.description;
        approval.config = updates.config ? { ...(approval.config || {}), ...updates.config } : approval.config;
    }

    edges.splice(0, edges.length, ...edges.filter(edge => edge !== oldIncoming && edge !== oldApproved && edge !== next.match));
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: oldIncoming.source, handle: oldIncoming.sourceHandle || null },
        to: { nodeId: oldApproved.target, handle: oldApproved.targetHandle || null },
        sourceNode: withKnownSchema(oldSource, specsByNodeKey),
        targetNode: withKnownSchema(oldTarget, specsByNodeKey)
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: next.from,
        to: { nodeId: approvalId, handle: approvalInput },
        sourceNode: next.sourceNode,
        targetNode: approvalForValidation
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: approvalId, handle: 'approved' },
        to: next.to,
        sourceNode: approvalForValidation,
        targetNode: next.targetNode
    });
};

const resolveBranchSource = ({ operation, endpoint, path, nodes, refs, specsByNodeKey }) => {
    const from = normalizeEndpoint(endpoint, refs, operation.op, path);
    const sourceNode = nodes.find(node => node.id === from.nodeId);
    if (!sourceNode) throwEditError(operation.op, 'A merge branch references a missing node.', { code: 'WORKFLOW_MERGE_BRANCH_INVALID', path });
    const sourceForValidation = withKnownSchema(sourceNode, specsByNodeKey);
    const outputs = connectionHandlesFor(sourceForValidation, 'outputs');
    const handle = from.handle || (outputs.length === 1 ? outputs[0] : null);
    if (!handle) {
        throwEditError(operation.op, 'Each merge branch needs an explicit source handle when its source has multiple outputs.', {
            code: 'WORKFLOW_MERGE_BRANCH_HANDLE_REQUIRED', path: `${path}.handle`
        });
    }
    assertConnectionHandle(sourceForValidation, handle, 'outputs', operation.op);
    return { from: { ...from, handle }, sourceNode: sourceForValidation };
};

/**
 * Connect two or more branch tails to one Merge node, then continue through a
 * single next action. The compiler owns the shared Merge.input1 connection and
 * keeps existing branch destinations intact.
 */
export const joinBranches = ({ operation, nodes, edges, refs, specsByNodeKey }) => {
    if (!Array.isArray(operation.branches) || operation.branches.length < 2 || operation.branches.length > 12) {
        throwEditError(operation.op, 'join_branches requires between two and twelve branch routes.', {
            code: 'WORKFLOW_MERGE_BRANCHES_INVALID', path: 'branches'
        });
    }
    const branches = operation.branches.map((branch, index) => {
        if (!isObject(branch?.from)) {
            throwEditError(operation.op, 'Each merge branch needs a from endpoint.', {
                code: 'WORKFLOW_MERGE_BRANCH_INVALID', path: `branches[${index}].from`
            });
        }
        return resolveBranchSource({
            operation,
            endpoint: branch.from,
            path: `branches[${index}].from`,
            nodes,
            refs,
            specsByNodeKey
        });
    });
    const branchKeys = new Set();
    for (const branch of branches) {
        const key = `${branch.from.nodeId}:${branch.from.handle}`;
        if (branchKeys.has(key)) {
            throwEditError(operation.op, 'Each merge branch must be a different route.', {
                code: 'WORKFLOW_MERGE_BRANCHES_DUPLICATE', path: 'branches'
            });
        }
        branchKeys.add(key);
    }
    const merge = operation.merge;
    assertNodeDefinition({
        operation,
        definition: merge,
        path: 'merge',
        message: 'join_branches requires a Merge definition.',
        code: 'WORKFLOW_MERGE_INVALID'
    });
    const mergeMode = merge.config.mergeMode || 'object';
    if (!mergeModes.has(mergeMode)) {
        throwEditError(operation.op, 'join_branches supports object, array, or last mergeMode.', {
            code: 'WORKFLOW_MERGE_CONFIG_INVALID', path: 'merge.config.mergeMode'
        });
    }
    const mergeNode = addNodeFromEdit({
        operation: operation.op,
        nodeDefinition: {
            ref: merge.ref,
            nodeKey: CONTROL_FLOW_NODE_KEYS.merge,
            title: merge.title,
            description: merge.description,
            config: { mergeMode },
            afterNodeRef: merge.afterNodeRef || operation.branches[0].from.nodeRef
        },
        nodes,
        refs,
        specsByNodeKey
    });
    assertNodePorts({
        operation,
        node: mergeNode,
        inputs: ['input1'],
        outputs: ['outputData'],
        code: 'WORKFLOW_MERGE_SCHEMA_INVALID',
        message: 'The Merge node schema does not expose input1 and outputData.'
    });
    const continueWith = addSingleInputAction({
        operation,
        definition: operation.continueWith,
        path: 'continueWith',
        name: 'post-merge action',
        afterNodeRef: merge.ref,
        nodes,
        refs,
        specsByNodeKey,
        code: 'WORKFLOW_MERGE_CONTINUATION_INVALID'
    });

    branches.forEach(branch => {
        connectNodes({
            operation: operation.op,
            edges,
            from: branch.from,
            to: { nodeId: mergeNode.id, handle: 'input1' },
            sourceNode: branch.sourceNode,
            targetNode: mergeNode
        });
    });
    connectNodes({
        operation: operation.op,
        edges,
        from: { nodeId: mergeNode.id, handle: 'outputData' },
        to: { nodeId: continueWith.action.id, handle: continueWith.inputHandle },
        sourceNode: mergeNode,
        targetNode: continueWith.action
    });
};

export const compileControlFlowOperation = args => {
    switch (args.operation?.op) {
    case 'add_condition_branch':
        addConditionBranch(args);
        return true;
    case 'add_switch_routes':
        addSwitchRoutes(args);
        return true;
    case 'add_error_handler':
        addErrorHandler(args);
        return true;
    case 'add_approval_gate':
        addApprovalGate(args);
        return true;
    case 'move_approval_gate':
        moveApprovalGate(args);
        return true;
    case 'join_branches':
        joinBranches(args);
        return true;
    default:
        return false;
    }
};
