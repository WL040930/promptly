const TERMINAL_STATUSES = new Map([
    ['applied', 'Applied'],
    ['accepted', 'Accepted'],
    ['ignored', 'Ignored'],
    ['rejected', 'Rejected'],
    ['superseded', 'Superseded'],
    ['stale', 'Stale']
]);

export const proposalStatusLabel = status => TERMINAL_STATUSES.get(String(status || '').trim().toLowerCase()) || null;

export const shouldShowProposalActions = status => !TERMINAL_STATUSES.has(String(status || '').trim().toLowerCase());
