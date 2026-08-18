import {
    isWorkflowBinding,
    isWorkflowBindingTemplate,
    isWorkflowExpression
} from './workflowExpressions.js';
import { isNodeInputRequired } from './nodeConfigContract.js';

const DELETE_VALUE = Symbol('delete-workflow-config-value');
const LEGACY_REFERENCE_RE = /\{\{([^{}]+)\}\}/g;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
};
const nodeKeyFor = node => node?.nodeKey || `${node?.type || ''}:${node?.subType || ''}`;

const schemaForNodeFrom = ({ node, schemaForNode, schemasByNodeKey }) => {
    if (typeof schemaForNode === 'function') return schemaForNode(node) || {};
    if (node?.schema) return node.schema;
    if (node?.configSchema) return node.configSchema;
    if (schemasByNodeKey instanceof Map) {
        const value = schemasByNodeKey.get(nodeKeyFor(node));
        return value?.schema || value || {};
    }
    if (Array.isArray(schemasByNodeKey)) {
        const value = schemasByNodeKey.find(spec => nodeKeyFor(spec) === nodeKeyFor(node));
        return value?.schema || value || {};
    }
    return {};
};

const schemaInputs = schema => Array.isArray(schema?.inputs) ? schema.inputs : [];
const inputByName = schema => new Map(schemaInputs(schema).filter(input => input?.name).map(input => [input.name, input]));
const legacySyntax = input => ['workflow-expression', 'node-template'].includes(input?.valueSyntax);
const configPath = (node, fieldName) => `nodes.${node?.id || 'new'}.config.${fieldName}`;
const sourceTitle = node => node?.title || node?.name || node?.subType || null;

const uniqueTitleIndex = nodes => {
    const titles = new Map();
    for (const node of nodes || []) {
        const title = sourceTitle(node);
        if (!title) continue;
        const ids = titles.get(title) || [];
        ids.push(node.id);
        titles.set(title, ids);
    }
    return titles;
};

const buildSourceMatcher = ({ nodes, removedNodeIds, additionalSourceKeys = [] }) => {
    const nodesById = new Map((nodes || []).map(node => [node?.id, node]));
    const titles = uniqueTitleIndex(nodes);
    const removedTitles = new Map();
    for (const node of nodes || []) {
        if (!removedNodeIds.has(node?.id)) continue;
        const title = sourceTitle(node);
        if (!title) continue;
        const ids = removedTitles.get(title) || [];
        ids.push(node.id);
        removedTitles.set(title, ids);
    }
    const additional = new Set((additionalSourceKeys || []).filter(Boolean).map(String));

    return source => {
        const token = String(source || '').trim();
        if (!token) return { kind: 'none' };
        if (removedNodeIds.has(token) || additional.has(token)) {
            const node = nodesById.get(token);
            return { kind: 'match', sourceNodeId: node?.id || token, sourceNode: node || null };
        }
        const titleIds = titles.get(token) || [];
        if (titleIds.length > 1 && (removedTitles.has(token) || additional.has(token))) {
            return {
                kind: 'blocked',
                sourceNodeId: token,
                message: `The workflow step title '${token}' is ambiguous. Choose a replacement before deleting this step.`
            };
        }
        if (titleIds.length === 1 && removedNodeIds.has(titleIds[0])) {
            const node = nodesById.get(titleIds[0]);
            return { kind: 'match', sourceNodeId: titleIds[0], sourceNode: node || null };
        }
        if (additional.has(token)) return { kind: 'match', sourceNodeId: token, sourceNode: null };
        return { kind: 'none' };
    };
};

const isReferenceLike = value => isObject(value)
    && value.$expr === 'reference'
    && typeof value.nodeId === 'string';

const isValidReference = value => isWorkflowExpression(value)
    && value.$expr === 'reference'
    && typeof value.nodeId === 'string'
    && Array.isArray(value.path)
    && value.path.length > 0
    && value.path.every(part => typeof part === 'string' && part.trim());

const directReset = input => {
    if (input && Object.hasOwn(input, 'defaultValue') && input.defaultValue !== undefined) {
        return { value: clone(input.defaultValue) };
    }
    return { value: DELETE_VALUE };
};

const describeRemovedNode = node => ({
    id: node?.id,
    title: sourceTitle(node),
    subType: node?.subType || null
});

const handleNames = (schema, direction) => schema?.[direction]
    ?.filter(handle => handle?.isConnection && handle?.name)
    .map(handle => handle.name) || [];

