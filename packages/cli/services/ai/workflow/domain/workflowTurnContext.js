import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';
import { normalizeAssistantText } from '../../../../../shared/assistantText.js';

const DECIDE_PATTERN = /^(?:you\s+decide|decide\s+for\s+me|use\s+(?:sensible\s+)?defaults)[.! ]*$/i;
const CORRECTION_PATTERN = /\b(?:actually|instead|i\s+mean|correction|not\s+that|what\s+i\s+meant)\b/i;

const textOf = value => normalizeAssistantText(value);

export const normalizeWorkflowCommand = (command = {}) => {
    if (command?.type === 'retry_active_work') return { type: 'retry_active_work' };
    if (command?.type === 'decide_for_me') {
        return {
            type: 'decide_for_me',
            clarificationId: command.clarificationId || null,
            ...(command.clarificationMessageId ? { clarificationMessageId: command.clarificationMessageId } : {})
        };
    }
    if (command?.type === 'submit_clarification') {
        return {
            type: 'submit_clarification',
            text: textOf(command.text),
            state: command.state && typeof command.state === 'object' ? command.state : {},
            ...(command.clarificationMessageId ? { clarificationMessageId: command.clarificationMessageId } : {})
        };
    }
    if (command?.type === 'submit_text') return { type: 'submit_text', text: textOf(command.text) };
    return { type: 'submit_text', text: '' };
};

export const resolveWorkflowTurnContext = ({
    command,
    activeWork = null,
    clarification = null,
    pendingProposal = null,
    clarificationMode = null
} = {}) => {
    const delegated = command?.type === 'decide_for_me' || DECIDE_PATTERN.test(textOf(command?.text));
    const clarified = command?.type === 'submit_clarification';
    const retrying = command?.type === 'retry_active_work';
    const rawText = delegated ? '' : textOf(command?.text);
    const priorClarificationState = activeWork?.clarificationState && typeof activeWork.clarificationState === 'object'
        ? activeWork.clarificationState
        : {};
    const submittedClarificationState = command?.state && typeof command.state === 'object'
        ? command.state
        : {};
    const clarificationState = { ...priorClarificationState, ...submittedClarificationState };
    const continuesActiveWork = clarified || delegated || retrying;
    const sourceText = continuesActiveWork ? (activeWork?.sourceText || rawText) : rawText;
    const correction = !clarified && !retrying && CORRECTION_PATTERN.test(rawText);
    return {
        command: delegated
            ? {
                type: 'decide_for_me',
                clarificationId: command.clarificationId || clarification?.id || null,
                state: clarificationState,
                ...(command.clarificationMessageId ? { clarificationMessageId: command.clarificationMessageId } : {})
            }
            : clarified
                ? {
                    type: 'submit_clarification',
                    text: rawText,
                    state: clarificationState,
                    ...(command.clarificationMessageId ? { clarificationMessageId: command.clarificationMessageId } : {})
                }
                : retrying
                    ? { type: 'retry_active_work', state: clarificationState }
                : { type: 'submit_text', text: rawText },
        intent: {
            sourceText: correction ? rawText : sourceText,
            latestText: rawText,
            relationToPending: pendingProposal ? (correction ? 'replace' : 'revise') : 'none',
            authority: delegated ? 'assistant' : 'user',
            clarificationMode: normalizeClarificationMode(clarificationMode)
        },
        pendingProposal: {
            mode: pendingProposal && correction ? 'exclude' : 'include',
            proposal: pendingProposal || null
        }
    };
};
