import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatWorkflowInvocationService } from './chatWorkflowInvocationService.js';

const binding = {
    id: 'binding_1',
    workflowId: 'workflow_1',
    revisionId: 'revision_1',
    userId: 'user_1',
    kind: 'agent-message',
    status: 'active',
    config: {
        chatEnabled: true,
        invocationKey: 'email-matched-rows',
        description: 'Read the configured sheet and email every row with a requested status.',
        parameterSchema: {
            type: 'object',
            properties: { status: { type: 'string', description: 'Customer status' } },
            required: ['status'],
            additionalProperties: false
        }
    }
};

const fakeMessageModel = () => {
    let count = 0;
    return {
        async create(values) {
            count += 1;
            return { id: `message_${count}`, createdAt: new Date('2026-08-20T00:00:00.000Z'), ...values };
        }
    };
};

test('a confident matching chat request becomes a lifecycle approval, never a direct run', async () => {
    const calls = [];
    const service = createChatWorkflowInvocationService({
        bindingModel: { findAll: async () => [binding] },
        messageModel: fakeMessageModel(),
        aiClient: {
            run: async () => ({
                json: { bindingId: 'binding_1', confidence: 0.94, parameters: { status: 'Active' } }
            })
        },
        createLifecycleProposal: async args => {
            calls.push(args);
            return { reply: { id: 'proposal_1', kind: 'workflow_lifecycle_proposal', text: 'Approve this live run.' } };
        },
        replaceState: async () => {}
    });

    const result = await service.routeMessage({
        session: { id: 'session_1', state: {} },
        userId: 'user_1',
        message: 'Email all active customers from the sheet.'
    });

    assert.equal(result.reply.kind, 'workflow_lifecycle_proposal');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].workflowId, 'workflow_1');
    assert.deepEqual(calls[0].actions, ['live_run']);
    assert.deepEqual(calls[0].payload.parameters, { status: 'Active' });
    assert.equal(calls[0].payload.message, 'Email all active customers from the sheet.');
});

test('a matching request with missing parameters creates a scoped clarification', async () => {
    const session = { id: 'session_1', state: {} };
    const service = createChatWorkflowInvocationService({
        bindingModel: { findAll: async () => [binding] },
        messageModel: fakeMessageModel(),
        aiClient: { run: async () => ({ json: { bindingId: 'binding_1', confidence: 0.88, parameters: {} } }) },
        createLifecycleProposal: async () => assert.fail('a missing parameter must not run'),
        replaceState: async (target, state) => { target.state = state; }
    });

    const result = await service.routeMessage({ session, userId: 'user_1', message: 'Email matching customers.' });

    assert.equal(result.reply.kind, 'clarification');
    assert.equal(session.state.status, 'awaiting_chat_workflow_invocation_parameters');
    assert.equal(result.reply.payload.inputs[0].id, 'status');
    assert.equal(result.reply.payload.inputs[0].required, true);
});

test('uncertain AI routing does not take over the normal chat conversation', async () => {
    const service = createChatWorkflowInvocationService({
        bindingModel: { findAll: async () => [binding] },
        messageModel: fakeMessageModel(),
        aiClient: { run: async () => ({ json: { bindingId: 'binding_1', confidence: 0.4, parameters: {} } }) },
        replaceState: async () => {}
    });

    assert.equal(await service.routeMessage({ session: { id: 'session_1', state: {} }, userId: 'user_1', message: 'How are you?' }), null);
});
