import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAssistantNavigation } from './assistantNavigation.js';

test('navigation only occurs for explicit allowlisted workspace requests', () => {
    assert.deepEqual(resolveAssistantNavigation({ message: 'Show my forms' }), { page: 'forms' });
    assert.deepEqual(resolveAssistantNavigation({ message: 'Open the current workflow', context: { workflowId: 'wf_1' } }), {
        page: 'automation-build', automationId: 'wf_1', editor: 'ai'
    });
    assert.equal(resolveAssistantNavigation({ message: 'What forms do I have?' }), null);
});
