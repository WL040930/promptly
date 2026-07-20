const TERMINAL_STATUSES = new Map([
    ['applied', 'Applied'],
    ['accepted', 'Accepted'],
    ['ignored', 'Ignored'],
    ['rejected', 'Rejected'],
    ['superseded', 'Superseded'],
    ['stale', 'Stale']
]);

export const normalizeProposalStatus = status => String(status || '').trim().toLowerCase();

export const proposalStatusLabel = status => TERMINAL_STATUSES.get(normalizeProposalStatus(status)) || null;

export const shouldShowProposalActions = status => !TERMINAL_STATUSES.has(normalizeProposalStatus(status));

export const isAcceptedProposalStatus = status => ['applied', 'accepted'].includes(normalizeProposalStatus(status));
export const isRejectedProposalStatus = status => ['ignored', 'rejected'].includes(normalizeProposalStatus(status));
export const isStaleProposalStatus = status => ['stale', 'superseded'].includes(normalizeProposalStatus(status));