const isHandleCompatible = ({ sourceNode, targetNode, edgeIn, edgeOut, schemaForNode }) => {
    const sourceHandles = handleNames(schemaForNode(sourceNode), 'outputs');
    const targetHandles = handleNames(schemaForNode(targetNode), 'inputs');
    if (sourceHandles.length > 1 && !edgeIn.sourceHandle) return false;
    if (targetHandles.length > 1 && !edgeOut.targetHandle) return false;
    if (edgeIn.sourceHandle && sourceHandles.length > 0 && !sourceHandles.includes(edgeIn.sourceHandle)) return false;
    if (edgeOut.targetHandle && targetHandles.length > 0 && !targetHandles.includes(edgeOut.targetHandle)) return false;
    return true;
};

const connectionKey = edge => [
    edge?.source,
    edge?.sourceHandle || null,
    edge?.target,
    edge?.targetHandle || null
].join('|');

const reaches = (edges, start, goal) => {
    if (start === goal) return true;
    const outgoing = new Map();
    for (const edge of edges || []) {
        const targets = outgoing.get(edge?.source) || [];
        targets.push(edge?.target);
        outgoing.set(edge?.source, targets);
    }
    const queue = [start];
    const visited = new Set([start]);
    while (queue.length > 0) {
        const current = queue.shift();
        for (const target of outgoing.get(current) || []) {
            if (target === goal) return true;
            if (visited.has(target)) continue;
            visited.add(target);
            queue.push(target);
        }
    }
    return false;
};

const createBypassEdge = ({ edges, removedNodeId, nodesById, schemaForNode }) => {
    const incoming = edges.filter(edge => edge?.target === removedNodeId && edge?.source !== removedNodeId);
    const outgoing = edges.filter(edge => edge?.source === removedNodeId && edge?.target !== removedNodeId);
    if (incoming.length !== 1 || outgoing.length !== 1) return null;

    const edgeIn = incoming[0];
    const edgeOut = outgoing[0];
    const sourceNode = nodesById.get(edgeIn.source);
    const targetNode = nodesById.get(edgeOut.target);
    if (!sourceNode || !targetNode) return null;
    if (!isHandleCompatible({ sourceNode, targetNode, edgeIn, edgeOut, schemaForNode })) return null;

    const survivingEdges = edges.filter(edge => edge !== edgeIn && edge !== edgeOut && edge.source !== removedNodeId && edge.target !== removedNodeId);
    if (reaches(survivingEdges, edgeOut.target, edgeIn.source)) return null;

    const candidate = {
        ...edgeIn,
        id: `${edgeIn.id || `${edgeIn.source}-${removedNodeId}`}__bypass__${edgeOut.id || `${removedNodeId}-${edgeOut.target}`}`,
        source: edgeIn.source,
        sourceHandle: edgeIn.sourceHandle ?? null,
        target: edgeOut.target,
        targetHandle: edgeOut.targetHandle ?? null
    };
    const keys = new Set(survivingEdges.map(connectionKey));
    if (keys.has(connectionKey(candidate))) return null;
    const ids = new Set(edges.map(edge => edge?.id).filter(Boolean));
    let id = candidate.id;
    let suffix = 2;
    while (ids.has(id)) id = `${candidate.id}_${suffix++}`;
    return { ...candidate, id };
};

const makeImpact = ({ recovery, nodes, removedNodeIds }) => ({
    recovery,
    removedNodes: (nodes || []).filter(node => removedNodeIds.has(node?.id)).map(describeRemovedNode),
    removedFields: [],
    removedEdges: [],
    bypassedEdges: [],
    clearedReferences: [],
    clearedNodeSelections: [],
    blockedReferences: [],
    affectedNodeIds: []
});

/**
 * Plan graph deletion and reference repair as one pure operation.
 *
 * The UI and the AI compiler both call this module. It deliberately returns a
 * plan instead of mutating a graph, which keeps review/cancel/undo atomic and
 * makes the persistence boundary responsible for the final validation.
 */
