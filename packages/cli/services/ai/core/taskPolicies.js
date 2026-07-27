import env from '../../../config/env.js';
import { AI_TASKS } from './aiTasks.js';
import { AIError } from './aiErrors.js';

const FORM_LIMITS = Object.freeze({
    [AI_TASKS.FORM_PLAN]: 1800,
    [AI_TASKS.FORM_PLAN_REPAIR]: 2200,
    [AI_TASKS.FORM_BUILD]: 3072,
    [AI_TASKS.FORM_BUILD_REPAIR]: 3072,
    [AI_TASKS.FORM_VERIFY]: 768,
    [AI_TASKS.FORM_VERIFY_REPAIR]: 1024
});

const WORKFLOW_LIMITS = Object.freeze({
    [AI_TASKS.WORKFLOW_PLAN]: 1800,
    [AI_TASKS.WORKFLOW_PLAN_REPAIR]: 2200,
    [AI_TASKS.WORKFLOW_BUILD]: 3072,
    [AI_TASKS.WORKFLOW_BUILD_REPAIR]: 3072,
    [AI_TASKS.WORKFLOW_VERIFY]: 768,
    [AI_TASKS.WORKFLOW_VERIFY_REPAIR]: 1024
});

const TASK_POLICIES = Object.freeze({
    [AI_TASKS.CHAT_RESPOND]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'text',
        maxCompletionTokens: 700,
        maxAttempts: 3,
        allowTools: true
    },
    [AI_TASKS.AGENT_INTENT]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: 700,
        maxAttempts: 3,
        allowTools: false
    },
    [AI_TASKS.AGENT_PLAN]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: 1000,
        maxAttempts: 3,
        allowTools: false
    },
    [AI_TASKS.FORM_PLAN]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_PLAN],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.FORM_PLAN_REPAIR]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_PLAN_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.FORM_BUILD]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_BUILD],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.FORM_BUILD_REPAIR]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_BUILD_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.FORM_VERIFY]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_VERIFY],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.FORM_VERIFY_REPAIR]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: FORM_LIMITS[AI_TASKS.FORM_VERIFY_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_PLAN]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_PLAN],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_PLAN_REPAIR]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_PLAN_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_BUILD]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_BUILD],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_BUILD_REPAIR]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_BUILD_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_VERIFY]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_VERIFY],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.WORKFLOW_VERIFY_REPAIR]: {
        profiles: ['fast', 'quality', 'default'],
        responseFormat: 'json',
        maxCompletionTokens: WORKFLOW_LIMITS[AI_TASKS.WORKFLOW_VERIFY_REPAIR],
        maxAttempts: 4,
        allowTools: false
    },
    [AI_TASKS.NODE_TEXT]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'text',
        maxCompletionTokens: 1000,
        maxAttempts: 3,
        allowTools: false
    },
    [AI_TASKS.NODE_JSON]: {
        profiles: ['quality', 'default', 'fast'],
        responseFormat: 'json',
        maxCompletionTokens: 1000,
        maxAttempts: 3,
        allowTools: false
    }
});

const profilesForMode = (profiles, mode) => {
    if (mode === 'fast') return ['fast', 'default', 'quality'];
    if (mode === 'best') return ['quality', 'default', 'fast'];
    return profiles;
};

/**
 * Resolves the completion budget without changing the task's retry or routing
 * policy. `null` deliberately means "do not send a provider-side cap".
 */
export const resolveMaxCompletionTokens = (task, policy, config = env) => {
    if (config.aiUnlimitedCompletionTokens) return null;
    if (config.aiMaxCompletionTokens) return config.aiMaxCompletionTokens;
    if (config.aiFormUnlimitedCompletionTokens && task.startsWith('form.')) return null;
    if (config.aiWorkflowUnlimitedCompletionTokens && task.startsWith('workflow.')) return null;
    return policy.maxCompletionTokens;
};

export const getTaskPolicy = (task, { mode = null } = {}) => {
    const policy = TASK_POLICIES[task];
    if (!policy) {
        throw new AIError(`Unknown AI task '${task}'.`, {
            code: 'AI_CONFIG_INVALID',
            category: 'configuration',
            retryable: false,
            task
        });
    }

    return {
        ...policy,
        profiles: profilesForMode(policy.profiles, mode),
        maxCompletionTokens: resolveMaxCompletionTokens(task, policy)
    };
};

export { TASK_POLICIES };
