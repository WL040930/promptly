import { WorkflowTriggerBinding } from '../../models/index.js';
import { CHAT_WORKFLOW_TRIGGER_KIND, chatWorkflowInvocationFromConfig } from './chatWorkflowInvocationContract.js';
import { normalizeWebhookBodySchema } from '../../../shared/webhookPayloadContract.js';
import { webhookContractFingerprint } from './webhookPayloadValidation.js';

const localBindingForNode = node => {
    const config = node?.config || {};
    if (node?.type !== 'trigger') return null;
    if (node.subType === 'form-submission' && config.formId) {
        return { kind: 'form-submission', resourceId: String(config.formId), config };
    }
    if (node.subType === 'webhook' && config.webhookId) {
        return { kind: 'webhook', resourceId: String(config.webhookId), config };
    }
    if (node.subType === 'agent' && config.chatEnabled === true) {
        const invocation = chatWorkflowInvocationFromConfig(config);
        if (!invocation.valid) {
            const error = new Error(invocation.issues.map(item => item.message).join(' '));
            error.code = 'CHAT_WORKFLOW_INVOCATION_INVALID';
            error.issues = invocation.issues;
            throw error;
        }
        return {
            kind: CHAT_WORKFLOW_TRIGGER_KIND,
            resourceId: invocation.invocationKey,
            config: {
                chatEnabled: true,
                invocationKey: invocation.invocationKey,
                description: invocation.description,
                parameterSchema: invocation.parameterSchema
            }
        };
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

const webhookContractConflict = resourceId => {
    const error = new Error(`Webhook '${resourceId}' is already used by a workflow with a different request body contract.`);
    error.code = 'WEBHOOK_PAYLOAD_CONTRACT_CONFLICT';
    error.status = 409;
    error.issues = [{
        code: error.code,
        path: 'config.bodySchema',
        message: 'All live workflows sharing a webhook URL must use the same request body contract.'
    }];
    return error;
};

export const assertWebhookBindingContractsCompatible = async ({ bindings = [], workflowId, transaction } = {}) => {
    const candidates = (bindings || []).filter(binding => binding.kind === 'webhook');
    const resourceIds = [...new Set(candidates.map(binding => String(binding.resourceId)))];
    for (const resourceId of resourceIds) {
        const current = candidates.filter(binding => String(binding.resourceId) === resourceId);
        const existing = await WorkflowTriggerBinding.findAll({
            where: { kind: 'webhook', resourceId, status: 'active' },
            transaction
        });
        const all = [
            ...current,
            ...existing.filter(binding => String(binding.workflowId) !== String(workflowId))
        ];
        const normalized = all.map(binding => normalizeWebhookBodySchema(binding.config?.bodySchema));
        if (normalized.some(contract => contract.issues.length > 0)) {
            throw webhookContractConflict(resourceId);
        }
        const fingerprints = new Set(normalized.map(contract => webhookContractFingerprint(contract.schema)));
        if (fingerprints.size > 1) throw webhookContractConflict(resourceId);
    }
    return true;
};

export const syncLiveTriggerBindings = async ({ workflow, revision, transaction }) => {
    const bindings = extractLiveTriggerBindings({ workflow, revision });
    await assertWebhookBindingContractsCompatible({ bindings, workflowId: workflow.id, transaction });
    await WorkflowTriggerBinding.destroy({ where: { workflowId: workflow.id }, transaction });
    if (bindings.length > 0) await WorkflowTriggerBinding.bulkCreate(bindings, { transaction });
    return bindings;
};

export const deactivateWorkflowTriggerBindings = ({ workflowId, transaction }) => (
    WorkflowTriggerBinding.update(
        { status: 'inactive' },
        { where: { workflowId, status: 'active' }, transaction }
    )
);
