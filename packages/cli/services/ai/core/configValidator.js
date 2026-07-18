import env from '../../../config/env.js';
import { AIError } from './aiErrors.js';
import { TASK_POLICIES } from './taskPolicies.js';

const SUPPORTED_PROVIDERS = new Set(['gemini', 'openrouter', 'groq', 'cerebras']);

export const validateAIConfig = ({ config = env, policies = TASK_POLICIES } = {}) => {
    const issues = [];
    const profiles = config.ai?.tiers || {};

    for (const [profileName, profile] of Object.entries(profiles)) {
        if (!SUPPORTED_PROVIDERS.has(profile?.provider)) {
            issues.push({
                code: 'UNKNOWN_PROVIDER',
                path: `ai.tiers.${profileName}.provider`,
                message: `Unsupported AI provider '${profile?.provider || ''}'.`
            });
        }
        if (!profile?.model) {
            issues.push({
                code: 'MODEL_REQUIRED',
                path: `ai.tiers.${profileName}.model`,
                message: `AI profile '${profileName}' must define a model.`
            });
        }
    }

    for (const [task, policy] of Object.entries(policies)) {
        const primaryProfile = profiles[policy.profiles?.[0]];
        if (!primaryProfile) {
            issues.push({
                code: 'TASK_PROFILE_MISSING',
                path: `taskPolicies.${task}`,
                message: `AI task '${task}' references a missing primary profile.`
            });
            continue;
        }

        const hasUsableRoute = (policy.profiles || []).some(profileName => {
            const profile = profiles[profileName];
            return profile?.provider && profile?.model && Boolean(config[profile.provider]?.apiKey);
        });
        if (!hasUsableRoute) {
            issues.push({
                code: 'TASK_NO_CREDENTIALS',
                path: `taskPolicies.${task}`,
                message: `AI task '${task}' has no configured provider credentials.`
            });
        }
    }

    for (const provider of config.ai?.fallbackProviders || []) {
        if (!SUPPORTED_PROVIDERS.has(provider)) {
            issues.push({
                code: 'UNKNOWN_FALLBACK_PROVIDER',
                path: 'ai.fallbackProviders',
                message: `Unsupported fallback provider '${provider}'.`
            });
        }
    }

    return {
        valid: issues.every(issue => issue.code !== 'TASK_NO_CREDENTIALS'),
        issues
    };
};

export const assertAIConfig = options => {
    const result = validateAIConfig(options);
    const errors = result.issues.filter(issue => issue.code !== 'TASK_NO_CREDENTIALS');
    if (errors.length > 0 || !result.valid) {
        throw new AIError('AI configuration is invalid.', {
            code: 'AI_CONFIG_INVALID',
            category: 'configuration',
            retryable: false,
            issues: result.issues
        });
    }
    return result;
};
