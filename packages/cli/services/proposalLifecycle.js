import { AssistantMessage } from '../models/index.js';

/**
 * Move older proposals for the same form out of the acceptance state before a
 * replacement proposal is created. This is intentionally server-side so an
 * old browser tab cannot accept a superseded proposal.
 */
export const supersedePendingFormChatProposals = async ({ threadId, supersededBy = null, transaction, messageModel = AssistantMessage } = {}) => {
    const messages = await messageModel.findAll({
        where: { threadId, sender: 'bot', kind: 'form_proposal', proposalStatus: 'pending' },
        ...(transaction ? { transaction } : {})
    });
    const supersededMessageIds = [];

    for (const message of messages) {
        await message.update({
            payload: { ...message.payload, ...(supersededBy ? { supersededBy } : {}) },
            proposalStatus: 'superseded'
        }, transaction ? { transaction } : undefined);
        supersededMessageIds.push(message.id);
    }

    return supersededMessageIds;
};

/**
 * Chat sessions can contain proposals for multiple forms. Only supersede
 * pending proposals targeting the same form (including null for a new form).
 */
export const supersedePendingChatFormProposals = async ({ threadId, formId, supersededBy = null, transaction, messageModel = AssistantMessage } = {}) => {
    const messages = await messageModel.findAll({
        where: {
            threadId,
            sender: 'bot',
            kind: 'form_proposal',
            proposalStatus: 'pending'
        },
        ...(transaction ? { transaction } : {})
    });
    const supersededMessageIds = [];

    for (const message of messages) {
        const messageFormId = message.payload?.formId || null;
        if (messageFormId !== (formId || null)) continue;
        await message.update({ proposalStatus: 'superseded' }, transaction ? { transaction } : undefined);
        supersededMessageIds.push(message.id);
    }

    return supersededMessageIds;
};
