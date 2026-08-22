import test from 'node:test';
import assert from 'node:assert/strict';
import {
    chatParameterSchemaFromConfig,
    chatWorkflowInvocationFromConfig,
    validateChatInvocationParameters
} from './chatWorkflowInvocationContract.js';

test('builds a flat schema from the chat parameter editor', () => {
    const result = chatWorkflowInvocationFromConfig({
        chatEnabled: true,
        invocationKey: 'email-matched-rows',
        description: 'Email every row matching a requested customer status.',
        parameters: [
            { name: 'status', type: 'string', description: 'Customer status', required: true },
            { name: 'includeInactive', type: 'boolean', required: false }
        ]
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.parameterSchema, {
        type: 'object',
        properties: {
            status: { type: 'string', description: 'Customer status' },
            includeInactive: { type: 'boolean' }
        },
        required: ['status'],
        additionalProperties: false
    });
});

test('advanced schemas fail closed when they are not flat and closed to extra fields', () => {
    const result = chatParameterSchemaFromConfig({
        parameterSchema: {
            type: 'object',
            properties: { status: { type: 'object' } },
            additionalProperties: true
        }
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some(item => item.code === 'CHAT_PARAMETER_TYPE_INVALID'));
    assert.ok(result.issues.some(item => item.code === 'CHAT_PARAMETER_ADDITIONAL_PROPERTIES'));
});

test('coerces declared browser values and ignores model-invented parameters', () => {
    const schema = {
        type: 'object',
        properties: {
            count: { type: 'integer' },
            approved: { type: 'boolean' },
            status: { type: 'string', enum: ['Active', 'Paused'] }
        },
        required: ['count', 'approved', 'status'],
        additionalProperties: false
    };
    const result = validateChatInvocationParameters({
        schema,
        parameters: { count: '2', approved: 'true', status: ['Active'], invented: 'discard me' }
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.parameters, { count: 2, approved: true, status: 'Active' });
});