export const planWorkflowNodeDeletion = ({
    nodes = [],
    edges = [],
    nodeIds = [],
    schemaForNode: schemaResolver,
    schemasByNodeKey,
    allowLegacyReferences = true,
    additionalSourceKeys = [],
    recovery = false,
    repairDanglingBindings = false,
    referenceMatcher = null,
    legacyReferenceMatcher = null
} = {}) => {
    const originalNodes = Array.isArray(nodes) ? nodes : [];
    const originalEdges = Array.isArray(edges) ? edges : [];
    const requestedIds = new Set((nodeIds || []).filter(Boolean).map(String));
    const actualRemovedIds = new Set(originalNodes.filter(node => requestedIds.has(node?.id)).map(node => node.id));
    const schemaForNode = node => schemaForNodeFrom({ node, schemaForNode: schemaResolver, schemasByNodeKey });
    const nodesById = new Map(originalNodes.map(node => [node?.id, node]));
    const sourceMatches = buildSourceMatcher({
        nodes: originalNodes,
        removedNodeIds: requestedIds,
        additionalSourceKeys
    });
    const removedFormIds = new Set(originalNodes
        .filter(node => actualRemovedIds.has(node?.id) && node?.subType === 'form-submission')
        .map(node => node.id));
    const survivingFormCount = originalNodes.filter(node => !actualRemovedIds.has(node?.id) && node?.subType === 'form-submission').length;
    const bindingAffected = repairDanglingBindings || (removedFormIds.size > 0 && survivingFormCount === 0);
    const impact = makeImpact({ recovery, nodes: originalNodes, removedNodeIds: actualRemovedIds });

    const blockers = impact.blockedReferences;
    const recordReference = ({ node, fieldName, path, sourceNodeId, sourceNode, kind = 'reference', required = false, fieldId = null, message = null }) => {
        const item = {
            nodeId: node?.id,
            title: sourceTitle(node),
            configPath: configPath(node, fieldName),
            valuePath: path,
            sourceNodeId,
            sourceTitle: sourceTitle(sourceNode),
            kind,
            required: Boolean(required)
        };
        if (fieldId) item.fieldId = fieldId;
        if (message) {
            blockers.push({ ...item, message });
            return;
        }
        // Keep one review list for every value that will be cleared. The
        // kind distinguishes node-selects from data references without
        // making callers merge two potentially duplicated collections.
        impact.clearedReferences.push(item);
        if (kind === 'node-select') impact.clearedNodeSelections.push(item);
        if (node?.id && !impact.affectedNodeIds.includes(node.id)) impact.affectedNodeIds.push(node.id);
    };

    const recordBlocked = ({ node, fieldName, path, sourceNodeId, message }) => recordReference({
        node,
        fieldName,
        path,
        sourceNodeId,
        sourceNode: null,
        message
    });

    const matchReference = ({ value }) => {
        if (typeof referenceMatcher === 'function') {
            const customMatch = referenceMatcher({ value, nodes: originalNodes, nodesById, sourceMatches });
            if (customMatch) return customMatch;
        }
        if (!isReferenceLike(value)) return { kind: 'none' };
        return sourceMatches(value.nodeId);
    };

    const resetValueFor = input => directReset(input).value;

    const transformValue = ({ value, node, fieldName, fieldInput, path, direct = false, legacyEnabled }) => {
        if (isReferenceLike(value) && !isValidReference(value)) {
            const match = matchReference({ value });
            if (match.kind === 'match' || match.kind === 'blocked') {
                recordBlocked({
                    node,
                    fieldName,
                    path,
                    sourceNodeId: value.nodeId,
                    message: 'This workflow reference is malformed and needs repair before the step can be deleted.'
                });
                return { value, affected: false, blocked: true };
            }
        }
        if (isWorkflowExpression(value)) {
            if (value.$expr === 'reference') {
                const match = matchReference({ value });
                if (match.kind === 'blocked') {
                    recordBlocked({ node, fieldName, path, sourceNodeId: value.nodeId, message: match.message });
                    return { value, affected: false, blocked: true };
                }
                if (match.kind !== 'match') return { value, affected: false, blocked: false };
                recordReference({
                    node,
                    fieldName,
                    path,
                    sourceNodeId: match.sourceNodeId,
                    sourceNode: match.sourceNode,
                    fieldId: match.fieldId,
                    required: isNodeInputRequired(fieldInput, node?.config),
                    kind: 'reference'
                });
                return {
                    value: direct ? resetValueFor(fieldInput) : '',
                    affected: true,
                    blocked: false,
                    directReset: direct
                };
            }

            if (value.$expr === 'template') {
                if (!Array.isArray(value.parts)) {
                    const affected = [...String(value.nodeId || '')].length > 0 && sourceMatches(value.nodeId).kind === 'match';
                    if (affected) recordBlocked({
                        node,
                        fieldName,
                        path,
                        sourceNodeId: value.nodeId,
                        message: 'This workflow template is malformed and needs repair before the step can be deleted.'
                    });
                    return { value, affected: false, blocked: affected };
                }
                let affected = false;
                let blocked = false;
                const parts = [];
                for (const [index, part] of value.parts.entries()) {
                    if (isObject(part) && Object.hasOwn(part, 'reference')) {
                        const result = transformValue({
                            value: part.reference,
                            node,
                            fieldName,
                            fieldInput,
                            path: `${path}.parts[${index}]`,
                            direct: false,
                            legacyEnabled: false
                        });
                        affected ||= result.affected;
                        blocked ||= result.blocked;
                        if (!result.affected || result.blocked) parts.push(part);
                        continue;
                    }
                    parts.push(part);
                }
                if (!affected) return { value, affected: false, blocked };
                if (parts.length === 0) return { value: direct ? resetValueFor(fieldInput) : '', affected: true, blocked };
                return { value: { ...value, parts }, affected: true, blocked };
            }
        }

        if (isWorkflowBinding(value)) {
            if (!bindingAffected) return { value, affected: false, blocked: false };
            recordReference({
                node,
                fieldName,
                path,
                sourceNodeId: [...removedFormIds][0] || 'form-submission',
                sourceNode: nodesById.get([...removedFormIds][0]),
                required: isNodeInputRequired(fieldInput, node?.config),
                kind: 'binding'
            });
            return { value: direct ? resetValueFor(fieldInput) : '', affected: true, blocked: false };
        }

        if (isWorkflowBindingTemplate(value)) {
            let affected = false;
            let blocked = false;
            const parts = value.$template.map((part, index) => {
                const result = transformValue({
                    value: part,
                    node,
                    fieldName,
                    fieldInput,
                    path: `${path}.parts[${index}]`,
                    direct: false,
                    legacyEnabled
                });
                affected ||= result.affected;
                blocked ||= result.blocked;
                return result.value === DELETE_VALUE ? '' : result.value;
            });
            if (!affected) return { value, affected: false, blocked };
            if (parts.length === 0) return { value: direct ? resetValueFor(fieldInput) : '', affected: true, blocked };
            return { value: { ...value, $template: parts }, affected: true, blocked };
        }

        if (typeof value === 'string' && allowLegacyReferences && legacyEnabled) {
            const matches = [...value.matchAll(LEGACY_REFERENCE_RE)];
            if (matches.length === 0) return { value, affected: false, blocked: false };
            let affected = false;
            let blocked = false;
            let output = '';
            let cursor = 0;
            for (const match of matches) {
                const token = match[0];
                const sourcePath = String(match[1] || '').trim();
                const source = sourcePath.split('.')[0];
                const customResolution = typeof legacyReferenceMatcher === 'function'
                    ? legacyReferenceMatcher({ sourcePath, source, node, fieldName, path, nodes: originalNodes, nodesById, sourceMatches })
                    : null;
                const resolution = customResolution || sourceMatches(source);
                output += value.slice(cursor, match.index);
                if (resolution.kind === 'blocked') {
                    blocked = true;
                    recordBlocked({ node, fieldName, path, sourceNodeId: source, message: resolution.message });
                    output += token;
                } else if (resolution.kind === 'match') {
                    affected = true;
                    recordReference({
                        node,
                        fieldName,
                        path,
                        sourceNodeId: resolution.sourceNodeId,
                        sourceNode: resolution.sourceNode,
                        fieldId: resolution.fieldId,
                        required: isNodeInputRequired(fieldInput, node?.config),
                        kind: 'legacy-reference'
                    });
                } else {
                    output += token;
                }
                cursor = (match.index || 0) + token.length;
            }
            output += value.slice(cursor);
            if (!affected) return { value, affected: false, blocked };
            if (output === '') return { value: direct ? resetValueFor(fieldInput) : '', affected: true, blocked };
            return { value: output, affected: true, blocked };
        }

        if (Array.isArray(value)) {
            let affected = false;
            let blocked = false;
            const next = value.map((item, index) => {
                const result = transformValue({
                    value: item,
                    node,
                    fieldName,
                    fieldInput,
                    path: `${path}[${index}]`,
                    direct: false,
                    legacyEnabled
                });
                affected ||= result.affected;
                blocked ||= result.blocked;
                return result.value === DELETE_VALUE ? '' : result.value;
            });
            return { value: next, affected, blocked };
        }

        if (isObject(value)) {
            let affected = false;
            let blocked = false;
            const next = {};
            for (const [key, item] of Object.entries(value)) {
                const result = transformValue({
                    value: item,
                    node,
                    fieldName,
                    fieldInput,
                    path: `${path}.${key}`,
                    direct: false,
                    legacyEnabled
                });
                affected ||= result.affected;
                blocked ||= result.blocked;
                if (result.value !== DELETE_VALUE) next[key] = result.value;
            }
            return { value: next, affected, blocked };
        }

        return { value, affected: false, blocked: false };
    };

    const nextNodes = originalNodes
        .filter(node => !actualRemovedIds.has(node?.id))
        .map(node => {
            const schema = schemaForNode(node);
            const inputs = inputByName(schema);
            const config = { ...(node?.config || {}) };
            for (const [fieldName, fieldValue] of Object.entries(config)) {
                const fieldInput = inputs.get(fieldName);
                if (fieldInput?.type === 'node-select' && typeof fieldValue === 'string' && fieldValue) {
                    const match = sourceMatches(fieldValue);
                    if (match.kind === 'blocked') {
                        recordBlocked({ node, fieldName, path: configPath(node, fieldName), sourceNodeId: fieldValue, message: match.message });
                    } else if (match.kind === 'match') {
                        recordReference({
                            node,
                            fieldName,
                            path: configPath(node, fieldName),
                            sourceNodeId: match.sourceNodeId,
                            sourceNode: match.sourceNode,
                            required: isNodeInputRequired(fieldInput, config),
                            kind: 'node-select'
                        });
                        const reset = resetValueFor(fieldInput);
                        if (reset === DELETE_VALUE) delete config[fieldName];
                        else config[fieldName] = reset;
                    }
                    continue;
                }
                const result = transformValue({
                    value: fieldValue,
                    node,
                    fieldName,
                    fieldInput,
                    path: configPath(node, fieldName),
                    direct: true,
                    legacyEnabled: legacySyntax(fieldInput)
                });
                if (result.value === DELETE_VALUE) delete config[fieldName];
                else config[fieldName] = result.value;
            }
            const requiredBy = new Map(schemaInputs(schema).map(input => [input.name, isNodeInputRequired(input, config)]));
            for (const item of impact.clearedReferences) {
                if (item.nodeId === node.id && item.required === false && requiredBy.get(item.configPath.split('.').at(-1)) === true) item.required = true;
            }
            const nextNode = { ...node };
            if (Object.hasOwn(node || {}, 'config') || Object.keys(config).length > 0) nextNode.config = config;
            return nextNode;
        });

    const removedEdges = originalEdges.filter(edge => requestedIds.has(edge?.source) || requestedIds.has(edge?.target));
    impact.removedEdges.push(...removedEdges.map(edge => ({ ...edge })));
    let nextEdges = originalEdges.filter(edge => !requestedIds.has(edge?.source) && !requestedIds.has(edge?.target));

    const canAttemptBypass = requestedIds.size === 1 && actualRemovedIds.size === 1;
    if (canAttemptBypass) {
        const removedNodeId = [...actualRemovedIds][0];
        const bypass = createBypassEdge({ edges: originalEdges, removedNodeId, nodesById: new Map(originalNodes.map(node => [node.id, node])), schemaForNode });
        if (bypass) {
            nextEdges = [...nextEdges, bypass];
            impact.bypassedEdges.push({ ...bypass, removedNodeId });
        }
    }

    if (blockers.length > 0) {
        const unchangedNodes = originalNodes.map(node => {
            const nextNode = { ...node };
            if (Object.hasOwn(node || {}, 'config')) nextNode.config = { ...(node?.config || {}) };
            return nextNode;
        });
        return {
            canApply: false,
            requiresReview: true,
            nodes: unchangedNodes,
            edges: originalEdges.map(edge => ({ ...edge })),
            impact,
            blockers
        };
    }

    return {
        canApply: true,
        requiresReview: impact.clearedReferences.length > 0 || impact.clearedNodeSelections.length > 0,
        nodes: nextNodes,
        edges: nextEdges,
        impact,
        blockers: []
    };
};

