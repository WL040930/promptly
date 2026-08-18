import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssistantRetryRequest } from './recoveryRetryRequest.js';

test('a fallback Try again action replays the latest original request', () => {
    const request = 'When registration form receive response, append into a sheet';

    assert.equal(resolveAssistantRetryRequest({
        action: { type: 'focus_composer', label: 'Try again' },
        previousRequest: request
    }), request);
});

test('a retry action can recover its request from loaded conversation history', () => {
    const request = 'Create a contact form and save every submission to a new Google Sheet';

    assert.equal(resolveAssistantRetryRequest({
        action: { type: 'retry', label: 'Try again' },
        failureMessage: { id: 'failure_1' },
        messages: [
            { id: 'user_1', sender: 'user', kind: 'text', text: request },
            { id: 'failure_1', sender: 'bot', kind: 'error', text: 'This request is not ready yet' }
        ]
    }), request);
});

test('a corrective composer action does not submit automatically', () => {
    assert.equal(resolveAssistantRetryRequest({
        action: { type: 'focus_composer', label: 'Clarify the change' },
        previousRequest: 'Build a workflow'
    }), '');
});
