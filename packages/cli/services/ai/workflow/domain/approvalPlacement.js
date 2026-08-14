import { buildWorkflowEditView } from './editCompiler/index.js';

const asText = value => String(value || '').trim();
const nodeKeyFor = node => node?.nodeKey || `${node?.type || ''}:${node?.subType || ''}`;
const choiceValue = value => Array.isArray(value) ? asText(value[0]) : asText(value);

const approvalChangePattern = /\b(?:add|ask|need|request|require|wait)\b[\s\S]{0,80}\b(?:approval|approve)\b|\b(?:approval|approve)\b[\s\S]{0,80}\b(?:before|after)\b/i;
const emailTargetPattern = /\b(?:email|emails|email message|notification|notifications)\b/i;
const externalApproverPattern = /\b(?:manager|supervisor|team\s*lead|teammate|colleague|another\s+person|someone\s+else)\b[\s\S]{0,40}\b(?:approval|approve)\b|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const EXISTING_APPROVAL_OPTIONS = Object.freeze(['Use existing approval', 'Choose a different approval placement']);
const SHARED_APPROVAL_SCOPE = 'One approval before both email routes';
const INDIVIDUAL_APPROVAL_SCOPE = 'Separate approval before each email route';

/**
 * Detect only the small, unambiguous class of approval follow-ups that can be
 * placed safely without asking a model to select graph references.
 */
export const approvalEmailRequest = request => {
    const text = asText(request);
    if (!approvalChangePattern.test(text) || !emailTargetPattern.test(text)) return null;
    return { approver: externalApproverPattern.test(text) ? 'external' : 'owner' };
};

const inboundEdges = (workflow, nodeId) => (workflow?.edges || []).filter(edge => edge?.target === nodeId);

const triggerIds = workflow => (workflow?.nodes || [])
    .filter(node => node?.type === 'trigger')
    .map(node => node.id);

const reachesTargetWithout = ({ workflow, targetId, skippedNodeId }) => {
    const queue = triggerIds(workflow).filter(id => id !== skippedNodeId);
    const visited = new Set(queue);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === targetId) return true;
        for (const edge of workflow?.edges || []) {
            if (edge?.source !== current || edge?.target === skippedNodeId || visited.has(edge?.target)) continue;
            visited.add(edge.target);
            queue.push(edge.target);
        }
    }
    return false;
};

const approvalCoversTargets = ({ workflow, approvalId, targetIds }) => targetIds.length > 0
    && targetIds.every(targetId => !reachesTargetWithout({ workflow, targetId, skippedNodeId: approvalId }));

const ancestorsIncludingSelf = ({ workflow, nodeId }) => {
    const ancestors = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const edge of inboundEdges(workflow, current)) {
            if (!edge?.source || ancestors.has(edge.source)) continue;
            ancestors.add(edge.source);
            queue.push(edge.source);
        }
    }
    return ancestors;
};

const nodeDepth = ({ workflow, nodeId, cache = new Map(), visiting = new Set() }) => {
    if (cache.has(nodeId)) return cache.get(nodeId);
    if (visiting.has(nodeId)) return -Infinity;
    visiting.add(nodeId);
    const incoming = inboundEdges(workflow, nodeId);
    const depth = incoming.length === 0
        ? 0
        : Math.max(...incoming.map(edge => nodeDepth({ workflow, nodeId: edge.source, cache, visiting }))) + 1;
    visiting.delete(nodeId);
    cache.set(nodeId, depth);
    return depth;
};

const sharedInsertionEdge = ({ workflow, targetIds }) => {
    if (targetIds.length === 0) return null;
    const shared = targetIds
        .map(nodeId => ancestorsIncludingSelf({ workflow, nodeId }))
        .reduce((common, ancestors) => new Set([...common].filter(nodeId => ancestors.has(nodeId))));
    const depthCache = new Map();
    const candidates = [...shared]
        .map(nodeId => ({ nodeId, incoming: inboundEdges(workflow, nodeId) }))
        .filter(candidate => candidate.incoming.length === 1)
        .sort((left, right) => nodeDepth({ workflow, nodeId: right.nodeId, cache: depthCache }) - nodeDepth({ workflow, nodeId: left.nodeId, cache: depthCache }));
    return candidates[0]?.incoming[0] || null;
};

const approvalRefAllocator = editView => {
    const refs = new Set(editView.nodes.map(node => node.ref));
    const base = 'approval_before_email';
    return () => {
        if (!refs.has(base)) {
            refs.add(base);
            return base;
        }
        let index = 2;
        while (refs.has(`${base}_${index}`)) index += 1;
        const ref = `${base}_${index}`;
        refs.add(ref);
        return ref;
    };
};

const emailTargets = ({ workflow, selectedTitle }) => (workflow?.nodes || []).filter(node => {
    if (nodeKeyFor(node) !== 'action:email') return false;
    return !selectedTitle || node.title === selectedTitle;
});

const emailTargetChoices = workflow => emailTargets({ workflow }).map(node => node.title || 'Untitled email');

const selectionState = clarificationState => ({
    existingGate: choiceValue(clarificationState?.approvalExistingGate),
    targetEmail: choiceValue(clarificationState?.approvalTargetEmail),
    placementScope: choiceValue(clarificationState?.approvalPlacementScope),
    ownerConfirmation: choiceValue(clarificationState?.ownerApprovalConfirmation)
});

const singleInboundEdge = ({ workflow, nodeId }) => {
    const edges = inboundEdges(workflow, nodeId);
    return edges.length === 1 ? edges[0] : null;
};

const approvalTitle = ({ scope, target }) => {
    if (scope === SHARED_APPROVAL_SCOPE) return 'Review before both email routes';
    return `Review before ${asText(target?.title) || 'this email'}`;
};

