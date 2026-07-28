import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIConfig, DEFAULT_AI_MODELS } from '../../../config/aiConfig.js';
import { OpenRouterProvider } from '../providers/openRouterProvider.js';
import { NvidiaProvider } from '../providers/nvidiaProvider.js';
import { createProviderRegistry } from './providerRegistry.js';
import { resolveMaxCompletionTokens, TASK_POLICIES } from './taskPolicies.js';
import { AI_TASKS } from './aiTasks.js';

test('uses the OpenRouter Nemotron free model as its default', () => {
    assert.equal(DEFAULT_AI_MODELS.nvidia, 'nvidia/nemotron-3-super-120b-a12b');
    assert.equal(DEFAULT_AI_MODELS.openrouter, 'nvidia/nemotron-3-super-120b-a12b:free');
    assert.equal(DEFAULT_AI_MODELS.groq, 'openai/gpt-oss-120b');
    assert.equal(DEFAULT_AI_MODELS.cerebras, 'gpt-oss-120b');

    const provider = new OpenRouterProvider({ apiKey: 'test-key' });
    assert.equal(provider.defaultModel, DEFAULT_AI_MODELS.openrouter);

    const nvidia = new NvidiaProvider({ apiKey: 'test-key' });
    assert.equal(nvidia.defaultModel, DEFAULT_AI_MODELS.nvidia);
});

test('AI tier configuration inherits the default model only within the same provider', () => {
    const config = createAIConfig({
        AI_DEFAULT_PROVIDER: 'openrouter',
        AI_DEFAULT_MODEL: 'custom-default',
        AI_FAST_PROVIDER: 'openrouter',
        AI_QUALITY_PROVIDER: 'groq'
    });

    assert.deepEqual(config.ai.tiers, {
        default: { provider: 'openrouter', model: 'custom-default' },
        fast: { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
        quality: { provider: 'groq', model: 'openai/gpt-oss-120b' }
    });
});

test('NVIDIA can be selected as a direct provider with its reasoning controls', () => {
    const config = createAIConfig({
        AI_DEFAULT_PROVIDER: 'nvidia',
        NVIDIA_ENABLE_THINKING: 'false',
        NVIDIA_REASONING_BUDGET: '8192'
    });

    assert.deepEqual(config.ai.tiers.default, { provider: 'nvidia', model: 'nvidia/nemotron-3-super-120b-a12b' });
    assert.equal(config.aiNvidiaEnableThinking, false);
    assert.equal(config.aiNvidiaReasoningBudget, 8192);
});

test('provider registry rejects unknown providers instead of silently using Gemini', () => {
    const registry = createProviderRegistry({
        config: {
            ai: { tiers: { default: { provider: 'unknown-provider' } } },
            aiTimeoutMs: 1000,
            aiThinkingLevel: 'minimal'
        }
    });

    assert.throws(() => registry.get('unknown-provider'), error => {
        assert.equal(error.code, 'AI_PROVIDER_UNSUPPORTED');
        return true;
    });
});

test('completion token configuration supports global unlimited and global finite caps', () => {
    const unlimited = createAIConfig({ AI_UNLIMITED_COMPLETION_TOKENS: 'true' });
    assert.equal(unlimited.aiUnlimitedCompletionTokens, true);
    assert.equal(unlimited.aiMaxCompletionTokens, null);

    const capped = createAIConfig({ AI_MAX_COMPLETION_TOKENS: '4096' });
    assert.equal(capped.aiUnlimitedCompletionTokens, false);
    assert.equal(capped.aiMaxCompletionTokens, 4096);
});

test('completion policy precedence is global unlimited, global cap, legacy form flag, then task default', () => {
    const policy = TASK_POLICIES[AI_TASKS.CHAT_RESPOND];
    assert.equal(resolveMaxCompletionTokens(AI_TASKS.CHAT_RESPOND, policy, {
        aiUnlimitedCompletionTokens: true,
        aiMaxCompletionTokens: 4096,
        aiFormUnlimitedCompletionTokens: false
    }), null);
    assert.equal(resolveMaxCompletionTokens(AI_TASKS.CHAT_RESPOND, policy, {
        aiUnlimitedCompletionTokens: false,
        aiMaxCompletionTokens: 4096,
        aiFormUnlimitedCompletionTokens: false
    }), 4096);
    assert.equal(resolveMaxCompletionTokens(AI_TASKS.FORM_BUILD, TASK_POLICIES[AI_TASKS.FORM_BUILD], {
        aiUnlimitedCompletionTokens: false,
        aiMaxCompletionTokens: null,
        aiFormUnlimitedCompletionTokens: true,
        aiWorkflowUnlimitedCompletionTokens: false
    }), null);
    assert.equal(resolveMaxCompletionTokens(AI_TASKS.WORKFLOW_BUILD, TASK_POLICIES[AI_TASKS.WORKFLOW_BUILD], {
        aiUnlimitedCompletionTokens: false,
        aiMaxCompletionTokens: null,
        aiFormUnlimitedCompletionTokens: false,
        aiWorkflowUnlimitedCompletionTokens: true
    }), null);
    assert.equal(resolveMaxCompletionTokens(AI_TASKS.CHAT_RESPOND, policy, {
        aiUnlimitedCompletionTokens: false,
        aiMaxCompletionTokens: null,
        aiFormUnlimitedCompletionTokens: false,
        aiWorkflowUnlimitedCompletionTokens: false
    }), 700);
});
