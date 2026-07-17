import test from 'node:test';
import assert from 'node:assert/strict';
import SetVariableNode from './core-logic/utilities/set-variable/index.js';
import FormatResponseNode, { buildResponse } from './core-logic/utilities/format-response/index.js';
import LoggerNode, { redact } from './core-logic/utilities/logger/index.js';

const run = (NodeClass, subType, config, context = {}) => new NodeClass(
    `${subType}_test`, 'logic', subType, config
).execute(context);

test('set variable returns a typed variable patch and rejects unsafe names', async () => {
    const result = await run(SetVariableNode, 'setVariable', {
        variableName: 'score', variableValue: '42', valueType: 'number'
    });
    assert.equal(result.value, 42);
    assert.deepEqual(result.variables, { score: 42 });

    const failure = await run(SetVariableNode, 'setVariable', {
        variableName: '__proto__', variableValue: 'x', valueType: 'string'
    });
    assert.equal(failure.success, false);
    assert.equal(failure.errorCode, 'VARIABLE_FAILED');
});

test('format response creates a safe response envelope', async () => {
    const result = await run(FormatResponseNode, 'formatResponse', {
        mode: 'json',
        jsonTemplate: '{"ok":true}',
        statusCode: 201,
        headers: '{"Cache-Control":"no-store"}'
    });
    assert.equal(result.statusCode, 201);
    assert.deepEqual(result.output, { ok: true });
    assert.equal(result.headers['Content-Type'], 'application/json');
    assert.equal(result.headers['Cache-Control'], 'no-store');

    assert.throws(() => buildResponse({ mode: 'template', template: 'x', statusCode: 700 }), /between 100 and 599/);
});

test('logger returns structured metadata and redacts sensitive context', async () => {
    const safe = redact({ token: 'secret-value', nested: { message: 'visible' } });
    assert.equal(safe.token, '[redacted]');
    assert.equal(safe.nested.message, 'visible');

    const result = await run(LoggerNode, 'log', {
        logMessage: 'hello', logLevel: 'info', includeContext: true
    }, { apiKey: 'hidden' });
    assert.equal(result.success, true);
    assert.equal(result.logEntry.context.apiKey, '[redacted]');
});
