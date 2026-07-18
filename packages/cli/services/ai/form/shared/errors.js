import env from '../../../../config/env.js';
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

export const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        reject(createAIOutputError(
            `${label} AI request timed out. Please try again.`,
            'FORM_AI_PROVIDER_TIMEOUT',
            [{ code: 'PROVIDER_TIMEOUT', path: label, message: 'The AI provider did not respond before the timeout.' }]
        ));
    }, timeoutMs);

    Promise.resolve(promise).then(
        value => {
            clearTimeout(timer);
            resolve(value);
        },
        error => {
            clearTimeout(timer);
            reject(error);
        }
    );
});

export const getRetryAfterSeconds = error => {
    const headerValue = error?.headers?.['retry-after'] || error?.headers?.get?.('retry-after');
    const retryAfter = Number(headerValue);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null;
};

export const getFinishReason = response => response?.finishReason || response?.candidates?.[0]?.finishReason || null;

export const isLengthFinishReason = reason => ['LENGTH', 'MAX_TOKENS', 'MAX_OUTPUT_TOKENS']
    .includes(String(reason || '').toUpperCase());

export const isProviderTimeoutError = error => {
    const status = Number(error?.status ?? error?.statusCode);
    return error?.code === 'FORM_AI_PROVIDER_TIMEOUT'
        || [408, 504].includes(status)
        || error?.code === 'DEADLINE_EXCEEDED'
        || /deadline expired|deadline_exceeded|timed out|timeout/i.test(error?.message || '');
};

export const isProviderUnavailableError = error => {
    const status = Number(error?.status ?? error?.statusCode);
    return [500, 502, 503].includes(status)
        || error?.code === 'UNAVAILABLE'
        || /temporarily unavailable|high demand|service unavailable/i.test(error?.message || '');
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

export const reserveRequestCall = (budget, label) => {
    if (!budget) return;
    if (budget.calls >= budget.maxCalls) {
        throw createAIOutputError(
            'I could not complete the form safely within the AI request budget. No changes were applied. Please try again with a smaller request.',
            'FORM_AI_BUDGET_EXCEEDED',
            [{ code: 'CALL_BUDGET_EXCEEDED', path: label, message: `Maximum ${budget.maxCalls} AI calls reached.` }]
        );
    }
    budget.calls += 1;
};

export const createUnverifiedVerification = (budget, reason = 'AI_CALL_BUDGET_EXCEEDED') => ({
    status: 'unverified',
    issues: [{
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
