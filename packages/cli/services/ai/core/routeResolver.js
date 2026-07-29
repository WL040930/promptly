import env from '../../../config/env.js';
import { AIError } from './aiErrors.js';
import { getTaskPolicy } from './taskPolicies.js';

const normalizeProfile = profile => ({
    providerName: String(profile?.provider || '').trim().toLowerCase(),
    model: String(profile?.model || '').trim()
});

const findConfiguredProfileForProvider = (profiles, providerName) => Object.values(profiles)
    .find(profile => profile.provider === providerName);

export const resolveProviderRoutes = (task, {
    registry,
    providerOverride = null,
    mode = null,
    maxAttempts = null,
    profiles = env.ai?.tiers || {},
    fallbackProviders = env.ai?.fallbackProviders || []
} = {}) => {
    const policy = getTaskPolicy(task, { mode });
    const attemptLimit = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : policy.maxAttempts;
    const routes = [];
    const seen = new Set();

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
        if (!registry.hasCredentials(profile.providerName)) continue;

        const key = `${profile.providerName}:${profile.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push({ ...profile, profile: profileName, provider: registry.get(profile.providerName) });
    }

    for (const providerName of fallbackProviders) {
        const configuredProfile = findConfiguredProfileForProvider(profiles, providerName);
        const model = configuredProfile?.model || registry.getDefaultModel(providerName);
        if (!providerName || !model || !registry.hasCredentials(providerName)) continue;

        const key = `${providerName}:${model}`;
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
