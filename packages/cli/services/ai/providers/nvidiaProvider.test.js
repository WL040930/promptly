import test from 'node:test';
import assert from 'node:assert/strict';
import { NvidiaProvider } from './nvidiaProvider.js';

test('NVIDIA provider sends the direct endpoint and thinking controls', async t => {
    const originalFetch = globalThis.fetch;
    let request = null;
    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({
            choices: [{ message: { content: 'Ready.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const provider = new NvidiaProvider({ apiKey: 'test-key', timeoutMs: 500, reasoningBudget: 16_384, enableThinking: true });
    const result = await provider.generateContent([{ role: 'user', parts: [{ text: 'Hello' }] }]);
    const body = JSON.parse(request.options.body);

    assert.equal(request.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer test-key');
    assert.equal(body.model, 'nvidia/nemotron-3-super-120b-a12b');
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 1);
    assert.equal(body.top_p, 0.95);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
    assert.equal(body.reasoning_budget, 16_384);
    assert.equal(result.text, 'Ready.');
});
