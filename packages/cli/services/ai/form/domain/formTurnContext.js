import { normalizeClarificationMode } from '../../../../../shared/agentContract.js';

const DELEGATION_PATTERN = /^(?:u|you)\s+decide(?:\s+for\s+me|\s+everything)?[.!\s]*$|^(?:decide\s+for\s+me|choose\s+for\s+me|use\s+(?:sensible\s+)?defaults)[.!\s]*$/i;
const CORRECTION_PATTERN = /\b(?:i\s+mean|actually|instead|correction|not\s+that|what\s+i\s+meant)\b/i;
const HEADING_PATTERN = /\b(?:section\s+heading|section\s+headings?|headings?)\b/i;
const SECTION_PATTERN = /\badd\s+(?:some|a|several|multiple)?\s*sections?\b/i;
const QUESTION_OR_FIELD_PATTERN = /\b(?:questions?|fields?)\b/i;
const MUTATION_PATTERN = /\b(?:add|create|build|change|edit|update|modify|make|remove|delete|move|reorder|place|put|insert|rename|set|include|exclude|mark|require|optional|above|below|before|after)\b/i;
const READ_ONLY_PATTERN = /^(?:why|how|what|which|when|where|who|should)\b|\b(?:tell me|explain|recommend)\b/i;

const textOf = value => String(value || '').trim();

const detectScope = text => {
    const normalized = textOf(text);
    if ((HEADING_PATTERN.test(normalized) || SECTION_PATTERN.test(normalized))
        && !QUESTION_OR_FIELD_PATTERN.test(normalized)) {
        return 'heading_only';
    }
    return 'general_form_change';
};

const isDelegation = text => DELEGATION_PATTERN.test(textOf(text));

export const detectFormMutationIntent = text => {
    const normalized = textOf(text);
    if (!MUTATION_PATTERN.test(normalized)) return false;
    return !READ_ONLY_PATTERN.test(normalized);
};

export const resolveFormTurnContext = ({
    command = { type: 'submit_text', text: '' },
    clarification = null,
    activeWork = null,
    pendingProposal = null,
    clarificationMode = null
} = {}) => {
    const rawText = textOf(command.text);
    const delegated = command.type === 'decide_for_me' || isDelegation(rawText);
    const resolvedCommand = delegated && clarification?.id
        ? { type: 'decide_for_me', clarificationId: clarification.id }
        : command.type === 'decide_for_me'
            ? { type: 'decide_for_me', clarificationId: command.clarificationId || null }
            : { type: 'submit_text', text: rawText };

    const sourceText = CORRECTION_PATTERN.test(rawText)
        ? rawText
        : (activeWork?.sourceText || rawText);
    const scope = activeWork?.scope || detectScope(sourceText);
    const isCorrection = Boolean(activeWork?.relationToPending === 'replace' || CORRECTION_PATTERN.test(sourceText));
    const relationToPending = pendingProposal && isCorrection
        ? 'replace'
        : activeWork?.relationToPending || 'none';

    const shouldExcludePending = Boolean(pendingProposal && (
        relationToPending === 'replace' || scope === 'heading_only'
    ));

    return {
        command: resolvedCommand,
        intent: {
            sourceText,
            scope,
            relationToPending,
            authority: delegated ? 'assistant' : 'user',
            clarificationMode: normalizeClarificationMode(clarificationMode),
            // Use the current command for the mutation gate. An older active
            // work request may be a mutation even when the user is now asking
            // a read-only follow-up question.
            expectsMutation: detectFormMutationIntent(rawText)
                || (command.type === 'decide_for_me' && detectFormMutationIntent(sourceText))
        },
        pendingProposal: {
            mode: shouldExcludePending ? 'exclude' : 'include',
            proposal: pendingProposal || null
        }
    };
};

export const detectFormIntentScope = detectScope;
