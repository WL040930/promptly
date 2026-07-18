import { ChatMessage, FormChatMessage } from '../models/index.js';

const isPendingFormProposal = proposal => proposal?.status === 'pending';

/**
 * Move older proposals for the same form out of the acceptance state before a
 * replacement proposal is created. This is intentionally server-side so an
 * old browser tab cannot accept a superseded proposal.
 */
export const supersedePendingFormChatProposals = async ({ formId, supersededBy = null, transaction, messageModel = FormChatMessage } = {}) => {
    const messages = await messageModel.findAll({
        where: { formId, sender: 'bot' },
        ...(transaction ? { transaction } : {})
    });
    const supersededMessageIds = [];

    for (const message of messages) {
        if (!isPendingFormProposal(message.proposal)) continue;
        await message.update({
            proposal: {
                ...message.proposal,
                status: 'superseded',
                ...(supersededBy ? { supersededBy } : {})
            }
        }, transaction ? { transaction } : undefined);
        supersededMessageIds.push(message.id);
    }

    return supersededMessageIds;
};

/**
 * Chat sessions can contain proposals for multiple forms. Only supersede
 * pending proposals targeting the same form (including null for a new form).
 */
export const supersedePendingChatFormProposals = async ({ sessionId, formId, supersededBy = null, transaction, messageModel = ChatMessage } = {}) => {
    const messages = await messageModel.findAll({
        where: {
            sessionId,
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
