import { WorkflowTriggerBinding } from '../../models/index.js';

const localBindingForNode = node => {
    const config = node?.config || {};
    if (node?.type !== 'trigger') return null;
    if (node.subType === 'form-submission' && config.formId) {
        return { kind: 'form-submission', resourceId: String(config.formId), config };
    }
    if (node.subType === 'webhook' && config.webhookId) {
        return { kind: 'webhook', resourceId: String(config.webhookId), config };
    }
    return null;
};

export const extractLiveTriggerBindings = ({ workflow, revision }) => (
    (revision?.nodes || []).flatMap(node => {
        const binding = localBindingForNode(node);
        if (!binding) return [];
        return [{
            workflowId: workflow.id,
            revisionId: revision.id,
            nodeId: node.id,
            userId: workflow.userId,
            ...binding,
            status: 'active'
        }];
    })
);

export const syncLiveTriggerBindings = async ({ workflow, revision, transaction }) => {
    await WorkflowTriggerBinding.destroy({ where: { workflowId: workflow.id }, transaction });
    const bindings = extractLiveTriggerBindings({ workflow, revision });
    if (bindings.length > 0) await WorkflowTriggerBinding.bulkCreate(bindings, { transaction });
    return bindings;
};

export const deactivateWorkflowTriggerBindings = ({ workflowId, transaction }) => (
    WorkflowTriggerBinding.update(
        { status: 'inactive' },
        { where: { workflowId, status: 'active' }, transaction }
    )
);
