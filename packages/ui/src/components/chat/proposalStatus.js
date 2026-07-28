const TERMINAL_STATUSES = new Map([
    ['applied', 'Applied'],
    ['rejected', 'Rejected'],
    ['superseded', 'Superseded'],
    ['stale', 'Stale']
]);

export const normalizeProposalStatus = status => String(status || '').trim().toLowerCase();

export const proposalStatusLabel = status => TERMINAL_STATUSES.get(normalizeProposalStatus(status)) || null;

export const shouldShowProposalActions = status => !TERMINAL_STATUSES.has(normalizeProposalStatus(status));

export const isAcceptedProposalStatus = status => normalizeProposalStatus(status) === 'applied';
export const isRejectedProposalStatus = status => normalizeProposalStatus(status) === 'rejected';
export const isStaleProposalStatus = status => ['stale', 'superseded'].includes(normalizeProposalStatus(status));

/** Marks one rejected-by-revision workflow proposal terminal without waiting for a history refetch. */
export const markWorkflowProposalStale = (messages = [], proposalMessageId = null) => messages.map(message => {
    const status = normalizeProposalStatus(message?.proposalStatus || message?.payload?.status);
    const isPendingWorkflowProposal = message?.kind === 'workflow_proposal' && (!status || status === 'pending');
    return isPendingWorkflowProposal && message.id === proposalMessageId
        ? { ...message, proposalStatus: 'stale' }
        : message;
});

/**
 * The workflow assistant owns one active proposal at a time. Reflect that
 * server state immediately, including older pages of chat history, so an
 * obsolete proposal can never remain actionable while the cache refreshes.
 */
export const markSupersededWorkflowProposals = (messages = [], activeProposalMessageId = null) => {
    if (!activeProposalMessageId) return messages;
    return messages.map(message => {
        const status = normalizeProposalStatus(message?.proposalStatus || message?.payload?.status);
        const isPendingWorkflowProposal = message?.kind === 'workflow_proposal' && (!status || status === 'pending');
        return isPendingWorkflowProposal && message.id !== activeProposalMessageId
            ? { ...message, proposalStatus: 'superseded' }
            : message;
    });
};
