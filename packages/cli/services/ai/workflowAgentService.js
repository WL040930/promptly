import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { getAIProvider } from './aiService.js';
import env from '../../config/env.js';
import { parseAiJson } from '../../utils/jsonParser.js';
import { validateWorkflow } from '../engine/workflowValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructionDir = path.join(__dirname, 'instruction');
const validActions = new Set(['create_workflow', 'edit_workflow', 'create_form', 'edit_form']);

const readInstruction = async (name) => fs.readFile(path.join(instructionDir, name), 'utf8');

const usage = (metadata) => ({
    promptTokens: metadata?.promptTokenCount || 0,
    completionTokens: metadata?.candidatesTokenCount || 0,
    totalTokens: metadata?.totalTokenCount || 0
});

const parseModelJson = (text) => {
    try {
        return parseAiJson(text);
    } catch (error) {
        throw new Error(`AI returned invalid JSON: ${error.message}`);
    }
};

const providerJson = async (prompt, systemInstruction) => {
    const provider = getAIProvider();
    const response = await provider.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
        systemInstruction,
        responseMimeType: 'application/json',
        model: env.aiModel
    });
    return { value: parseModelJson(response.text), tokenUsage: usage(response.usageMetadata) };
};

export const compactWorkflowSnapshot = (workflow) => {
    if (!workflow) return null;
    return {
        nodes: (workflow.nodes || []).map(node => ({
            id: node.id,
            title: node.title,
            type: node.type,
            subType: node.subType
        })),
        edges: (workflow.edges || []).map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle || null,
            targetHandle: edge.targetHandle || null
        }))
    };
};

export const classifyRequest = async ({ message, snapshot }) => {
    const catalogueEntries = NodeRegistry.getCompactCatalogue()
        .filter(node => node.implementationStatus !== 'disabled');
    const catalogue = catalogueEntries
        .map(node => `${node.nodeKey} | ${node.title} | ${node.description}`)
        .join('\n');
    const current = snapshot?.nodes?.length
        ? `Current workflow nodes:\n${snapshot.nodes.map(n => `${n.id} | ${n.title} | ${n.type} | ${n.subType}`).join('\n')}\nEdges:\n${(snapshot.edges || []).map(e => `${e.id}: ${e.source} -> ${e.target}`).join('\n')}`
        : 'Current workflow: empty';
    const prompt = `Node catalogue:\n${catalogue}\n\n${current}\n\nUser request:\n${message}`;
    const { value, tokenUsage } = await providerJson(prompt, await readInstruction('workflow/classifier.md'));
    if (!validActions.has(value.action)) throw new Error('Classifier returned an unknown action');

    const knownNodeKeys = new Set(catalogueEntries.map(node => node.nodeKey));
    const references = Array.isArray(value.selectedNodeKeys)
        ? value.selectedNodeKeys
        : (value.selectedSubTypes || []);
    const selectedNodeKeys = [...new Set(references.flatMap(reference => {
        if (knownNodeKeys.has(reference)) return [reference];
        const matches = catalogueEntries.filter(node => node.subType === reference);
        return matches.length === 1 ? [matches[0].nodeKey] : [];
    }))];
    if (value.action === 'create_workflow' && selectedNodeKeys.length === 0) {
        selectedNodeKeys.push(...knownNodeKeys);
    }

    return {
        action: value.action,
        selectedNodeKeys,
        selectedSubTypes: selectedNodeKeys.map(nodeKey => NodeRegistry.getDefinitionByNodeKey(nodeKey)?.metadata.subType).filter(Boolean),
        workflowName: value.action === 'create_workflow' && typeof value.workflowName === 'string'
            ? value.workflowName.trim().slice(0, 255) || 'New Workflow'
            : null,
        needsForm: value.action === 'create_workflow' && value.needsForm === true,
        affectedNodeIds: Array.isArray(value.affectedNodeIds) ? value.affectedNodeIds : [],
        intent: ['replace', 'append', 'unknown'].includes(value.intent) ? value.intent : 'unknown',
        tokenUsage
    };
};

const schemaBlock = (spec) => JSON.stringify({
    nodeKey: spec.nodeKey,
    subType: spec.subType,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    instruction: spec.instruction,
    schema: spec.schema
});

const normalizeConfig = (config, schema) => {
    const inputNames = new Set((schema?.inputs || []).map(input => input.name));
    const next = {};
    for (const [name, value] of Object.entries(config || {})) {
        if (inputNames.has(name)) next[name] = value;
    }
    return next;
};

const nodeUiFields = (spec) => ({
    schema: spec.schema,
    icon: spec.ui?.icon,
    bgColor: spec.ui?.bgColor || spec.ui?.iconBg,
    color: spec.ui?.color || spec.ui?.iconColor,
    iconColor: spec.ui?.iconColor || spec.ui?.color
});

