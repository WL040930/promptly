import env from '../../../config/env.js';
import { AIError } from './aiErrors.js';
import { getTaskPolicy } from './taskPolicies.js';

const normalizeProfile = profile => ({
    providerName: String(profile?.provider || '').trim().toLowerCase(),
    model: String(profile?.model || '').trim()
});

const findConfiguredProfileForProvider = (profiles, providerName) => Object.values(profiles)
    .find(profile => profile.provider === providerName);

const normalizedExcludedProviders = providers => new Set((Array.isArray(providers) ? providers : [])
    .map(provider => String(provider || '').trim().toLowerCase())
    .filter(Boolean));

const normalizeFallbackRoute = route => ({
    providerName: String(route?.provider || '').trim().toLowerCase(),
    model: String(route?.model || '').trim()
});

const routeKey = ({ providerName, model }) => JSON.stringify([providerName, model]);

const normalizedExcludedRoutes = routes => new Set((Array.isArray(routes) ? routes : [])
    .map(normalizeFallbackRoute)
    .filter(route => route.providerName && route.model)
    .map(routeKey));

export const resolveProviderRoutes = (task, {
    registry,
    providerOverride = null,
    mode = null,
    maxAttempts = null,
    excludeProviders = [],
    excludeRoutes = [],
    profiles = env.ai?.tiers || {},
    fallbackProviders = env.ai?.fallbackProviders || [],
    fallbackRoutes = env.ai?.fallbackRoutes || []
} = {}) => {
    const policy = getTaskPolicy(task, { mode });
    const attemptLimit = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : policy.maxAttempts;
    const routes = [];
    const seen = new Set();
    const excluded = normalizedExcludedProviders(excludeProviders);
    const excludedRoutes = normalizedExcludedRoutes(excludeRoutes);

    if (providerOverride) {
        const primaryProfile = normalizeProfile(profiles[policy.profiles[0]]);
        const route = {
            providerName: 'override',
            model: primaryProfile.model,
            profile: policy.profiles[0],
            provider: providerOverride
        };
        routes.push(route);
        while (routes.length < attemptLimit) routes.push({ ...route, retry: true });
        return routes;
    }

    for (const profileName of policy.profiles) {
        const profile = normalizeProfile(profiles[profileName]);
        if (!profile.providerName || !profile.model) continue;
        if (excluded.has(profile.providerName)) continue;
        if (excludedRoutes.has(routeKey(profile))) continue;
        if (!registry.hasCredentials(profile.providerName)) continue;

        const key = routeKey(profile);
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push({ ...profile, profile: profileName, provider: registry.get(profile.providerName) });
    }

    const configuredFallbackRoutes = Array.isArray(fallbackRoutes) && fallbackRoutes.length > 0
        ? fallbackRoutes.map(normalizeFallbackRoute)
        : fallbackProviders.map(providerName => {
            const configuredProfile = findConfiguredProfileForProvider(profiles, providerName);
            return {
                providerName,
                model: configuredProfile?.model || registry.getDefaultModel(providerName)
            };
        });

    for (const route of configuredFallbackRoutes) {
        const { providerName, model } = route;
        if (excluded.has(providerName)) continue;
        if (excludedRoutes.has(routeKey(route))) continue;
        if (!providerName || !model || !registry.hasCredentials(providerName)) continue;

        const key = routeKey(route);
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push({
            providerName,
            model,
            profile: 'explicit-fallback',
            provider: registry.get(providerName)
        });
    }

    if (routes.length === 0) {
        throw new AIError(`No AI provider route is configured for '${task}'.`, {
            code: 'AI_ROUTE_UNAVAILABLE',
            category: 'configuration',
            retryable: false,
            task
        });
    }

    // A single configured provider previously meant a transient timeout was
    // surfaced immediately. Reuse that route once before giving up; distinct
    // routes still provide normal provider failover.
    if (routes.length === 1) {
        const [route] = routes;
        while (routes.length < attemptLimit) routes.push({ ...route, retry: true });
    }
    return routes.slice(0, attemptLimit);
};
