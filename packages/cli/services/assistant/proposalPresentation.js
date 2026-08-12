const sentence = value => String(value || '').trim().replace(/\s+/g, ' ');
const titleCase = value => sentence(value) || 'Untitled';

const fieldTypeLabel = type => ({
    text: 'short answer', textarea: 'long answer', email: 'email', number: 'number',
    radio: 'single choice', checkbox: 'multiple choice', select: 'dropdown', rating: 'rating', heading: 'section heading'
}[type] || type || 'field');

const changeWord = count => count === 1 ? 'change' : 'changes';

export const buildFormPresentation = ({ form = {}, proposal = {} } = {}) => {
    const patches = Array.isArray(proposal.patches) ? proposal.patches : [];
    const changes = patches.map((patch, index) => {
        const id = patch.patchId || `patch_${index + 1}`;
        if (patch.op === 'add') return { id, type: 'add', label: titleCase(patch.field?.label), detail: fieldTypeLabel(patch.field?.type) };
        if (patch.op === 'remove') return { id, type: 'remove', label: titleCase(patch.label || patch.id), detail: 'Removed question' };
        if (patch.op === 'update') return { id, type: 'update', label: titleCase(patch.label || patch.id), detail: 'Updated question' };
        if (patch.op === 'update_meta') return { id, type: 'update', label: 'Form details', detail: 'Updated title or description' };
        if (patch.op === 'update_settings') return { id, type: 'update', label: 'Form settings', detail: `${Object.keys(patch.updates || {}).length} setting${Object.keys(patch.updates || {}).length === 1 ? '' : 's'} updated` };
        if (patch.op === 'update_memory') return { id, type: 'memory', label: 'Remembered rules', detail: patch.updates?.memory?.summary || 'Cleared remembered rules' };
        return { id, type: 'update', label: 'Form change', detail: 'Updated form' };
    });
    const adds = changes.filter(change => change.type === 'add').length;
    const removes = changes.filter(change => change.type === 'remove').length;
    const updates = changes.filter(change => change.type === 'update').length;
    const outcome = [
        adds ? `Adds ${adds} ${adds === 1 ? 'item' : 'items'}` : null,
        updates ? `updates ${updates}` : null,
        removes ? `removes ${removes}` : null
    ].filter(Boolean).join(', ') || `Makes ${changes.length} ${changeWord(changes.length)}`;
    const name = titleCase(proposal.schema?.title || form.title || 'Form');
    return {
        title: `${name} changes`,
        outcome: `${outcome} in ${name}.`,
        changes,
        assumptions: [],
        setupRequirements: []
    };
};

export const buildWorkflowPresentation = ({ workflow = {}, proposal = {} } = {}) => {
    const diff = proposal.diff || {};
    const changes = [
        ...(diff.metadata?.name ? [{
            id: 'workflow_name',
            type: 'update',
            label: 'Workflow name',
            detail: `Rename to ${titleCase(diff.metadata.name.to)}`
        }] : []),
        ...(diff.addedNodes || []).map(node => ({ id: `add_${node.id}`, type: 'add', label: titleCase(node.title || node.subType), detail: 'Added step' })),
        ...(diff.updatedNodes || []).map(node => ({ id: `update_${node.id}`, type: 'update', label: titleCase(node.title || node.subType), detail: 'Updated step' })),
        ...(diff.removedNodes || []).map(node => ({ id: `remove_${node.id}`, type: 'remove', label: titleCase(node.title || node.subType), detail: 'Removed step' })),
        ...(diff.edges || []).map((edge, index) => ({ id: `flow_${index}`, type: 'connect', label: 'Workflow connection', detail: edge.op === 'disconnect' ? 'Removed connection' : 'Updated connection' })),
        ...(proposal.resourceChanges || []).filter(change => change?.type === 'create_google_spreadsheet').map(change => ({
            id: `resource_${change.ref}`,
            type: 'add',
            label: titleCase(change.title),
            detail: `Create Google Sheet · ${change.sheetTitle || 'Responses'} tab`
        }))
    ];
    const name = titleCase(workflow.name || 'Workflow');
    const added = changes.filter(change => change.type === 'add').length;
    const updated = changes.filter(change => change.type === 'update').length;
    const removed = changes.filter(change => change.type === 'remove').length;
    const changeSummary = [
        added ? `adds ${added} ${added === 1 ? 'step' : 'steps'}` : null,
        updated ? `updates ${updated}` : null,
        removed ? `removes ${removed}` : null
    ].filter(Boolean).join(', ') || `updates ${changes.length} ${changeWord(changes.length)}`;
    const flow = (proposal.nodes || []).slice(0, 5).map(node => titleCase(node.title || node.subType));
    return {
        title: `${name} changes`,
        outcome: `${changeSummary[0]?.toUpperCase() || ''}${changeSummary.slice(1)} in ${name}.`,
        changes,
        assumptions: [],
        setupRequirements: proposal.readiness?.ready === false ? (proposal.readiness.issues || []).map(issue => issue.message).filter(Boolean) : [],
        setupActions: proposal.readiness?.setupActions || [],
        flow,
        diagnosis: proposal.diagnosis || null
    };
};
