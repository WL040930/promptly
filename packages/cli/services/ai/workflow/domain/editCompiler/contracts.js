export const CONTROL_FLOW_NODE_KEYS = Object.freeze({
    condition: 'logic:condition',
    switch: 'logic:switch',
    catchError: 'logic:catchError',
    merge: 'logic:merge',
    approval: 'logic:approval'
});

export const CONTROL_FLOW_SEMANTIC_OPERATIONS = Object.freeze({
    [CONTROL_FLOW_NODE_KEYS.condition]: 'add_condition_branch',
    [CONTROL_FLOW_NODE_KEYS.switch]: 'add_switch_routes',
    [CONTROL_FLOW_NODE_KEYS.catchError]: 'add_error_handler',
    [CONTROL_FLOW_NODE_KEYS.merge]: 'join_branches',
    [CONTROL_FLOW_NODE_KEYS.approval]: 'add_approval_gate'
});

export const CONTROL_FLOW_LEGACY_OPERATION_ISSUES = Object.freeze({
    [CONTROL_FLOW_NODE_KEYS.condition]: {
        code: 'WORKFLOW_CONDITION_BRANCH_OPERATION_REQUIRED',
        message: 'Use add_condition_branch to add a new Condition and its true/false outcomes.'
    },
    [CONTROL_FLOW_NODE_KEYS.switch]: {
        code: 'WORKFLOW_SWITCH_ROUTES_OPERATION_REQUIRED',
        message: 'Use add_switch_routes to add a new Switch and its case routes.'
    },
    [CONTROL_FLOW_NODE_KEYS.catchError]: {
        code: 'WORKFLOW_ERROR_HANDLER_OPERATION_REQUIRED',
        message: 'Use add_error_handler to add a Catch Error step and its recovery route.'
    },
    [CONTROL_FLOW_NODE_KEYS.merge]: {
        code: 'WORKFLOW_MERGE_OPERATION_REQUIRED',
        message: 'Use join_branches to add a Merge step and its continuation.'
    },
    [CONTROL_FLOW_NODE_KEYS.approval]: {
        code: 'WORKFLOW_APPROVAL_GATE_OPERATION_REQUIRED',
        message: 'Use add_approval_gate to add an Approval step and its routes.'
    }
});

export const SEMANTIC_CONTROL_FLOW_NODE_KEYS = new Set(Object.keys(CONTROL_FLOW_SEMANTIC_OPERATIONS));
export const LEGACY_CONTROL_FLOW_OPERATION_NAMES = new Set(['create_node', 'insert_between', 'insert_after_route']);
export const SWITCH_BRANCH_HANDLES = Object.freeze(['branchA', 'branchB']);
export const SWITCH_DEFAULT_HANDLE = 'default';

export const semanticOperationForNodeKey = nodeKey => CONTROL_FLOW_SEMANTIC_OPERATIONS[nodeKey] || null;
export const legacyOperationIssueForNodeKey = nodeKey => CONTROL_FLOW_LEGACY_OPERATION_ISSUES[nodeKey] || null;

export const isLegacyControlFlowOperation = operation => LEGACY_CONTROL_FLOW_OPERATION_NAMES.has(operation?.op)
    && Boolean(semanticOperationForNodeKey(operation?.node?.nodeKey));
