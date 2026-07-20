import test from 'node:test';
import assert from 'node:assert/strict';
import { toGeminiContents } from './geminiProvider.js';

test('normalizes native tool history into Gemini-compatible parts', () => {
    const contents = toGeminiContents([
        { role: 'model', parts: [{ text: '' }], toolCalls: [{ id: 'call_1', name: 'list_forms', args: { purpose: 'list' } }] },
        { role: 'tool', toolCallId: 'call_1', name: 'list_forms', content: '{"status":"completed"}' },
        { role: 'user', parts: [{ text: 'can delete the untitled form' }] }
    ]);

    assert.deepEqual(contents, [
        {
            role: 'model',
            parts: [{ text: '<TOOL>{"name":"list_forms","args":{"purpose":"list"}}</TOOL>' }]
        },
        {
            role: 'user',
            parts: [{ text: '<TOOL_RESPONSE>{"status":"completed"}</TOOL_RESPONSE>' }]
        },
        {
            role: 'user',
            parts: [{ text: 'can delete the untitled form' }]
        }
    ]);

    assert.equal(contents.some(content => content.role === 'tool'), false);
    assert.equal(contents.some(content => Object.hasOwn(content, 'content')), false);
});

test('preserves Gemini fallback tool history without mixing message shapes', () => {
    assert.deepEqual(toGeminiContents([
        { role: 'model', parts: [{ text: '<TOOL>{"name":"list_forms","args":{}}</TOOL>' }] },
        { role: 'user', parts: [{ text: '<TOOL_RESPONSE>{"status":"completed"}</TOOL_RESPONSE>' }] }
    ]), [
        { role: 'model', parts: [{ text: '<TOOL>{"name":"list_forms","args":{}}</TOOL>' }] },
        { role: 'user', parts: [{ text: '<TOOL_RESPONSE>{"status":"completed"}</TOOL_RESPONSE>' }] }
    ]);
});
