import test from 'node:test';
import assert from 'node:assert/strict';
import { externalTriggerForNode, normalizeEvent, stableRowFingerprint } from './triggerContracts.js';

test('external trigger contracts map node types and preserve event identity', () => {
    assert.deepEqual(externalTriggerForNode({ type: 'trigger', subType: 'email', id: 'node_1' }), {
        provider: 'gmail',
        node: { type: 'trigger', subType: 'email', id: 'node_1' }
    });
    assert.equal(externalTriggerForNode({ type: 'action', subType: 'email' }), null);
    const normalized = normalizeEvent({
        provider: 'gmail',
        eventType: 'message.received',
        externalEventId: 'gmail:message_1',
        payload: { data: { subject: 'Hello' } },
        subscription: { id: 'sub_1', workflowId: 'workflow_1', nodeId: 'node_1', userId: 'user_1' }
    });
    assert.equal(normalized.externalEventId, 'gmail:message_1');
    assert.equal(normalized.payload.data.subject, 'Hello');
    assert.equal(stableRowFingerprint(['Ada', 'Active']), stableRowFingerprint(['Ada', 'Active']));
});
