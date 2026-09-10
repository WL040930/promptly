import { isRetryableAIError } from './aiErrors.js';

// A billing failure cannot recover by retrying the same provider, but a
// different configured provider may still complete the request.
const fallbackOnlyCategories = new Set(['payment_required']);

const isDistinctRoute = (currentRoute, nextRoute) => (
    String(currentRoute?.providerName || '').trim().toLowerCase() !== String(nextRoute?.providerName || '').trim().toLowerCase()
    || String(currentRoute?.model || '').trim() !== String(nextRoute?.model || '').trim()
);

export const shouldFailover = ({ error, currentRoute = null, nextRoute = null }) => {
    if (!nextRoute) return false;
    if (fallbackOnlyCategories.has(error?.category)) {
        return currentRoute?.providerName !== nextRoute.providerName;
    }
    // A malformed or empty JSON response cannot be recovered by retrying the
    // same route. Let the domain repair loop own same-route correction, but
    // continue to a distinct configured model when one is available.
    if (error?.category === 'invalid_output') return isDistinctRoute(currentRoute, nextRoute);
    return isRetryableAIError(error);
};
