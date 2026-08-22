import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLiveTriggerBindings } from './workflowTriggerBindingService.js';

test('extractLiveTriggerBindings indexes form, webhook, and explicitly enabled chat triggers from a release only', () => {
    const bindings = extractLiveTriggerBindings({
        workflow: { id: 'workflow_1', userId: '00000000-0000-4000-8000-000000000001' },
        revision: {
            id: 'revision_1',
            nodes: [
                { id: 'form_node', type: 'trigger', subType: 'form-submission', config: { formId: 'form_1' } },
                { id: 'webhook_node', type: 'trigger', subType: 'webhook', config: { webhookId: 'inbound_1', secret: 'secret' } },
                {
                    id: 'chat_node',
                    type: 'trigger',
                    subType: 'agent',
                    config: {
                        chatEnabled: true,
                        invocationKey: 'email-matched-rows',
                        description: 'Email every row that matches the requested status.',
                        parameters: [{ name: 'status', type: 'string', required: true }]
                    }
                },
                { id: 'draft_only', type: 'action', subType: 'email', config: {} }
            ]
        }
    });

    assert.deepEqual(bindings.map(({ kind, resourceId, nodeId, revisionId }) => ({ kind, resourceId, nodeId, revisionId })), [
        { kind: 'form-submission', resourceId: 'form_1', nodeId: 'form_node', revisionId: 'revision_1' },
        { kind: 'webhook', resourceId: 'inbound_1', nodeId: 'webhook_node', revisionId: 'revision_1' },
        { kind: 'agent-message', resourceId: 'email-matched-rows', nodeId: 'chat_node', revisionId: 'revision_1' }
    ]);
    assert.deepEqual(bindings[2].config.parameterSchema.required, ['status']);
});