const sourceNodesForForm = ({ nodes = [], formId }) => (nodes || []).filter(node => (
    node?.subType === 'form-submission'
    && node?.config?.formId === formId
));

const fieldIdsForDeletion = fieldIds => new Set(Array.from(fieldIds || []).filter(Boolean).map(String));

const fieldInfoFor = ({ formSchema, fieldIds }) => {
    const requested = fieldIdsForDeletion(fieldIds);
    const fields = Array.isArray(formSchema?.fields) ? formSchema.fields : [];
    return [...requested].map(id => {
        const field = fields.find(item => item?.id === id);
        return {
            id,
            label: field?.label || field?.name || field?.title || id,
            type: field?.type || null
        };
    });
};

const sourceNodeForLegacyToken = ({ source, nodes = [] }) => {
    const matches = (nodes || []).filter(node => node?.id === source || sourceTitle(node) === source);
    if (matches.length === 1) return { kind: 'match', sourceNode: matches[0], sourceNodeId: matches[0].id };
    if (matches.length > 1) {
        return {
            kind: 'blocked',
            sourceNodeId: source,
            message: `The workflow step title '${source}' is ambiguous. Repair the reference before deleting this field.`
        };
    }
    return { kind: 'none' };
};

/**
 * Plan removal of form fields from a workflow draft without changing graph
 * topology. This reuses the same value transformer as node deletion so direct
 * inputs, templates, nested values, and legacy references have one repair
 * policy. The form trigger itself remains in the graph.
 */
