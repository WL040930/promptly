import { displayWorkflowNodeLabel, displayWorkflowResourceDetail, displayWorkflowResourceLabel } from './workflowLabels.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrayOrEmpty = value => Array.isArray(value) ? value : [];
const nameFor = value => String(value || '').trim() || 'Workflow';

const nodeChange = (node, type, detail) => ({
    id: `${type}_${node?.id || displayWorkflowNodeLabel(node)}`,
    type,
    label: displayWorkflowNodeLabel(node),
    detail
});

const fieldLabel = path => String(path || '').replace(/^nodes\.[^.]+\.config\./, '').replace(/[._-]+/g, ' ');

const changesFromProposal = proposal => {
    const diff = isObject(proposal?.diff) ? proposal.diff : {};
    const changes = [
        ...(diff.metadata?.name ? [{
            id: 'workflow_name',
            type: 'update',
            label: 'Workflow name',
            detail: `Rename to ${nameFor(diff.metadata.name.to)}`
        }] : []),
        ...arrayOrEmpty(diff.addedNodes).map(node => nodeChange(node, 'add', 'Added step')),
        ...arrayOrEmpty(diff.updatedNodes).map(node => nodeChange(node, 'update', 'Updated step')),
        ...arrayOrEmpty(diff.removedNodes).map(node => nodeChange(node, 'remove', 'Removed step')),
        ...arrayOrEmpty(diff.edges).map((edge, index) => ({
            id: `flow_${edge?.id || index}`,
            type: 'connect',
            label: 'Workflow connection',
            detail: edge?.op === 'disconnect' ? 'Removed connection' : 'Updated connection'
        })),
        ...arrayOrEmpty(diff.deletionEffects).flatMap((effect, effectIndex) => [
            ...arrayOrEmpty(effect.clearedReferences).map((reference, referenceIndex) => ({
                id: `repair_${effectIndex}_${referenceIndex}`,
                type: 'update',
                label: reference.title || reference.nodeId || 'Affected step',
                detail: `Cleared ${fieldLabel(reference.configPath) || 'broken reference'}`
            })),
            ...((effect.bypassedEdges || []).length > 0 ? [{
                id: `bypass_${effectIndex}`,
                type: 'connect',
                label: 'Workflow connection',
                detail: 'Bypassed the removed step'
            }] : [])
        ]),
        ...arrayOrEmpty(proposal?.resourceChanges).map((resource, index) => ({
            id: `resource_${resource?.ref || index}`,
            type: 'provision',
            label: displayWorkflowResourceLabel(resource),
            detail: displayWorkflowResourceDetail(resource) || 'Workspace resource'
        }))
    ];
    return changes;
};

/**
 * Keeps workflow summaries useful for both current proposals and older chat
 * messages that were persisted before the backend started storing presentation.
 */
export const workflowProposalPresentation = proposal => {
    const stored = isObject(proposal?.presentation) ? proposal.presentation : {};
    const nodes = arrayOrEmpty(proposal?.nodes);
    const flow = Array.isArray(stored.flow) && stored.flow.length > 0
        ? stored.flow
        : nodes.slice(0, 5).map(displayWorkflowNodeLabel);
    const derivedChanges = changesFromProposal(proposal);
    const changes = Array.isArray(stored.changes) && stored.changes.length > 0
        ? stored.changes
        : derivedChanges.length > 0
            ? derivedChanges
            : flow.map((label, index) => ({ id: `step_${index}`, type: 'update', label, detail: 'Workflow step' }));
    const readiness = isObject(proposal?.readiness) ? proposal.readiness : {};

    return {
        ...stored,
        title: stored.title || `${nameFor(proposal?.name)} changes`,
        changes,
        flow,
        setupRequirements: Array.isArray(stored.setupRequirements)
            ? stored.setupRequirements
            : readiness.ready === false ? arrayOrEmpty(readiness.issues).map(issue => issue?.message).filter(Boolean) : [],
        setupActions: Array.isArray(stored.setupActions) ? stored.setupActions : arrayOrEmpty(readiness.setupActions),
        assumptions: Array.isArray(stored.assumptions) ? stored.assumptions : [],
        diagnosis: stored.diagnosis || proposal?.diagnosis || null
    };
};
