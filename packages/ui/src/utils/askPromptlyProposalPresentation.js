const PROPOSAL_KINDS = new Set(['form_proposal', 'workflow_proposal', 'workflow_diff', 'workflow_lifecycle_proposal', 'solution_proposal']);

const isAskPromptlyProposalWork = message => (
    message?.sender === 'bot'
    && message.kind === 'assistant_work'
    && message.payload?.work?.surface === 'ask_promptly'
    && message.payload?.work?.outcomeKind === 'proposal'
);

const isProposal = message => message?.sender === 'bot' && PROPOSAL_KINDS.has(message.kind);

/**
 * Ask Promptly persists its coordinator progress and proposal separately so a
 * request can safely reconnect. Present the adjacent final pair as one review
 * card, matching the specialist assistants without changing stored history.
 */
export const coalesceAskPromptlyProposalMessages = (messages = []) => messages.reduce((presented, message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];

    if (isAskPromptlyProposalWork(message) && isProposal(next)) return presented;
    if (isProposal(message) && isAskPromptlyProposalWork(previous)) {
        return [...presented, {
            ...message,
            payload: {
                ...(message.payload || {}),
                ...(message.payload?.work ? {} : { work: previous.payload.work })
            }
        }];
    }
    return [...presented, message];
}, []);