export const planWorkflowFormFieldDeletion = ({
    nodes = [],
    edges = [],
    formId,
    fieldIds = [],
    formSchema = null,
    schemaForNode: schemaResolver,
    schemasByNodeKey,
    allowLegacyReferences = true,
    recovery = false
} = {}) => {
    const requestedFieldIds = fieldIdsForDeletion(fieldIds);
    const formTriggers = sourceNodesForForm({ nodes, formId });
    const formTriggerIds = new Set(formTriggers.map(node => node.id));
    const fieldInfo = fieldInfoFor({ formSchema, fieldIds: requestedFieldIds });
    const fieldById = new Map(fieldInfo.map(field => [field.id, field]));

    const matchCanonicalReference = ({ value, nodes: sourceNodes }) => {
        if (!isReferenceLike(value) || !formTriggerIds.has(value.nodeId)) return null;
        if (!Array.isArray(value.path) || value.path[0] !== 'fields') return { kind: 'none' };
        const fieldId = value.path.length > 1 ? String(value.path[1]) : null;
        if (value.path.length !== 2) {
            if (fieldId && !requestedFieldIds.has(fieldId)) return { kind: 'none' };
            return {
                kind: 'blocked',
                sourceNodeId: value.nodeId,
                message: 'This form-field reference is malformed and needs repair before the field can be deleted.'
            };
        }
        if (!requestedFieldIds.has(fieldId)) return { kind: 'none' };
        return {
            kind: 'match',
            sourceNodeId: value.nodeId,
            sourceNode: sourceNodes.find(node => node?.id === value.nodeId) || null,
            fieldId
        };
    };

    const matchLegacyReference = ({ sourcePath, source, nodes: sourceNodes }) => {
        const resolved = sourceNodeForLegacyToken({ source, nodes: sourceNodes });
        if (resolved.kind !== 'match') return resolved.kind === 'blocked' ? resolved : null;
        if (!formTriggerIds.has(resolved.sourceNodeId)) return null;
        const path = String(sourcePath || '').split('.').slice(1);
        if (path[0] !== 'fields') return { kind: 'none' };
        const fieldId = path.length > 1 ? String(path[1]) : null;
        if (path.length !== 2) {
            if (fieldId && !requestedFieldIds.has(fieldId)) return { kind: 'none' };
            return {
                kind: 'blocked',
                sourceNodeId: resolved.sourceNodeId,
                message: 'This form-field reference is malformed and needs repair before the field can be deleted.'
            };
        }
        if (!requestedFieldIds.has(fieldId)) return { kind: 'none' };
        return { ...resolved, fieldId };
    };

    const result = planWorkflowNodeDeletion({
        nodes,
        edges,
        nodeIds: [],
        schemaForNode: schemaResolver,
        schemasByNodeKey,
        allowLegacyReferences,
        recovery,
        referenceMatcher: matchCanonicalReference,
        legacyReferenceMatcher: matchLegacyReference
    });

    result.impact.removedFields = fieldInfo;
    result.impact.clearedReferences = result.impact.clearedReferences.map(item => ({
        ...item,
        fieldLabel: fieldById.get(item.fieldId)?.label || item.fieldId || null
    }));
    result.impact.blockedReferences = result.impact.blockedReferences.map(item => ({
        ...item,
        fieldLabel: fieldById.get(item.fieldId)?.label || item.fieldId || null
    }));
    return result;
};

