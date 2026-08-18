import NodeRegistry from '../../../../../utils/NodeRegistry.js';
import { validateWorkflow } from '../../../../engine/workflowValidator.js';
import { layoutWorkflow } from '../../../../../../shared/workflowLayout.js';
import {
    addNodeFromEdit,
    connectNodes,
    createEditView,
    findConnection,
    insertAfterRoute,
    insertBetween,
    normalizeEndpoint,
    normalizeSingleInputHandle,
    normalizeSingleOutputHandle,
    resolveWorkflowReferenceNodeRefs,
    throwEditError,
    withKnownSchema
} from './graph.js';
import { compileControlFlowOperation } from './controlFlow.js';
import { isLegacyControlFlowOperation, legacyOperationIssueForNodeKey } from './contracts.js';
import { planWorkflowNodeDeletion } from '../../../../../../shared/workflowDeletion.js';

export const buildWorkflowEditView = createEditView;

const assertWorkflowDefinition = (nodes, edges, isActive = false, registry = NodeRegistry, requireConnected = false, validateConfig = true) => {
    const validation = validateWorkflow({ nodes, edges, isActive, requireConnected, validateConfig, registry });
    if (!validation.valid) {
        const error = new Error(`AI workflow proposal failed validation: ${validation.issues.map(item => item.message).join('; ')}`);
        error.code = 'WORKFLOW_PROPOSAL_INVALID';
        error.issues = validation.issues;
        throw error;
    }
    return validation;
};

const rejectLegacyControlFlowOperation = operation => {
    const issue = legacyOperationIssueForNodeKey(operation?.node?.nodeKey);
    if (!issue) return;
    throwEditError(operation.op, issue.message, {
        code: issue.code,
        path: 'node.nodeKey'
    });
};

/**
 * The compiler is the only writer of graph topology for semantic control-flow
 * requests. Generic operations remain deliberately small for ordinary linear
 * nodes, while multi-route behavior is delegated to controlFlow.js.
 */
