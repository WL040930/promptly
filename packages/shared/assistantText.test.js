import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAssistantText } from './assistantText.js';

test('normalizes one accidentally repeated assistant command without changing ordinary text', () => {
    const command = 'If attendance mode is Online, send joining instructions; otherwise send venue instructions';
    assert.equal(normalizeAssistantText(`${command}${command}`), command);
    assert.equal(normalizeAssistantText(`${command}\n${command}`), command);
    assert.equal(normalizeAssistantText('Send one email, then send another email.'), 'Send one email, then send another email.');
});
