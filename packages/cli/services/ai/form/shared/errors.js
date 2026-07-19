import { MAX_FORM_AI_CALLS } from './constants.js';

export const createAIOutputError = (message, code, issues = []) => {
    const unsafeProposalMessage = code === 'FORM_AI_UNSAFE_PROPOSAL'
        ? `I could not safely prepare this form because the generated changes did not satisfy the form rules. ${issues.some(issue => issue.path?.includes('.field.label'))
            ? 'One or more fields were missing a user-facing label.'
            : issues.some(issue => issue.path === 'title' || issue.path?.includes('.updates.title'))
                ? 'The form title was missing or invalid.'
                : issues.some(issue => issue.code === 'INVALID_CHOICES' || issue.path?.includes('.choices'))
                    ? 'A choice field did not contain valid options.'
                    : issues.some(issue => issue.code === 'UNKNOWN_FIELD')
                        ? 'A change referred to a field that does not exist.'
                        : 'The proposal contained an invalid field or change.'} I tried to correct it, but the result was still invalid. No changes were applied.`
        : message;
    const error = new Error(unsafeProposalMessage);
    error.code = code;
    error.issues = issues;
    return error;
};

export const createProviderTimeoutError = (label, cause) => createAIOutputError(
    `${label} AI request timed out before the provider returned a response. Please try again.`,
    'FORM_AI_PROVIDER_TIMEOUT',
    [{
        code: 'PROVIDER_TIMEOUT',
        path: label,
        message: cause?.message || 'The AI provider did not respond before the timeout.'
    }]
);

export const createProviderUnavailableError = (label, cause) => createAIOutputError(
    `${label} AI provider is temporarily unavailable. Tried all configured providers. Please try again shortly.`,
    'FORM_AI_PROVIDER_UNAVAILABLE',
    [{
        code: 'PROVIDER_UNAVAILABLE',
        path: label,
        message: cause?.message || 'The AI provider is temporarily unavailable.'
    }]
);

export const createRequestBudget = () => ({ calls: 0, maxCalls: MAX_FORM_AI_CALLS });

export const createUnverifiedVerification = (budget, reason = 'AI_CALL_BUDGET_EXCEEDED', issues = null) => ({
    status: 'unverified',
    issues: Array.isArray(issues) && issues.length > 0 ? issues : [{
        code: 'VERIFICATION_SKIPPED',
        path: 'verifier',
        message: reason === 'AI_CALL_BUDGET_EXCEEDED'
            ? 'The proposal passed local form validation, but semantic AI verification was skipped because the AI request budget was reached.'
            : 'The proposal passed local form validation, but semantic AI verification was skipped because the verifier did not return valid JSON.'
    }],
    fulfilledRequirements: [],
    skippedReason: reason,
    requestCalls: budget?.calls || 0,
    requestLimit: budget?.maxCalls || MAX_FORM_AI_CALLS
});