const activeFormFieldIds = schema => new Set((schema?.fields || [])
    .filter(field => field?.id && !field.deleted && field.type !== 'heading')
    .map(field => String(field.id)));

/** Keep persisted field identities for response history and recovery labels. */
export const normalizeFormSchemaForDeletion = ({ currentSchema = {}, nextSchema = {} } = {}) => {
    const currentFields = Array.isArray(currentSchema?.fields) ? currentSchema.fields : [];
    const proposedFields = Array.isArray(nextSchema?.fields) ? nextSchema.fields : currentFields;
    const emitted = new Set();
    const fields = proposedFields.map(field => {
        if (!field?.id) return field;
        const id = String(field.id);
        emitted.add(id);
        return field;
    });

    for (const field of currentFields) {
        const id = String(field?.id || '');
        if (!id || emitted.has(id)) continue;
        fields.push({ ...field, deleted: true });
    }

    return {
        ...currentSchema,
        ...nextSchema,
        fields
    };
};

export const removedFormFieldIds = ({ currentSchema = {}, nextSchema = {} } = {}) => {
    const before = activeFormFieldIds(currentSchema);
    const after = activeFormFieldIds(nextSchema);
    return [...before].filter(id => !after.has(id));
};

/**
 * Plan a form schema change across workflow drafts and published releases.
 * This remains pure; the persistence module owns locking and committing the
 * returned plan as one transaction.
 */
