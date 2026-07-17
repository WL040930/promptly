import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolCalls, toChatCompletionMessages } from './chatCompletionMessageMapper.js';

test('maps native assistant tool calls and tool responses into OpenAI messages', () => {
    const messages = toChatCompletionMessages([
        { role: 'model', parts: [{ text: '' }], toolCalls: [{ id: 'call_1', name: 'search_resources', args: { query: 'Testing' } }] },
        { role: 'tool', toolCallId: 'call_1', name: 'search_resources', content: '{"status":"resolved"}' }
    ], 'You are Promptly Agent.');

    assert.deepEqual(messages, [
        { role: 'system', content: 'You are Promptly Agent.' },
        {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_resources', arguments: '{"query":"Testing"}' } }]
        },
        { role: 'tool', tool_call_id: 'call_1', name: 'search_resources', content: '{"status":"resolved"}' }
    ]);
});

test('normalizes provider tool call arguments', () => {
    const calls = normalizeToolCalls({
        tool_calls: [{ id: 'call_1', function: { name: 'get_workflow', arguments: '{"workflowId":"w_1"}' } }]
    });

    assert.deepEqual(calls, [{ id: 'call_1', name: 'get_workflow', args: { workflowId: 'w_1' } }]);
});
