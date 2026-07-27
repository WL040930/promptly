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
