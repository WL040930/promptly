export const CLARIFICATION_MODES = Object.freeze({
    ASK_EVERYTHING: 'ask_everything',
    DECIDE_EVERYTHING: 'decide_everything',
    IMPORTANT_ONLY: 'important_only'
});

export const DEFAULT_CLARIFICATION_MODE = CLARIFICATION_MODES.IMPORTANT_ONLY;

export const isClarificationMode = value => Object.values(CLARIFICATION_MODES).includes(value);

export const normalizeClarificationMode = value => (
    isClarificationMode(value) ? value : DEFAULT_CLARIFICATION_MODE
);
