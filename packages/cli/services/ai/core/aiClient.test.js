import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIClient } from './aiClient.js';
import env from '../../../config/env.js';

const createRegistry = adapters => ({
    timeoutMs: 50,
    hasCredentials: () => true,
    getDefaultModel: provider => `${provider}-fallback-model`,
    get: provider => adapters[provider]
});

test('AI client fails over retryable provider errors and normalizes the response', async () => {
    const calls = [];
    const adapters = {
        cerebras: {
            supportsToolCalls: true,
            async generateContent() {
                calls.push('cerebras');
                const error = new Error('Requests per minute limit exceeded.');
                error.status = 429;
                error.headers = { 'retry-after': '10' };
                throw error;
            }
        },
        gemini: {
            supportsToolCalls: false,
            async generateContent(contents, options) {
                calls.push({ provider: 'gemini', contents, options });
                return {
                    text: '{"ok":true}',
                    usageMetadata: {
                        promptTokenCount: 4,
                        candidatesTokenCount: 3,
                        totalTokenCount: 7
                    }
                };
            }
        }
    };
    const ai = createAIClient({
        registry: createRegistry(adapters),
        profiles: {
            fast: { provider: 'cerebras', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({
        task: 'chat.respond',
        messages: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        systemInstruction: 'Be concise.',
        tools: [{ type: 'function', function: { name: 'test', parameters: {} } }]
    });

    assert.equal(result.json, null);
    assert.equal(result.text, '{"ok":true}');
    assert.deepEqual(result.usage, {
        promptTokens: 4,
        completionTokens: 3,
        thoughtTokens: 0,
        totalTokens: 7
    });
    assert.equal(calls[0], 'cerebras');
    assert.equal(calls[1].provider, 'gemini');
    assert.deepEqual(calls[1].contents, [{ role: 'user', parts: [{ text: 'Hello' }] }]);
    assert.equal(calls[1].options.systemInstruction, 'Be concise.');
    assert.equal(calls[1].options.model, 'quality-model');
    assert.equal(calls[1].options.maxCompletionTokens,
        env.aiUnlimitedCompletionTokens ? null : env.aiMaxCompletionTokens || 700);
    assert.equal(calls[1].options.operation, 'chat.respond');
    assert.equal(calls[1].options.tools, undefined);
    assert.ok(calls[1].options.signal instanceof AbortSignal);
});

test('AI client parses JSON tasks and exposes invalid output without retrying domain repair', async () => {
    let calls = 0;
    const adapter = {
        supportsToolCalls: false,
        async generateContent() {
            calls += 1;
            return { text: '{"action":"create"}' };
        }
    };
    const ai = createAIClient({
        registry: createRegistry({ gemini: adapter }),
        profiles: {
            fast: { provider: 'gemini', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({
        task: 'workflow.plan',
        messages: [{ role: 'user', parts: [{ text: 'Create a workflow.' }] }]
    });

    assert.deepEqual(result.json, { action: 'create' });
    assert.equal(calls, 1);
});

test('AI client does not fail over authentication errors', async () => {
    const calls = [];
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    calls.push('gemini');
                    const error = new Error('Invalid API key');
                    error.status = 401;
                    throw error;
                }
            },
            cerebras: {
                async generateContent() {
                    calls.push('cerebras');
                    return { text: 'should not be called' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'gemini', model: 'fast-model' },
            quality: { provider: 'cerebras', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    await assert.rejects(
        () => ai.run({ task: 'chat.respond', messages: [] }),
        error => error.category === 'auth' && error.status === 401
    );
    assert.deepEqual(calls, ['gemini']);
});

test('AI client aborts timed out providers before failing over', async () => {
    let timedOutSignal;
    const ai = createAIClient({
        registry: {
            ...createRegistry({
                cerebras: {
                    async generateContent(contents, options) {
                        timedOutSignal = options.signal;
                        return new Promise(() => {});
                    }
                },
                gemini: {
                    async generateContent() {
                        return { text: 'fallback response' };
                    }
                }
            }),
            timeoutMs: 10
        },
        profiles: {
            fast: { provider: 'cerebras', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'chat.respond', messages: [] });

    assert.equal(result.text, 'fallback response');
    assert.equal(timedOutSignal.aborted, true);
});

test('AI client retries a lone workflow provider after a transient failure', async () => {
    let calls = 0;
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    calls += 1;
                    if (calls === 1) {
                        const error = new Error('Service temporarily unavailable.');
                        error.status = 503;
                        throw error;
                    }
                    return { text: '{"type":"reply","message":"Ready"}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'gemini', model: 'workflow-model' },
            quality: { provider: 'gemini', model: 'workflow-model' },
            default: { provider: 'gemini', model: 'workflow-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.plan', messages: [] });

    assert.equal(calls, 2);
    assert.deepEqual(result.json, { type: 'reply', message: 'Ready' });
});

test('AI client enforces the caller request budget across fallback attempts', async () => {
    const calls = [];
    const ai = createAIClient({
        registry: createRegistry({
            cerebras: {
                async generateContent() {
                    calls.push('cerebras');
                    const error = new Error('rate limit');
                    error.status = 429;
                    throw error;
                }
            },
            gemini: {
                async generateContent() {
                    calls.push('gemini');
                    return { text: 'should not be called' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'cerebras', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });
    const budget = { calls: 0, maxCalls: 1 };

    await assert.rejects(
        () => ai.run({ task: 'chat.respond', messages: [], budget }),
        error => error.code === 'AI_BUDGET_EXCEEDED' && error.calls === 1
    );
    assert.deepEqual(calls, ['cerebras']);
});
