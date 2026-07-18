import env from '../../../../config/env.js';

export const MAX_PLANNER_ATTEMPTS = 2;
export const MAX_FORM_REPAIR_LOOPS = 5;
export const MAX_VERIFIER_ATTEMPTS = 2;
export const MAX_PROVIDER_ROUTE_ATTEMPTS = 4;

// The budget covers the planner, worker/verifier repair loop, and every
// provider route that may be tried for each model request.
export const MAX_FORM_AI_CALLS = MAX_PROVIDER_ROUTE_ATTEMPTS * (
    MAX_PLANNER_ATTEMPTS
    + (MAX_FORM_REPAIR_LOOPS * (1 + MAX_VERIFIER_ATTEMPTS))
);

export const MAX_INVALID_OUTPUT_PREVIEW_LENGTH = 2000;

export const getCompletionLimit = label => env.aiFormUnlimitedCompletionTokens
    ? null
    : env.aiFormCompletionLimits[label];

export const getFormTask = label => label.startsWith('planner')
    ? 'formPlanner'
    : label.startsWith('worker')
        ? 'formWorker'
        : 'formVerifier';