export const compileWorkflowEdits = ({ currentWorkflow = {}, operations = [], specs = [], registry = NodeRegistry, deferConfigValidation = false }) => {
    if (!Array.isArray(operations)) throwEditError('plan', 'Workflow edit plan must contain an operations array.', { code: 'WORKFLOW_EDIT_PLAN_INVALID' });
    if (operations.length > 50) throwEditError('plan', 'A workflow edit plan may contain at most 50 operations.', { code: 'WORKFLOW_EDIT_PLAN_TOO_LARGE' });
    const nodes = JSON.parse(JSON.stringify(currentWorkflow.nodes || []));
    const edges = JSON.parse(JSON.stringify(currentWorkflow.edges || []));
    const originalNodes = JSON.parse(JSON.stringify(nodes));
    const originalEdges = JSON.parse(JSON.stringify(edges));
    const specsByNodeKey = new Map(specs.map(spec => [spec.nodeKey || `${spec.type}:${spec.subType}`, spec]));
    const refs = new Map(currentWorkflow.nodes?.map((node, index) => [`n${index + 1}`, node.id]) || []);
    const deletionEffects = [];

    for (const operation of operations) {
        if (!operation || typeof operation.op !== 'string') {
            throwEditError('plan', 'Every workflow edit requires an operation.', { code: 'WORKFLOW_EDIT_OPERATION_INVALID' });
        }
        if (isLegacyControlFlowOperation(operation)) {
            rejectLegacyControlFlowOperation(operation);
        } else if (compileControlFlowOperation({ operation, nodes, edges, refs, specsByNodeKey })) {
            continue;
        } else if (operation.op === 'create_node') {
            addNodeFromEdit({ operation: operation.op, nodeDefinition: operation.node, nodes, refs, specsByNodeKey });
        } else if (operation.op === 'remove_node') {
            const nodeId = refs.get(operation.nodeRef);
            if (!nodeId) throwEditError(operation.op, `Unknown nodeRef '${operation.nodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });

            // Earlier operations may have authored canonical references using
            // the worker's stable node refs. Resolve those before the shared
            // deletion planner examines the graph, so AI removal has exactly
            // the same repair semantics as canvas removal.
            nodes.splice(0, nodes.length, ...resolveWorkflowReferenceNodeRefs({ nodes, refs }));
            const deletion = planWorkflowNodeDeletion({
                nodes,
                edges,
                nodeIds: [nodeId],
                schemaForNode: node => withKnownSchema(node, specsByNodeKey)?.schema || {},
                schemasByNodeKey: specsByNodeKey
            });
            if (!deletion.canApply) {
                throwEditError(
                    operation.op,
                    deletion.blockers?.[0]?.message || 'Deleting this step would leave an ambiguous or malformed workflow reference.',
                    { code: 'WORKFLOW_NODE_DELETION_REQUIRES_REPAIR' }
                );
            }
            nodes.splice(0, nodes.length, ...deletion.nodes);
            edges.splice(0, edges.length, ...deletion.edges);
            deletionEffects.push({
                removedNodeId: nodeId,
                removedNode: deletion.impact?.removedNodes?.[0] || null,
                clearedReferences: deletion.impact?.clearedReferences || [],
                bypassedEdges: deletion.impact?.bypassedEdges || [],
                removedEdges: deletion.impact?.removedEdges || []
            });
            refs.delete(operation.nodeRef);
        } else if (operation.op === 'update_node') {
            const nodeId = refs.get(operation.nodeRef);
            const index = nodes.findIndex(node => node.id === nodeId);
            if (index === -1) throwEditError(operation.op, `Unknown nodeRef '${operation.nodeRef}'.`, { code: 'WORKFLOW_NODE_REF_INVALID' });
            const updates = operation.updates || {};
            if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
                throwEditError(operation.op, 'update_node requires an updates object.', { code: 'WORKFLOW_EDIT_UPDATES_INVALID' });
            }
            nodes[index] = {
                ...nodes[index],
                ...Object.fromEntries(Object.entries(updates).filter(([key]) => !['id', 'type', 'subType', 'nodeKey', 'schema', 'position', 'layoutPinned'].includes(key))),
                config: updates.config ? { ...(nodes[index].config || {}), ...updates.config } : nodes[index].config
            };
        } else if (operation.op === 'connect' || operation.op === 'disconnect') {
            const from = normalizeEndpoint(operation.from, refs, operation.op, 'from');
            const to = normalizeEndpoint(operation.to, refs, operation.op, 'to');
            const sourceNode = nodes.find(node => node.id === from.nodeId);
            const targetNode = nodes.find(node => node.id === to.nodeId);
            if (!sourceNode || !targetNode) throwEditError(operation.op, 'Connection references a missing node.', { code: 'WORKFLOW_NODE_REF_INVALID' });
            const sourceForValidation = withKnownSchema(sourceNode, specsByNodeKey);
            const targetForValidation = withKnownSchema(targetNode, specsByNodeKey);
            if (operation.op === 'connect') {
                connectNodes({ operation: operation.op, edges, from, to, sourceNode: sourceForValidation, targetNode: targetForValidation });
            } else {
                const resolvedFrom = { ...from, handle: normalizeSingleOutputHandle(sourceForValidation, from.handle) };
                const resolvedTo = { ...to, handle: normalizeSingleInputHandle(targetForValidation, to.handle) };
                const match = findConnection(edges, resolvedFrom, resolvedTo);
                if (!match) throwEditError(operation.op, 'The requested connection does not exist.', { code: 'WORKFLOW_CONNECTION_NOT_FOUND' });
                edges.splice(0, edges.length, ...edges.filter(edge => edge !== match));
            }
        } else if (operation.op === 'insert_between') {
            insertBetween({ operation, nodes, edges, refs, specsByNodeKey });
        } else if (operation.op === 'insert_after_route') {
            insertAfterRoute({ operation, nodes, edges, refs, specsByNodeKey });
        } else {
            throwEditError(operation.op, `Unsupported workflow edit operation '${operation.op}'.`, { code: 'WORKFLOW_EDIT_OPERATION_INVALID' });
        }
    }

    nodes.splice(0, nodes.length, ...resolveWorkflowReferenceNodeRefs({ nodes, refs }));
    nodes.splice(0, nodes.length, ...layoutWorkflow({ nodes, edges, mode: 'respect-pins' }));
    const validation = assertWorkflowDefinition(nodes, edges, Boolean(currentWorkflow.isActive), registry, true, !deferConfigValidation);
    if (!validation.valid && validation.issues?.length) {
        throwEditError('validate', 'The edit plan produced an invalid workflow graph. Review the node refs and connection handles.', { code: 'WORKFLOW_EDIT_GRAPH_INVALID' });
    }
    return { nodes, edges, originalNodes, originalEdges, refs, deletionEffects };
};
