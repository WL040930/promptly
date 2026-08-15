const TERMINAL_STATUSES = new Set(['awaiting_review', 'needs_input', 'completed', 'failed', 'applied', 'ignored']);

export const assistantWorkStatus = ({ work = null, messageKind = null } = {}) => (
    messageKind === 'clarification' ? 'needs_input' : work?.status || 'drafting'
);

export const assistantWorkStatusLabel = status => ({
    awaiting_review: 'Ready to review',
    needs_input: 'Needs clarification',
    completed: 'Completed',
    failed: 'Couldn’t finish',
    applied: 'Applied',
    ignored: 'Ignored'
}[status] || null);

export const isAssistantWorkTerminal = status => TERMINAL_STATUSES.has(status);
