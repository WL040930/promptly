import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeWebhookBodySchema,
    webhookBodyFields,
    webhookBodyPathIssue,
    webhookExampleFromSchema
} from './webhookPayloadContract.js';

test('normalizes nested webhook fields with stable typed paths', () => {
    const contract = normalizeWebhookBodySchema({
        type: 'object',
        properties: {
            requestId: { type: 'string' },
            amount: { type: 'number' },
            customer: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string' } }
            }
        },
        required: ['requestId', 'amount']
    });

    assert.equal(contract.issues.length, 0);
    assert.deepEqual(contract.fields.map(field => ({ path: field.pathString, type: field.type, required: field.required })), [
        { path: 'body.requestId', type: 'string', required: true },
        { path: 'body.amount', type: 'number', required: true },
        { path: 'body.customer', type: 'object', required: false },
        { path: 'body.customer.email', type: 'string', required: true }
    ]);
    assert.equal(contract.fingerprint, normalizeWebhookBodySchema(JSON.stringify(contract.schema)).fingerprint);
});

test('accepts scalar arrays, enums, and undeclared extra fields', () => {
    const contract = normalizeWebhookBodySchema({
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['pending', 'approved'] },
            tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['status', 'tags'],
        additionalProperties: true
    });
    assert.equal(contract.issues.length, 0);
    assert.deepEqual(webhookExampleFromSchema(contract), { status: 'pending', tags: [] });
    assert.equal(webhookBodyPathIssue({ schema: contract.schema, path: ['body', 'missing'] })?.code, 'WEBHOOK_BODY_FIELD_UNKNOWN');
});

test('rejects unsupported schema keywords and arrays of objects', () => {
    const contract = normalizeWebhookBodySchema({
        type: 'object',
        properties: {
            value: { type: 'string', pattern: '^x' },
            nested: { oneOf: [{ type: 'string' }] },
            items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } }
        }
    });
    assert.ok(contract.issues.some(issue => issue.code === 'WEBHOOK_SCHEMA_KEY_UNSUPPORTED'));
    assert.ok(contract.issues.some(issue => issue.code === 'WEBHOOK_SCHEMA_ARRAY_ITEMS_INVALID'));
});

test('rejects invalid JSON, excessive depth, and excessive declared fields', () => {
    assert.equal(normalizeWebhookBodySchema('{not-json').issues[0].code, 'WEBHOOK_SCHEMA_JSON_INVALID');

    let deep = { type: 'object', properties: {} };
    for (let index = 0; index < 6; index += 1) deep = { type: 'object', properties: { child: deep } };
    assert.ok(normalizeWebhookBodySchema(deep).issues.some(issue => issue.code === 'WEBHOOK_SCHEMA_DEPTH_EXCEEDED'));

    const properties = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`field_${index}`, { type: 'string' }]));
    assert.ok(normalizeWebhookBodySchema({ type: 'object', properties }).issues.some(issue => issue.code === 'WEBHOOK_SCHEMA_FIELD_LIMIT'));
});

test('requires a contract only when callers opt into typed body references', () => {
    assert.equal(webhookBodyPathIssue({ schema: {}, path: ['body', 'amount'] }), null);
    assert.equal(webhookBodyPathIssue({ schema: {}, path: ['body', 'amount'], requireSchema: true })?.code, 'WEBHOOK_BODY_SCHEMA_REQUIRED');
    const contract = normalizeWebhookBodySchema({ type: 'object', properties: { amount: { type: 'number' } } });
    assert.equal(webhookBodyPathIssue({ schema: contract, path: ['body', 'amount'] }), null);
    assert.equal(webhookBodyFields(contract.schema).length, 1);
});
