import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLiveTriggerBindings } from './workflowTriggerBindingService.js';

test('extractLiveTriggerBindings indexes form and webhook triggers from a release only', () => {
    const bindings = extractLiveTriggerBindings({
        workflow: { id: 'workflow_1', userId: '00000000-0000-4000-8000-000000000001' },
        revision: {
            id: 'revision_1',
            nodes: [
                { id: 'form_node', type: 'trigger', subType: 'form-submission', config: { formId: 'form_1' } },
                { id: 'webhook_node', type: 'trigger', subType: 'webhook', config: { webhookId: 'inbound_1', secret: 'secret' } },
                { id: 'draft_only', type: 'action', subType: 'email', config: {} }
            ]
        }
    });

    assert.deepEqual(bindings.map(({ kind, resourceId, nodeId, revisionId }) => ({ kind, resourceId, nodeId, revisionId })), [
        { kind: 'form-submission', resourceId: 'form_1', nodeId: 'form_node', revisionId: 'revision_1' },
        { kind: 'webhook', resourceId: 'inbound_1', nodeId: 'webhook_node', revisionId: 'revision_1' }
    ]);
});
