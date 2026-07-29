export const CLARIFICATION_MODES = Object.freeze({
    DECIDE_EVERYTHING: 'decide_everything',
    IMPORTANT_ONLY: 'important_only'
});

export const DEFAULT_CLARIFICATION_MODE = CLARIFICATION_MODES.IMPORTANT_ONLY;

export const isClarificationMode = value => Object.values(CLARIFICATION_MODES).includes(value);

export const normalizeClarificationMode = value => (
    isClarificationMode(value) ? value : DEFAULT_CLARIFICATION_MODE
);

export const getClarificationModeInstruction = value => {
    switch (normalizeClarificationMode(value)) {
        case CLARIFICATION_MODES.DECIDE_EVERYTHING:
            return 'Choose sensible defaults; ask only if execution or safety is blocked.';
        case CLARIFICATION_MODES.IMPORTANT_ONLY:
        default:
            return 'Ask only high-impact questions; infer low-risk details.';
    }
};
