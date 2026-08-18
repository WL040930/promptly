/**
 * Merge a completed Ask Promptly turn into the visible transcript. Event-based
 * clarifications do not create a user bubble, so the server returns the
 * resolved clarification separately and it must replace the pending card in
 * place before the new proposal is appended.
 */
export const reconcileAskPromptlyTurnMessages = (messages = [], response = {}) => {
    const supersededMessageIds = new Set(response?.reply?.payload?.supersededMessageIds || []);
    const clarificationId = response?.clarification?.id || null;
    let clarificationReplaced = false;
    const nextMessages = (Array.isArray(messages) ? messages : []).map(message => {
        const nextMessage = supersededMessageIds.has(message.id)
            ? { ...message, proposalStatus: 'superseded' }
            : message;
        if (clarificationId && message.id === clarificationId) {
            clarificationReplaced = true;
            return response.clarification;
        }
        return nextMessage;
    });

    if (response?.clarification && !clarificationReplaced) nextMessages.push(response.clarification);
    if (response?.reply) nextMessages.push(response.reply);
    return nextMessages;
};
