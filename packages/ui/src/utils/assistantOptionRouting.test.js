import test from 'node:test';
import assert from 'node:assert/strict';
import { eventForAssistantOption } from './assistantOptionRouting.js';

test('Ask Promptly forwards Let Promptly decide as an event instead of dropping it', () => {
    const option = {
        type: 'decide_for_me',
        clarificationId: 'clarification_1',
        clarificationMessageId: 'message_1',
        runId: 'run_1'
    };

    assert.deepEqual(eventForAssistantOption(option), option);
});

test('ordinary option values do not become assistant events', () => {
    assert.equal(eventForAssistantOption('Explain this'), null);
    assert.equal(eventForAssistantOption({ type: 'preview_form' }), null);
});
