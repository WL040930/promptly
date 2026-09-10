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

test('AI client skips a payment-required provider for a distinct fallback', async () => {
    const calls = [];
    const ai = createAIClient({
        registry: createRegistry({
            cerebras: {
                async generateContent() {
                    calls.push('cerebras');
                    const error = new Error('402 Payment required to access this resource.');
                    error.status = 402;
                    throw error;
                }
            },
            groq: {
                async generateContent() {
                    calls.push('groq');
                    return { text: '{"ok":true}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'cerebras', model: 'cerebras-model' },
            quality: { provider: 'cerebras', model: 'cerebras-model' },
            default: { provider: 'cerebras', model: 'cerebras-model' }
        },
        fallbackProviders: ['groq'],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({
        task: 'workflow.build',
        messages: [{ role: 'user', parts: [{ text: 'Build a workflow.' }] }]
    });

    assert.equal(result.provider, 'groq');
    assert.deepEqual(result.json, { ok: true });
    assert.deepEqual(calls, ['cerebras', 'groq']);
});

test('AI client does not retry a payment-required provider when no alternate route exists', async () => {
    let calls = 0;
    const ai = createAIClient({
        registry: createRegistry({
            cerebras: {
                async generateContent() {
                    calls += 1;
                    const error = new Error('402 Payment required to access this resource.');
                    error.status = 402;
                    throw error;
                }
            }
        }),
        profiles: {
            fast: { provider: 'cerebras', model: 'cerebras-model' },
            quality: { provider: 'cerebras', model: 'cerebras-model' },
            default: { provider: 'cerebras', model: 'cerebras-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    await assert.rejects(
        () => ai.run({ task: 'workflow.build', messages: [] }),
        error => error.category === 'payment_required' && error.attempt === 1
    );
    assert.equal(calls, 1);
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

test('AI client repairs one missing JSON separator for workflow tasks before domain validation', async () => {
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    return { text: '{"operations":[{"op":"create_node"} {"op":"connect"}]}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'gemini', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.build', messages: [] });

    assert.deepEqual(result.json, {
        operations: [{ op: 'create_node' }, { op: 'connect' }]
    });
});

test('AI client repairs a bounded sequence of missing JSON separators for workflow tasks', async () => {
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    return { text: '{"operations":[{"op":"create_node"} {"op":"connect"} {"op":"update_node"}]}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'gemini', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.build', messages: [] });

    assert.deepEqual(result.json, {
        operations: [{ op: 'create_node' }, { op: 'connect' }, { op: 'update_node' }]
    });
});

test('AI client keeps malformed JSON strict outside workflow tasks', async () => {
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    return { text: '{"intent":"create" "confidence":1}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'gemini', model: 'fast-model' },
            quality: { provider: 'gemini', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    await assert.rejects(
        () => ai.run({ task: 'agent.intent', messages: [] }),
        error => error.code === 'AI_INVALID_OUTPUT'
    );
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

test('AI client exhausts four default provider attempts for retryable failures', async () => {
    let calls = 0;
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    calls += 1;
                    const error = new Error('Service temporarily unavailable.');
                    error.status = 503;
                    throw error;
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

    await assert.rejects(
        () => ai.run({ task: 'workflow.plan', messages: [] }),
        error => error.category === 'unavailable' && error.attempt === 4
    );
    assert.equal(calls, 4);
});

test('AI client accepts a workflow-specific provider-attempt override', async () => {
    let calls = 0;
    const ai = createAIClient({
        registry: createRegistry({
            gemini: {
                async generateContent() {
                    calls += 1;
                    if (calls < 3) {
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

    const result = await ai.run({ task: 'workflow.plan', messages: [], maxAttempts: 3 });

    assert.equal(calls, 3);
    assert.deepEqual(result.json, { type: 'reply', message: 'Ready' });
});

test('AI client skips a provider that produced an invalid workflow draft during repair', async () => {
    const calls = [];
    const ai = createAIClient({
        registry: createRegistry({
            nvidia: {
                async generateContent() {
                    calls.push('nvidia');
                    return { text: '{"type":"reply","message":"NVIDIA"}' };
                }
            },
            gemini: {
                async generateContent() {
                    calls.push('gemini');
                    return { text: '{"type":"reply","message":"Gemini"}' };
                }
            }
        }),
        profiles: {
            quality: { provider: 'nvidia', model: 'quality-model' },
            default: { provider: 'gemini', model: 'default-model' },
            fast: { provider: 'nvidia', model: 'fast-model' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({
        task: 'workflow.build',
        messages: [],
        excludeProviders: ['nvidia']
    });

    assert.deepEqual(calls, ['gemini']);
    assert.equal(result.provider, 'gemini');
});

test('AI client retries OpenRouter with Gemini after the Nemotron model fails', async () => {
    const calls = [];
    const nemotron = 'nvidia/nemotron-3-super-120b-a12b:free';
    const gemini = 'google/gemini-3.5-flash-lite';
    const ai = createAIClient({
        registry: createRegistry({
            openrouter: {
                async generateContent(_contents, options) {
                    calls.push(options.model);
                    if (options.model === nemotron) {
                        const error = new Error('Service temporarily unavailable.');
                        error.status = 503;
                        throw error;
                    }
                    return { text: '{"type":"reply","message":"Ready"}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'openrouter', model: nemotron },
            quality: { provider: 'openrouter', model: nemotron },
            default: { provider: 'openrouter', model: nemotron }
        },
        fallbackRoutes: [{ provider: 'openrouter', model: gemini }],
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.build', messages: [] });

    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, gemini);
    assert.deepEqual(calls, [nemotron, gemini]);
});

test('AI client retries OpenRouter with Gemini after Nemotron returns empty JSON output', async () => {
    const calls = [];
    const nemotron = 'nvidia/nemotron-3-super-120b-a12b:free';
    const gemini = 'google/gemini-3.5-flash-lite';
    const ai = createAIClient({
        registry: createRegistry({
            openrouter: {
                async generateContent(_contents, options) {
                    calls.push(options.model);
                    if (options.model === nemotron) return { text: '' };
                    return { text: '{"type":"reply","message":"Ready"}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'openrouter', model: nemotron },
            quality: { provider: 'openrouter', model: nemotron },
            default: { provider: 'openrouter', model: nemotron }
        },
        fallbackRoutes: [{ provider: 'openrouter', model: gemini }],
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.build', messages: [] });

    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, gemini);
    assert.deepEqual(calls, [nemotron, gemini]);
});

test('AI client falls back after Groq rejects the generated JSON', async () => {
    const calls = [];
    const ai = createAIClient({
        registry: createRegistry({
            groq: {
                async generateContent() {
                    calls.push('groq');
                    const error = new Error('Groq API Error: 400 - {"error":{"message":"Failed to generate JSON. Please adjust your prompt.","code":"json_validate_failed"}}');
                    error.status = 400;
                    throw error;
                }
            },
            openrouter: {
                async generateContent() {
                    calls.push('openrouter');
                    return { text: '{"type":"reply","message":"Ready"}' };
                }
            }
        }),
        profiles: {
            quality: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            default: { provider: 'openrouter', model: 'google/gemini-3.5-flash-lite' },
            fast: { provider: 'groq', model: 'openai/gpt-oss-120b' }
        },
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({ task: 'workflow.build', messages: [] });

    assert.equal(result.provider, 'openrouter');
    assert.deepEqual(calls, ['groq', 'openrouter']);
});

test('AI client excludes only the failed OpenRouter model during a workflow repair', async () => {
    const calls = [];
    const nemotron = 'nvidia/nemotron-3-super-120b-a12b:free';
    const gemini = 'google/gemini-3.5-flash-lite';
    const ai = createAIClient({
        registry: createRegistry({
            openrouter: {
                async generateContent(_contents, options) {
                    calls.push(options.model);
                    return { text: '{"type":"reply","message":"Ready"}' };
                }
            }
        }),
        profiles: {
            fast: { provider: 'openrouter', model: nemotron },
            quality: { provider: 'openrouter', model: nemotron },
            default: { provider: 'openrouter', model: nemotron }
        },
        fallbackRoutes: [{ provider: 'openrouter', model: gemini }],
        fallbackProviders: [],
        logger: { info() {}, warn() {}, error() {} }
    });

    const result = await ai.run({
        task: 'workflow.build',
        messages: [],
        excludeRoutes: [{ provider: 'openrouter', model: nemotron }]
    });

    assert.equal(result.model, gemini);
    assert.deepEqual(calls, [gemini]);
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
