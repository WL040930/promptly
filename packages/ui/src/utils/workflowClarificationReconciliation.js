import { resolveClarificationSubmission } from '../../../shared/clarificationContract.js';

const clarificationPayload = message => message?.payload || {};

const isPendingClarification = message => {
    if (message?.kind !== 'clarification') return false;
    const payload = clarificationPayload(message);
    return !payload.resolution && !payload.selectedState;
};

const resolvedClarificationMessage = (message, command, now) => {
    const payload = clarificationPayload(message);
    if (command.type === 'decide_for_me') {
        return {
            ...message,
            payload: {
                ...payload,
                resolution: {
                    type: 'defaulted',
                    answeredAt: now().toISOString()
                }
            }
        };
    }

    const evaluation = resolveClarificationSubmission({
        inputs: payload.inputs || payload.options || [],
        state: command.state || {}
    });
    if (!evaluation.complete) return message;

    return {
        ...message,
        payload: {
            ...payload,
            selectedState: {
                ...(payload.selectedState || {}),
                ...evaluation.state
            },
            resolution: {
                type: 'answered',
                answeredAt: now().toISOString(),
                answers: evaluation.answers
            }
        }
    };
};

export const reconcileWorkflowClarificationAnswer = (messages = [], command = {}, { now = () => new Date() } = {}) => {
    if (!['submit_clarification', 'decide_for_me'].includes(command.type)) return messages;

    const sourceMessages = Array.isArray(messages) ? messages : [];
    const targetId = command.clarificationMessageId || null;
    const fallbackIndex = targetId
        ? -1
        : sourceMessages.reduce((index, message, currentIndex) => isPendingClarification(message) ? currentIndex : index, -1);

    return sourceMessages.map((message, index) => {
        const isTarget = targetId ? message.id === targetId : index === fallbackIndex;
        return isTarget ? resolvedClarificationMessage(message, command, now) : message;
    });
};
