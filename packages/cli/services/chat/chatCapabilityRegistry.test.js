import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatCapabilityRegistry } from './chatCapabilityRegistry.js';

test('chat capability registry owns the complete typed tool surface', () => {
    const registry = createChatCapabilityRegistry({
        session: { update: async () => {} },
        userId: 'user_1',
        effectiveContext: {},
        history: [],
        services: {
            saveReply: async () => ({ id: 'reply_1', kind: 'text' }),
            formForRequest: async () => null,
            workflowForRequest: async () => null,
            formResult: async () => ({ reply: { id: 'reply_1', kind: 'text' } })
        }
    });

    assert.deepEqual(registry.list().map(capability => capability.name), [
        'list_forms',
        'list_workflows',
        'search_resources',
        'get_form',
        'get_workflow',
        'get_form_context',
        'get_workflow_context',
        'get_execution_summary',
        'get_execution_details',
        'propose_form_change',
        'propose_workflow_change'
    ]);
    assert.equal(registry.toToolDefinitions().every(tool => tool.function.strict === true), true);
});
