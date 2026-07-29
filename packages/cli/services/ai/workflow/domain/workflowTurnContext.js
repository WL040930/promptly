import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';

const DECIDE_PATTERN = /^(?:you\s+decide|decide\s+for\s+me|use\s+(?:sensible\s+)?defaults)[.! ]*$/i;
const CORRECTION_PATTERN = /\b(?:actually|instead|i\s+mean|correction|not\s+that|what\s+i\s+meant)\b/i;

const textOf = value => String(value || '').trim();

export const normalizeWorkflowCommand = ({ command, text } = {}) => {
    if (command?.type === 'decide_for_me') {
        return { type: 'decide_for_me', clarificationId: command.clarificationId || null };
    }
    if (command?.type === 'submit_clarification') {
        return {
            type: 'submit_clarification',
            text: textOf(command.text),
            state: command.state && typeof command.state === 'object' ? command.state : {}
        };
    }
    const input = typeof text === 'string' && text.trim()
        ? text.trim()
        : command?.type === 'submit_text'
            ? textOf(command.text)
            : typeof command === 'string'
                ? command.trim()
                : '';
    if (DECIDE_PATTERN.test(input)) return { type: 'decide_for_me', clarificationId: null };
    return { type: 'submit_text', text: input };
};

export const resolveWorkflowTurnContext = ({
    command,
    activeWork = null,
    clarification = null,
    pendingProposal = null,
    clarificationMode = null
} = {}) => {
    const delegated = command?.type === 'decide_for_me';
    const clarified = command?.type === 'submit_clarification';
    const rawText = delegated ? '' : textOf(command?.text);
    const sourceText = activeWork?.sourceText || rawText;
    const correction = CORRECTION_PATTERN.test(rawText);
    return {
        command: delegated
            ? { type: 'decide_for_me', clarificationId: command.clarificationId || clarification?.id || null }
            : clarified
                ? { type: 'submit_clarification', text: rawText, state: command.state || {} }
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
