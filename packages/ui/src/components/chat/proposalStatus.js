const TERMINAL_STATUSES = new Map([
    ['applied', 'Applied'],
    ['rejected', 'Rejected'],
    // AgentRun and older chat event paths use "ignored" for the same
    // user decision. Keep it terminal so those proposals cannot remain
    // actionable after the request has been rejected.
    ['ignored', 'Ignored'],
    ['superseded', 'Superseded'],
    ['stale', 'Stale'],
    ['failed', 'Failed']
]);

export const normalizeProposalStatus = status => String(status || '').trim().toLowerCase();

export const proposalStatusLabel = status => TERMINAL_STATUSES.get(normalizeProposalStatus(status)) || null;

export const shouldShowProposalActions = status => !TERMINAL_STATUSES.has(normalizeProposalStatus(status));

export const isAcceptedProposalStatus = status => normalizeProposalStatus(status) === 'applied';
export const isRejectedProposalStatus = status => ['rejected', 'ignored'].includes(normalizeProposalStatus(status));
export const isStaleProposalStatus = status => ['stale', 'superseded'].includes(normalizeProposalStatus(status));

export const proposalStatusTone = status => {
    const normalized = normalizeProposalStatus(status);
    if (normalized === 'applied') return {
        card: 'border-emerald-200',
        header: 'border-emerald-100 bg-emerald-50/70',
        icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        eyebrow: 'text-emerald-700',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        surface: 'border-emerald-200 bg-emerald-50 text-emerald-700'
    };
    if (isRejectedProposalStatus(normalized)) return {
        card: 'border-slate-200',
        header: 'border-slate-200 bg-slate-50/80',
        icon: 'border-slate-200 bg-white text-slate-500',
        eyebrow: 'text-slate-600',
        badge: 'border-slate-200 bg-slate-100 text-slate-600',
        surface: 'border-slate-200 bg-slate-50 text-slate-600'
    };
    if (isStaleProposalStatus(normalized)) return {
        card: 'border-amber-200',
        header: 'border-amber-100 bg-amber-50/70',
        icon: 'border-amber-200 bg-amber-50 text-amber-700',
        eyebrow: 'text-amber-700',
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        surface: 'border-amber-200 bg-amber-50 text-amber-700'
    };
    return null;
};

export const proposalSectionExpansion = status => {
    const terminal = Boolean(proposalStatusLabel(status));
    return { form: !terminal, workflow: !terminal };
};

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
