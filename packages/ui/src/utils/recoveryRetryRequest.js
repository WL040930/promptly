const nonEmptyText = value => typeof value === 'string' && value.trim() ? value.trim() : '';

export const isAutomaticRecoveryRetry = action => (
    action?.type === 'retry'
    || (action?.type === 'focus_composer' && action?.label === 'Try again')
);

const requestFromHistory = ({ messages = [], failureMessage = null } = {}) => {
    if (!Array.isArray(messages) || messages.length === 0) return '';

    const failureIndex = failureMessage?.id
        ? messages.findIndex(message => message?.id === failureMessage.id)
        : -1;
    const candidates = failureIndex >= 0 ? messages.slice(0, failureIndex) : messages;

    return nonEmptyText([...candidates]
        .reverse()
        .find(message => message?.sender === 'user' && !['tool_call', 'tool_response'].includes(message?.kind))
        ?.text);
};

/**
 * Resolves the text to replay when a recovery card means "Try again".
 * Persisted recovery cards intentionally do not store prompt text; the
 * conversation history remains the source of truth after a refresh.
 */
export const resolveAssistantRetryRequest = ({
    action,
    recovery = {},
    previousRequest = '',
    messages = [],
    failureMessage = null
} = {}) => {
    if (!isAutomaticRecoveryRetry(action)) return '';

    return nonEmptyText(recovery.retryText)
        || nonEmptyText(recovery.retryRequest)
        || nonEmptyText(previousRequest)
        || requestFromHistory({ messages, failureMessage });
};
