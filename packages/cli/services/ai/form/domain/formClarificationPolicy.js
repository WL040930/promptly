import { CLARIFICATION_MODES, normalizeClarificationMode } from '../../../../../shared/agentContract.js';

export const evaluatePlannerOutcome = ({
    clarificationMode,
    plannerResult,
    delegated = false
} = {}) => {
    if (plannerResult?.type !== 'message') return { action: 'accept' };

    const mode = normalizeClarificationMode(clarificationMode);
    if (delegated || mode === CLARIFICATION_MODES.DECIDE_EVERYTHING) {
        return {
            action: 'resolve_defaults',
            reason: 'defaultable_details'
        };
    }

    return { action: 'expose' };
};