export const planFormFieldChange = ({
    currentSchema = {},
    nextSchema = {},
    workflows = [],
    schemaForNode: schemaResolver,
    schemasByNodeKey
} = {}) => {
    const normalizedSchema = normalizeFormSchemaForDeletion({ currentSchema, nextSchema });
    const formId = currentSchema?.id || nextSchema?.id || null;
    const fieldIds = removedFormFieldIds({ currentSchema, nextSchema: normalizedSchema });
    const affectedWorkflows = [];
    const liveBlockers = [];
    const draftBlockers = [];

    for (const workflow of workflows || []) {
        const draftPlan = planWorkflowFormFieldDeletion({
            nodes: workflow?.nodes || [],
            edges: workflow?.edges || [],
            formId,
            fieldIds,
            formSchema: normalizedSchema,
            schemaForNode: schemaResolver,
            schemasByNodeKey
        });
        const publishedPlan = workflow?.published?.nodes
            ? planWorkflowFormFieldDeletion({
                nodes: workflow.published.nodes,
                edges: workflow.published.edges || [],
                formId,
                fieldIds,
                formSchema: normalizedSchema,
                schemaForNode: schemaResolver,
                schemasByNodeKey
            })
            : null;
        const draftAffected = draftPlan.impact.clearedReferences.length > 0 || draftPlan.impact.blockedReferences.length > 0;
        const publishedAffected = publishedPlan && (
            publishedPlan.impact.clearedReferences.length > 0
            || publishedPlan.impact.blockedReferences.length > 0
        );
        if (!draftAffected && !publishedAffected) continue;

        const item = {
            workflowId: workflow.id,
            workflowName: workflow.name || workflow.id,
            isActive: workflow.isActive === true,
            revision: workflow.revision ?? null,
            draft: draftPlan,
            published: publishedPlan
        };
        affectedWorkflows.push(item);

        if (draftPlan.impact.blockedReferences.length > 0) draftBlockers.push(item);
        if (workflow.isActive === true && publishedAffected) liveBlockers.push(item);
    }

    return {
        formId,
        nextSchema: normalizedSchema,
        removedFieldIds: fieldIds,
        affectedWorkflows,
        liveBlockers,
        draftBlockers,
        canApply: liveBlockers.length === 0 && draftBlockers.length === 0,
        requiresReview: affectedWorkflows.length > 0,
        blockers: [
            ...liveBlockers.map(item => ({
                code: 'FORM_FIELD_LIVE_DEPENDENCY',
                workflowId: item.workflowId,
                workflowName: item.workflowName,
                message: `The live workflow '${item.workflowName}' still uses a field being deleted.`
            })),
            ...draftBlockers.map(item => ({
                code: 'FORM_FIELD_REFERENCE_REPAIR_REQUIRED',
                workflowId: item.workflowId,
                workflowName: item.workflowName,
                message: `The workflow '${item.workflowName}' contains a malformed reference that needs manual repair.`
            }))
        ]
    };
};

const collectDanglingSources = ({ nodes, schemaForNode, schemasByNodeKey }) => {
    const knownIds = new Set((nodes || []).map(node => node?.id));
    const titleIndex = uniqueTitleIndex(nodes);
    const missing = new Set();
    let hasDanglingBinding = false;
    const isKnownSource = source => {
        if (knownIds.has(source)) return true;
        return (titleIndex.get(source) || []).length === 1;
    };
    const walk = (value, input, path) => {
        if (isWorkflowExpression(value)) {
            if (value.$expr === 'reference') {
                if (!knownIds.has(value.nodeId)) missing.add(value.nodeId);
                return;
            }
            if (value.$expr === 'template') {
                for (const [index, part] of (value.parts || []).entries()) walk(part?.reference, input, `${path}.parts[${index}]`);
                return;
            }
        }
        if (isReferenceLike(value)) {
            if (!knownIds.has(value.nodeId)) missing.add(value.nodeId);
            return;
        }
        if (isWorkflowBinding(value)) {
            if ((nodes || []).filter(node => node?.subType === 'form-submission').length === 0) hasDanglingBinding = true;
            return;
        }
        if (isWorkflowBindingTemplate(value)) {
            value.$template.forEach((part, index) => walk(part, input, `${path}.parts[${index}]`));
            return;
        }
        if (typeof value === 'string' && legacySyntax(input)) {
            for (const match of value.matchAll(LEGACY_REFERENCE_RE)) {
                const source = String(match[1] || '').trim().split('.')[0];
                if (source && !isKnownSource(source)) missing.add(source);
            }
            return;
        }
        if (Array.isArray(value)) value.forEach((item, index) => walk(item, input, `${path}[${index}]`));
        else if (isObject(value)) Object.entries(value).forEach(([key, item]) => walk(item, input, `${path}.${key}`));
    };

    for (const node of nodes || []) {
        const schema = schemaForNodeFrom({ node, schemaForNode, schemasByNodeKey });
        const inputs = inputByName(schema);
        for (const [fieldName, value] of Object.entries(node?.config || {})) {
            const input = inputs.get(fieldName);
            if (input?.type === 'node-select' && typeof value === 'string' && value && !isKnownSource(value)) missing.add(value);
            walk(value, input, `nodes.${node?.id}.config.${fieldName}`);
        }
    }
    return { missing: [...missing], hasDanglingBinding };
};