const approvalOperation = ({ edge, fromRef, toRef, ref, scope, target }) => {
    const title = approvalTitle({ scope, target });
    return {
        op: 'add_approval_gate',
        connection: {
            from: { nodeRef: fromRef, handle: edge.sourceHandle || null },
            to: { nodeRef: toRef, handle: edge.targetHandle || null }
        },
        approval: {
            ref,
            title,
            config: {
                title,
                instructions: scope === SHARED_APPROVAL_SCOPE
                    ? 'Approve before either email route continues.'
                    : 'Approve before this email route continues.'
            }
        }
    };
};

/**
 * Resolves an approval-before-email request into a no-op, a meaningful
 * placement choice, or compiler-owned operations. The caller never needs to
 * understand graph dominance, branch ancestry, or generated node references.
 * It owns safe topology, but deliberately leaves the approval scope to the
 * user rather than silently assuming one shared gate is wanted.
 */
export const resolveApprovalPlacement = ({ request, workflow = {}, clarificationState = {} } = {}) => {
    const intent = approvalEmailRequest(request);
    if (!intent) return { kind: 'not_applicable' };

    const selected = selectionState(clarificationState);
    if (intent.approver === 'external' && selected.ownerConfirmation !== 'Use my approval') {
        if (selected.ownerConfirmation === 'Cancel') {
            return { kind: 'cancelled', message: 'No changes were made. Promptly approvals can currently be resolved only by the workflow owner.' };
        }
        return {
            kind: 'unsupported_approver',
            message: 'Promptly approvals can currently be resolved only by the workflow owner. Would you like to use your approval instead?',
            inputs: [{
                id: 'ownerApprovalConfirmation', type: 'single_choice', label: 'Approval owner',
                options: ['Use my approval', 'Cancel']
            }]
        };
    }

    const targets = emailTargets({ workflow, selectedTitle: selected.targetEmail });
    if (targets.length === 0) return { kind: 'not_applicable' };
    const targetIds = targets.map(node => node.id);
    const existingApproval = (workflow.nodes || []).find(node => (
        nodeKeyFor(node) === 'logic:approval'
        && approvalCoversTargets({ workflow, approvalId: node.id, targetIds })
    ));

    if (existingApproval && !selected.existingGate) {
        return {
            kind: 'clarification',
            message: `This workflow already waits for your approval before ${targets.length === 1 ? 'this email' : 'both emails'}. Would you like to use that approval or add another one?`,
            inputs: [{
                id: 'approvalExistingGate', type: 'single_choice', label: 'Existing approval',
                options: EXISTING_APPROVAL_OPTIONS
            }]
        };
    }
    if (existingApproval && selected.existingGate === 'Use existing approval') {
        return {
            kind: 'already_satisfied',
            message: `No changes needed. “${existingApproval.title || 'Approval'}” already pauses this workflow before ${targets.length === 1 ? 'the email is sent' : 'either email is sent'}.`
        };
    }

    const sharedEdge = sharedInsertionEdge({ workflow, targetIds });
    const perTargetEdges = targets.map(target => ({ target, edge: singleInboundEdge({ workflow, nodeId: target.id }) }));
    const canPlaceSeparately = targets.length > 1 && perTargetEdges.every(item => item.edge);
    const placementOptions = [
        ...(sharedEdge && targets.length > 1 ? [SHARED_APPROVAL_SCOPE] : []),
        ...(canPlaceSeparately ? [INDIVIDUAL_APPROVAL_SCOPE] : [])
    ];

    // Old conversation receipts stored “Add another approval”. Keep them
    // usable, but ask the new explicit scope question instead of recreating
    // the historic automatic shared-route insertion.
    if (placementOptions.length > 1 && !selected.placementScope) {
        return {
            kind: 'clarification',
            message: 'Where should the new approval apply?',
            inputs: [{
                id: 'approvalPlacementScope', type: 'single_choice', label: 'Approval placement', options: placementOptions
            }]
        };
    }

    const scope = selected.placementScope || (sharedEdge ? SHARED_APPROVAL_SCOPE : null);
    const placements = scope === SHARED_APPROVAL_SCOPE && sharedEdge
        ? [{ edge: sharedEdge, target: null }]
        : scope === INDIVIDUAL_APPROVAL_SCOPE && canPlaceSeparately
            ? perTargetEdges
            : targets.length === 1 && sharedEdge
                ? [{ edge: sharedEdge, target: targets[0] }]
                : null;
    if (!placements) {
        const choices = emailTargetChoices(workflow);
        return {
            kind: 'unsafe_placement',
            message: 'These email routes do not share one safe place for a single approval. Which email should wait for your approval?',
            inputs: choices.length > 1 ? [{ id: 'approvalTargetEmail', type: 'single_choice', label: 'Email', options: choices }] : []
        };
    }
    const editView = buildWorkflowEditView(workflow);
    const refById = new Map(editView.nodes.map((node, index) => [workflow.nodes[index]?.id, node.ref]));
    const nextApprovalRef = approvalRefAllocator(editView);
    const operations = placements.map(({ edge, target }) => {
        const fromRef = refById.get(edge.source);
        const toRef = refById.get(edge.target);
        return fromRef && toRef
            ? approvalOperation({ edge, fromRef, toRef, ref: nextApprovalRef(), scope, target })
            : null;
    }).filter(Boolean);
    if (operations.length !== placements.length) {
        return { kind: 'unsafe_placement', message: 'Promptly could not safely identify the selected email route.' };
    }
    return {
        kind: 'operation',
        targets,
        scope,
        operations
    };
};
