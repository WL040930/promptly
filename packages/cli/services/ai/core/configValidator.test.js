import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAIConfig } from './configValidator.js';
import { AI_TASKS } from './aiTasks.js';

const policies = {
    [AI_TASKS.CHAT_RESPOND]: { profiles: ['fast', 'default'] }
};

test('AI config validation accepts a complete profile set with one credential', () => {
    const result = validateAIConfig({
        config: {
            ai: {
                tiers: {
                    fast: { provider: 'gemini', model: 'fast-model' },
                    default: { provider: 'gemini', model: 'default-model' }
                },
                fallbackProviders: []
            },
            gemini: { apiKey: 'test-key' }
        },
        policies
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.issues, []);
});

test('AI config validation reports unsupported providers and missing credentials', () => {
    const result = validateAIConfig({
        config: {
            ai: {
                tiers: {
                    fast: { provider: 'unknown-provider', model: 'fast-model' }
                },
                fallbackProviders: ['also-unknown']
            }
        },
        policies
    });

    assert.equal(result.valid, false);
    assert.deepEqual(
        result.issues.map(issue => issue.code),
        ['UNKNOWN_PROVIDER', 'TASK_NO_CREDENTIALS', 'UNKNOWN_FALLBACK_PROVIDER']
    );
});