const collectMissingFormFields = ({ nodes = [], formSchema = null, schemaForNode, schemasByNodeKey }) => {
    const formId = formSchema?.id;
    if (!formId) return [];
    const activeIds = activeFormFieldIds(formSchema);
    const formTriggerIds = new Set(sourceNodesForForm({ nodes, formId }).map(node => node.id));
    const titleIndex = uniqueTitleIndex(nodes);
    const sourceFor = token => {
        if (nodes.some(node => node?.id === token)) return nodes.find(node => node.id === token);
        const matches = (titleIndex.get(token) || []).map(id => nodes.find(node => node.id === id)).filter(Boolean);
        return matches.length === 1 ? matches[0] : null;
    };
    const missing = new Set();
    const inspectReference = reference => {
        if (!isWorkflowExpression(reference) || reference.$expr !== 'reference') return;
        if (!formTriggerIds.has(reference.nodeId)) return;
        if (!Array.isArray(reference.path) || reference.path[0] !== 'fields' || reference.path.length < 2) return;
        if (!activeIds.has(String(reference.path[1]))) missing.add(String(reference.path[1]));
    };
    const walk = (value, input) => {
        if (isWorkflowExpression(value)) {
            if (value.$expr === 'template') (value.parts || []).forEach(part => inspectReference(part?.reference));
            else inspectReference(value);
            return;
        }
        if (isWorkflowBinding(value)) return;
        if (isWorkflowBindingTemplate(value)) {
            value.$template.forEach(part => walk(part, input));
            return;
        }
        if (typeof value === 'string' && legacySyntax(input)) {
            for (const match of value.matchAll(LEGACY_REFERENCE_RE)) {
                const sourcePath = String(match[1] || '').trim();
                const parts = sourcePath.split('.');
                const sourceNode = sourceFor(parts.shift());
                if (!sourceNode || !formTriggerIds.has(sourceNode.id) || parts[0] !== 'fields' || parts.length < 2) continue;
                if (!activeIds.has(String(parts[1]))) missing.add(String(parts[1]));
            }
            return;
        }
        if (Array.isArray(value)) value.forEach(item => walk(item, input));
        else if (isObject(value)) Object.values(value).forEach(item => walk(item, input));
    };

    for (const node of nodes || []) {
        const schema = schemaForNodeFrom({ node, schemaForNode, schemasByNodeKey });
        const inputs = inputByName(schema);
        for (const [fieldName, value] of Object.entries(node?.config || {})) walk(value, inputs.get(fieldName));
    }
    return [...missing];
};

const mergeRepairPlans = ({ sourcePlan, fieldPlan }) => {
    const impact = {
        ...fieldPlan.impact,
        recovery: true,
        removedNodes: sourcePlan.impact.removedNodes,
        removedEdges: sourcePlan.impact.removedEdges,
        bypassedEdges: sourcePlan.impact.bypassedEdges,
        clearedReferences: [...sourcePlan.impact.clearedReferences, ...fieldPlan.impact.clearedReferences],
        clearedNodeSelections: [...sourcePlan.impact.clearedNodeSelections, ...fieldPlan.impact.clearedNodeSelections],
        blockedReferences: [...sourcePlan.impact.blockedReferences, ...fieldPlan.impact.blockedReferences],
        affectedNodeIds: [...new Set([...sourcePlan.impact.affectedNodeIds, ...fieldPlan.impact.affectedNodeIds])]
    };
    return {
        canApply: sourcePlan.canApply && fieldPlan.canApply,
        requiresReview: sourcePlan.requiresReview || fieldPlan.requiresReview,
        nodes: fieldPlan.nodes,
        edges: fieldPlan.edges,
        impact,
        blockers: [...(sourcePlan.blockers || []), ...(fieldPlan.blockers || [])]
    };
};

/** Build a repair-only plan for drafts that already contain dangling refs. */
export const planDanglingWorkflowReferenceRepair = ({
    nodes = [],
    edges = [],
    schemaForNode,
    schemasByNodeKey,
    allowLegacyReferences = true,
    formSchema = null
} = {}) => {
    const { missing, hasDanglingBinding } = collectDanglingSources({ nodes, schemaForNode, schemasByNodeKey });
    const sourcePlan = planWorkflowNodeDeletion({
        nodes,
        edges,
        nodeIds: missing,
        additionalSourceKeys: missing,
        schemaForNode,
        schemasByNodeKey,
        allowLegacyReferences,
        recovery: true,
        repairDanglingBindings: hasDanglingBinding
    });
    const missingFieldIds = collectMissingFormFields({ nodes, formSchema, schemaForNode, schemasByNodeKey });
    if (missingFieldIds.length === 0) return sourcePlan;
    const fieldPlan = planWorkflowFormFieldDeletion({
        nodes: sourcePlan.nodes,
        edges: sourcePlan.edges,
        formId: formSchema?.id,
        fieldIds: missingFieldIds,
        formSchema,
        schemaForNode,
        schemasByNodeKey,
        allowLegacyReferences,
        recovery: true
    });
    return mergeRepairPlans({ sourcePlan, fieldPlan });
};