const assertWorkflowDefinition = (nodes, edges, isActive = false) => {
    const validation = validateWorkflow({ nodes, edges, isActive, registry: NodeRegistry });
    if (!validation.valid) {
        throw new Error(`AI workflow proposal failed validation: ${validation.issues.map(item => item.message).join('; ')}`);
    }
};

export const assembleWorkflow = async ({ message, specs, workflowName, formId }) => {
    const prompt = `Node specifications:\n${specs.map(schemaBlock).join('\n---\n')}\n\n${formId ? `Use this approved form ID for the form trigger: ${formId}\n\n` : ''}Workflow request:\n${message}`;
    const { value, tokenUsage } = await providerJson(prompt, await readInstruction('workflow/assembler.md'));
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('Assembler returned an invalid workflow');

    const specsByNodeKey = new Map(specs.map(spec => [spec.nodeKey || `${spec.type}:${spec.subType}`, spec]));
    const usedIds = new Set();
    const nodes = value.nodes.map((node, index) => {
        const requestedKey = node.nodeKey || (node.type && node.subType ? `${node.type}:${node.subType}` : node.subType);
        const spec = specsByNodeKey.get(requestedKey);
        if (!spec) return null;
        let id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : `node_${index + 1}`;
        while (usedIds.has(id)) id = `node_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        usedIds.add(id);
        const config = normalizeConfig(node.config, spec.schema);
        if (formId && spec.subType === 'form-submission') config.formId = formId;
        return {
            id,
            type: spec.type,
            subType: spec.subType,
            nodeKey: spec.nodeKey || `${spec.type}:${spec.subType}`,
            title: typeof node.title === 'string' && node.title.trim() ? node.title.trim() : spec.title,
            description: spec.description,
            config,
            position: {
                x: 100 + index * 350,
                y: Number.isFinite(node.position?.y) ? node.position.y : 150
            },
            ...nodeUiFields(spec)
        };
    }).filter(Boolean);

    const ids = new Set(nodes.map(node => node.id));
    const usedEdgeIds = new Set();
    const edges = value.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map((edge, index) => {
        let id = typeof edge.id === 'string' && edge.id.trim() ? edge.id : `edge_${index + 1}`;
        while (usedEdgeIds.has(id)) id = newId('edge');
        usedEdgeIds.add(id);
        return {
        id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || null,
        targetHandle: edge.targetHandle || null,
        type: edge.type || 'deletable'
        };
    });
    if (!nodes.length) throw new Error('Assembler returned no valid nodes');
    if (nodes[0].type !== 'trigger') throw new Error('Assembler must place a trigger first');
    const indegree = new Map(nodes.map(node => [node.id, 0]));
    const adjacency = new Map(nodes.map(node => [node.id, []]));
    edges.forEach(edge => {
        adjacency.get(edge.source).push(edge.target);
        indegree.set(edge.target, indegree.get(edge.target) + 1);
    });
    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
    let visited = 0;
    while (queue.length) {
        const id = queue.shift();
        visited += 1;
        adjacency.get(id).forEach(target => {
            indegree.set(target, indegree.get(target) - 1);
            if (indegree.get(target) === 0) queue.push(target);
        });
    }
    if (visited !== nodes.length) throw new Error('Assembler returned a cyclic workflow');
    assertWorkflowDefinition(nodes, edges);

    return { name: workflowName || 'New Workflow', nodes, edges, tokenUsage };
};

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const resolveId = (id, placeholders) => placeholders.get(id) || id;

export const applyWorkflowPatches = ({ currentNodes = [], currentEdges = [], patches = [], specs = [] }) => {
    const nodes = JSON.parse(JSON.stringify(currentNodes));
    const edges = JSON.parse(JSON.stringify(currentEdges));
    const placeholders = new Map();
    const specsByNodeKey = new Map(specs.map(spec => [spec.nodeKey || `${spec.type}:${spec.subType}`, spec]));
    const specsByUniqueSubType = new Map();
    for (const spec of specs) {
        if (specsByUniqueSubType.has(spec.subType)) specsByUniqueSubType.set(spec.subType, null);
        else specsByUniqueSubType.set(spec.subType, spec);
    }
    const resolveSpec = (patch) => {
        if (patch.nodeKey && specsByNodeKey.has(patch.nodeKey)) return specsByNodeKey.get(patch.nodeKey);
        return specsByUniqueSubType.get(patch.subType) || null;
    };

    for (const patch of patches) {
        if (!patch || typeof patch.op !== 'string') continue;
        if (patch.op === 'add_node') {
            const spec = resolveSpec(patch);
            if (!spec) continue;
            const id = newId('node');
            if (patch.id) placeholders.set(patch.id, id);
            const after = nodes.find(node => node.id === patch.afterNodeId);
            const x = after ? (after.position?.x || 100) + 350 : Math.max(0, ...nodes.map(node => node.position?.x || 0)) + 350;
            if (after) {
                nodes.forEach(node => {
                    if ((node.position?.x || 0) >= x) node.position = { ...(node.position || {}), x: (node.position?.x || 0) + 350 };
                });
            }
            nodes.push({
                id,
                type: spec.type,
                subType: spec.subType,
                nodeKey: spec.nodeKey || `${spec.type}:${spec.subType}`,
                title: patch.title || spec.title,
                description: patch.description || spec.description,
                config: normalizeConfig(patch.config, spec.schema),
                position: { x, y: after?.position?.y || 150 },
                ...nodeUiFields(spec)
            });
        } else if (patch.op === 'remove_node') {
            const before = nodes.length;
            const id = resolveId(patch.id, placeholders);
            nodes.splice(0, nodes.length, ...nodes.filter(node => node.id !== id));
            if (nodes.length !== before) edges.splice(0, edges.length, ...edges.filter(edge => edge.source !== id && edge.target !== id));
        } else if (patch.op === 'update_node') {
            const id = resolveId(patch.id, placeholders);
            const index = nodes.findIndex(node => node.id === id);
            if (index === -1) continue;
            const current = nodes[index];
            const updates = patch.updates || {};
            nodes[index] = {
                ...current,
                ...Object.fromEntries(Object.entries(updates).filter(([key]) => key !== 'schema' && key !== 'type' && key !== 'subType')),
                config: updates.config ? { ...(current.config || {}), ...updates.config } : current.config
            };
        } else if (patch.op === 'add_edge') {
            const source = resolveId(patch.source, placeholders);
            const target = resolveId(patch.target, placeholders);
            if (!nodes.some(node => node.id === source) || !nodes.some(node => node.id === target)) continue;
            const id = patch.id && !edges.some(edge => edge.id === patch.id) ? patch.id : newId('edge');
            if (!edges.some(edge => edge.source === source && edge.target === target && (edge.sourceHandle || null) === (patch.sourceHandle || null))) {
                edges.push({ id, source, target, sourceHandle: patch.sourceHandle || null, targetHandle: patch.targetHandle || null, type: patch.type || 'deletable' });
            }
        } else if (patch.op === 'remove_edge') {
            const id = resolveId(patch.id, placeholders);
            edges.splice(0, edges.length, ...edges.filter(edge => edge.id !== id));
        }
    }
    return { nodes, edges, placeholders };
};

export const patchWorkflow = async ({ message, currentWorkflow, classification, specs }) => {
    const prompt = `Current workflow:\n${JSON.stringify({ nodes: compactWorkflowSnapshot(currentWorkflow).nodes, edges: compactWorkflowSnapshot(currentWorkflow).edges })}\n\nNode specifications:\n${specs.map(schemaBlock).join('\n---\n')}\n\nEdit request:\n${message}`;
    const { value, tokenUsage } = await providerJson(prompt, await readInstruction('workflow/patcher.md'));
    if (!Array.isArray(value.patches)) throw new Error('Patcher returned an invalid patch list');
    const applied = applyWorkflowPatches({ currentNodes: currentWorkflow.nodes || [], currentEdges: currentWorkflow.edges || [], patches: value.patches, specs });
    assertWorkflowDefinition(applied.nodes, applied.edges, Boolean(currentWorkflow.isActive));
    const originalNodeIds = new Set((currentWorkflow.nodes || []).map(node => node.id));
    const nextNodeIds = new Set(applied.nodes.map(node => node.id));
    const diff = {
        addedNodes: applied.nodes.filter(node => !originalNodeIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        removedNodes: (currentWorkflow.nodes || []).filter(node => !nextNodeIds.has(node.id)).map(node => ({ id: node.id, title: node.title, subType: node.subType })),
        updatedNodes: (currentWorkflow.nodes || []).filter(node => {
            const next = applied.nodes.find(candidate => candidate.id === node.id);
            return next && JSON.stringify(next) !== JSON.stringify(node);
        }).map(node => ({ id: node.id, title: applied.nodes.find(candidate => candidate.id === node.id)?.title || node.title })),
        edges: value.patches.filter(patch => patch.op === 'add_edge' || patch.op === 'remove_edge')
    };
    return { ...applied, patches: value.patches, diff, tokenUsage, classification };
};

export const tokenTotal = (...usages) => usages.reduce((total, current) => total + (current?.totalTokens || 0), 0);
