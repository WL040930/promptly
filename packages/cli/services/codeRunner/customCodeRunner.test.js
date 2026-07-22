import test from 'node:test';
import assert from 'node:assert/strict';
import { runCustomCode, validateCustomCode } from './customCodeRunner.js';

test('custom code validation rejects restricted APIs before spawning a worker', () => {
    assert.deepEqual(validateCustomCode({ code: 'return process.env;' }), {
        valid: false,
        error: 'Custom JavaScript contains a restricted global or API.'
    });
});

test('custom code returns JSON data and capped logs through the worker seam', async () => {
    const result = await runCustomCode({
        code: 'console.log("hello", input.amount); return { total: input.amount * 2 };',
        input: { amount: 4 }
    });
    assert.deepEqual(result.output, { total: 8 });
    assert.equal(result.logs[0].message, 'hello 4');
});
