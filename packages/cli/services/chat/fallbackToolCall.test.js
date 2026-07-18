import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFallbackToolMarkup, parseFallbackToolCall } from './fallbackToolCall.js';

test('parses self-closing fallback tool calls without exposing markup', () => {
    assert.deepEqual(
        parseFallbackToolCall('<TOOL name="list_forms" args="{}" />'),
        { name: 'list_forms', args: {} }
    );
});

test('parses the JSON-wrapped fallback format', () => {
    assert.deepEqual(
        parseFallbackToolCall('<TOOL>{"name":"search_resources","args":{"query":"Contact Us"}}</TOOL>'),
        { name: 'search_resources', args: { query: 'Contact Us' } }
    );
});

test('parses quoted and HTML-escaped self-closing arguments', () => {
    assert.deepEqual(
        parseFallbackToolCall('<TOOL name="search_resources" args="{&quot;query&quot;:&quot;Contact Us&quot;}" />'),
        { name: 'search_resources', args: { query: 'Contact Us' } }
    );
});

test('ignores malformed fallback tool markup', () => {
    assert.equal(parseFallbackToolCall('<TOOL name="list_forms" args="not-json" />'), null);
});

test('detects malformed tool markup so the chat loop can keep it out of user messages', () => {
    assert.equal(hasFallbackToolMarkup('<TOOL name="list_forms" args="not-json" />'), true);
    assert.equal(hasFallbackToolMarkup('<TOOL_RESPONSE>{"ok":true}</TOOL_RESPONSE>'), false);
});
