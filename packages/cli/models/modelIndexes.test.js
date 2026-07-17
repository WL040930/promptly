import test from 'node:test';
import assert from 'node:assert/strict';
import * as models from './index.js';

const indexKeys = model => (model.options.indexes || []).map(index =>
    `${index.fields.join(',')}|${index.unique ? 'unique' : 'normal'}`
);

test('model indexes match the main query paths', () => {
    assert.equal(models.AgentRun.rawAttributes.userId.type.key, 'UUID');
    assert.deepEqual(indexKeys(models.ChatSession), ['userId,updatedAt|normal']);
    assert.deepEqual(indexKeys(models.ChatMessage), ['sessionId,createdAt|normal']);
    assert.deepEqual(indexKeys(models.FormResponse), ['formId,createdAt|normal']);
    assert.deepEqual(indexKeys(models.FormChatMessage), ['formId,createdAt|normal']);
    assert.deepEqual(indexKeys(models.WorkflowVersion), ['workflowId,versionNumber|unique']);

    assert.ok(indexKeys(models.ExecutionLog).includes('userId,status,time|normal'));
    assert.ok(indexKeys(models.TriggerEvent).includes('status,availableAt,createdAt|normal'));
    assert.ok(indexKeys(models.TriggerSubscription).includes('provider,externalSubscriptionId,status|normal'));
    assert.ok(indexKeys(models.User).includes('resetPasswordToken,resetPasswordExpires|normal'));
});
