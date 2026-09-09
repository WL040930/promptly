import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebhookPayload } from './workflowLifecycleService.js';

test('wraps raw webhook test input as the request body envelope', () => {
    const result = prepareWebhookPayload({
        workflow: { nodes: [{ type: 'trigger', subType: 'webhook', config: {} }] },
        payload: { requestId: 'req_1', amount: 650 }
    });
    assert.deepEqual(result.payload.body, { requestId: 'req_1', amount: 650 });
    assert.equal(result.payload.method, 'POST');
    assert.equal(result.validation.valid, true);
});

test('uses the schema validator for wrapped webhook test input', () => {
    const result = prepareWebhookPayload({
        workflow: { nodes: [{ type: 'trigger', subType: 'webhook', config: {
            bodySchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] }
        } }] },
        payload: { amount: '650' }
    });
    assert.equal(result.validation.valid, false);
    assert.equal(result.validation.issues[0].path, '/amount');
});

test('treats envelope-shaped JSON as body data during a webhook test run', () => {
    const body = { body: 'raw', headers: 'raw', method: 'raw', timestamp: 'raw' };
    const result = prepareWebhookPayload({
        workflow: { nodes: [{ type: 'trigger', subType: 'webhook', config: {} }] },
        payload: body
    });
    assert.deepEqual(result.payload.body, body);
    assert.deepEqual(result.payload.headers, {});
    assert.equal(result.payload.method, 'POST');
});

test('keeps scalar JSON bodies intact for authoritative schema rejection', () => {
    const result = prepareWebhookPayload({
        workflow: { nodes: [{ type: 'trigger', subType: 'webhook', config: {
            bodySchema: { type: 'object', properties: { amount: { type: 'number' } } }
        } }] },
        payload: 0
    });
    assert.equal(result.payload.body, 0);
    assert.equal(result.validation.valid, false);
});
