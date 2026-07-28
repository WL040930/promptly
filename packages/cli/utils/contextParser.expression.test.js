import test from 'node:test';
import assert from 'node:assert/strict';
import { deepResolve, findUnresolvedVariables } from './contextParser.js';

test('resolves canonical workflow expressions before node execution', () => {
    const expression = { $expr: 'reference', v: 1, nodeId: 'form_1', path: ['fields', 'f_email'] };
    assert.equal(deepResolve(expression, { form_1: { fields: { f_email: 'person@example.com' } } }), 'person@example.com');
    assert.equal(findUnresolvedVariables(deepResolve(expression, {}))[0].token, 'workflow expression');
});
