import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowProposalPayload, createChatCapabilityRegistry } from './chatCapabilityRegistry.js';

test('workflow proposal payload includes the presentation used by applied summaries', () => {
    const payload = buildWorkflowProposalPayload({
        workflow: { name: 'Event Registration', revision: 4, nodes: [{ id: 'existing', title: 'Existing step' }], edges: [] },
        result: {
            message: 'Ready',
            nodes: [
                { id: 'form', subType: 'form-submission', title: 'Form submitted' },
                { id: 'email', subType: 'send-email', title: 'Send email' }
            ],
            edges: [{ id: 'edge_1', op: 'connect' }],
            diff: {
                addedNodes: [{ id: 'form', subType: 'form-submission', title: 'Form submitted' }, { id: 'email', subType: 'send-email', title: 'Send email' }],
                updatedNodes: [],
                removedNodes: [],
                edges: [{ id: 'edge_1', op: 'connect' }]
            },
            readiness: { ready: true },
            resourceChanges: []
        }
    });

    assert.deepEqual(payload.presentation.flow, ['Form submitted', 'Send email']);
    assert.equal(payload.presentation.changes.length, 3);
    assert.equal(payload.presentation.title, 'Event Registration changes');
});

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
        'get_workspace_summary',
        'list_forms',
        'list_workflows',
        'search_resources',
        'get_form',
        'get_workflow',
        'get_form_context',
        'get_form_dependencies',
        'get_form_response_summary',
        'get_workflow_context',
        'get_execution_summary',
        'get_execution_details',
        'list_connections',
        'propose_form_change',
        'propose_form_duplicate',
        'propose_form_delete',
        'propose_delete_all_forms',
        'propose_form_response_clear',
        'propose_workflow_lifecycle_actions',
        'propose_workflow_change'
    ]);
    assert.equal(registry.toToolDefinitions().every(tool => tool.function.strict === true), true);
});

test('form explanation replies complete as chat text instead of awaiting clarification', async () => {
    const registry = createChatCapabilityRegistry({
        session: { update: async () => {} },
        userId: 'user_1',
        effectiveContext: {},
        history: [],
        services: {
            saveReply: async () => ({ id: 'reply_1', kind: 'text' }),
            formForRequest: async () => null,
            workflowForRequest: async () => null,
            formResult: async () => ({ reply: { id: 'reply_1', kind: 'text', text: 'A dropdown is useful here.' } })
        }
    });

    const result = await registry.execute('propose_form_change', { formId: null, prompt: 'Explain this form choice.' });
    assert.equal(result.status, 'completed');
    assert.equal(result.output.text, 'A dropdown is useful here.');
});
