const FORM_PROPOSAL_KINDS = new Set(['form_proposal']);
const WORKFLOW_PROPOSAL_KINDS = new Set(['workflow_proposal', 'workflow_diff']);

/**
 * Pick the visual treatment from the message's durable meaning, not from
 * auxiliary work metadata. Completed replies, clarifications, and proposals
 * all retain `payload.work` for audit/history, but that must not turn them
 * into a draft-progress card.
 */
export const messagePresentation = (message = {}) => {
    const kind = message.kind || (message.proposal ? 'form_proposal' : 'text');
    if (message.sender === 'user') return 'message';
    if (message.isError || kind === 'error') return 'error';
    if (kind === 'assistant_work') {
        if (message.payload?.work?.surface === 'ask_promptly') return 'proposal_work';
        return message.payload?.work?.outcomeKind === 'proposal' ? 'proposal_work' : 'work';
    }
    if (kind === 'clarification') return 'clarification';
    if (FORM_PROPOSAL_KINDS.has(kind)) return 'form_proposal';
    if (WORKFLOW_PROPOSAL_KINDS.has(kind)) return 'workflow_proposal';
    return 'message';
};
