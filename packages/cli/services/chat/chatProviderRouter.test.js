import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableChatProviderError, requestChatCompletionWithFallback } from './chatProviderRouter.js';

test('chat provider router treats Cerebras 429 quota errors as retryable', () => {
    assert.equal(isRetryableChatProviderError({
        status: 429,
        code: 'request_quota_exceeded',
        message: 'Requests per minute limit exceeded - too many requests sent.'
    }), true);
});

test('chat provider router switches to the next model after a rate limit', async () => {
    const calls = [];
    const routes = [
        {
            providerName: 'cerebras',
            model: 'gpt-oss-120b',
            provider: {
                supportsToolCalls: true,
                async generateContent() {
                    calls.push('cerebras');
                    const error = new Error('Requests per minute limit exceeded - too many requests sent.');
                    error.status = 429;
                    error.code = 'request_quota_exceeded';
                    error.headers = { 'retry-after': '60' };
                    throw error;
                }
            }
        },
        {
            providerName: 'gemini',
            model: 'gemini-3.5-flash',
            provider: {
                supportsToolCalls: false,
                async generateContent() {
                    calls.push('gemini');
                    return { text: 'fallback response' };
                }
            }
        }
    ];

    const response = await requestChatCompletionWithFallback({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        routes,
        tools: [{ type: 'function', function: { name: 'test', parameters: {} } }]
    });

    assert.equal(response.text, 'fallback response');
    assert.deepEqual(calls, ['cerebras', 'gemini']);
});
