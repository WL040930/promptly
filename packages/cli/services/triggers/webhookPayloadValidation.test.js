import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebhookBody, webhookContractsAgree } from './webhookPayloadValidation.js';

const contract = {
    type: 'object',
    properties: {
        amount: { type: 'number' },
        customer: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }
    },
    required: ['amount']
};

test('validates webhook payloads without coercing or removing extra fields', () => {
    const body = { amount: 650, customer: { email: 'buyer@example.com' }, extra: 'preserved' };
    const result = validateWebhookBody({ body, bodySchema: contract });
    assert.equal(result.valid, true);
    assert.deepEqual(body, { amount: 650, customer: { email: 'buyer@example.com' }, extra: 'preserved' });
});

test('returns safe issue paths for missing and wrong-type webhook fields', () => {
    const result = validateWebhookBody({ body: { amount: '650', customer: {} }, bodySchema: contract });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.path === '/amount' && issue.message === 'must be number'));
    assert.ok(result.issues.some(issue => issue.path === '/customer/email' && issue.message === "must have required property 'email'"));
    assert.equal(JSON.stringify(result).includes('650'), false);
});

test('rejects falsey non-object request bodies without coercion', () => {
    const result = validateWebhookBody({ body: 0, bodySchema: contract });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.path === '/' && issue.message === 'must be object'));
});

test('invalid contracts fail closed without exposing submitted values', () => {
    const result = validateWebhookBody({ body: { secretValue: 'do-not-leak' }, bodySchema: '{bad' });
    assert.equal(result.valid, false);
    assert.equal(result.issues.length, 0);
    assert.ok(result.configurationIssues.length > 0);
    assert.equal(JSON.stringify(result).includes('do-not-leak'), false);
});

test('shared webhook bindings agree only when normalized contracts match', () => {
    assert.equal(webhookContractsAgree([contract, JSON.stringify(contract)]), true);
    assert.equal(webhookContractsAgree([contract, { ...contract, required: [] }]), false);
    assert.equal(webhookContractsAgree([{}, undefined]), true);
});
