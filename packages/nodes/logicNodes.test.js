import test from 'node:test';
import assert from 'node:assert/strict';
import DataTransformNode from './core-logic/data-manipulation/data-transform/index.js';
import ConditionNode, { evaluateCondition } from './core-logic/flow-control/condition/index.js';
import SwitchNode, { evaluateSwitch } from './core-logic/flow-control/switch/index.js';

const run = (NodeClass, subType, config, context = {}) => new NodeClass(
    `${subType}_test`,
    subType === 'condition' || subType === 'switch' ? 'logic' : 'logic',
    subType,
    config
).execute(context);

test('data transform supports typed numeric, string, and JSON operations', async () => {
    assert.deepEqual((await run(DataTransformNode, 'dataTransform', {
        operation: 'add', value: '12.5', operand: '2.5'
    })).result, 15);

    assert.equal((await run(DataTransformNode, 'dataTransform', {
        operation: 'replace', value: 'a|b|c', operand: 'a|x|y'
    })).result, 'x|y|b|c');

    assert.deepEqual((await run(DataTransformNode, 'dataTransform', {
        operation: 'set', value: '{"customer":{"name":"Old"}}', operand: 'customer.name="New"'
    })).result, { customer: { name: 'New' } });
});

test('data transform returns explicit failures for invalid operations and arithmetic', async () => {
    const divideFailure = await run(DataTransformNode, 'dataTransform', { operation: 'divide', value: 4, operand: 0 });
    assert.equal(divideFailure.success, false);
    assert.equal(divideFailure.errorCode, 'TRANSFORM_FAILED');

    const operationFailure = await run(DataTransformNode, 'dataTransform', { operation: 'does-not-exist', value: 'x' });
    assert.equal(operationFailure.success, false);
    assert.match(operationFailure.error, /Unsupported transform operation/);
});

test('condition evaluates strict, numeric, collection, and empty operators', () => {
    assert.equal(evaluateCondition({ valueA: 5, operator: 'equals', valueB: '5' }), false);
    assert.equal(evaluateCondition({ valueA: 5, operator: '==', valueB: '5' }), true);
    assert.equal(evaluateCondition({ valueA: 12, operator: 'greater_than', valueB: 10 }), true);
    assert.equal(evaluateCondition({ valueA: ['paid', 'new'], operator: 'contains', valueB: 'paid' }), true);
    assert.equal(evaluateCondition({ valueA: '', operator: 'empty', valueB: null }), true);
});

test('condition converts invalid numeric comparisons into node failures', async () => {
    const result = await run(ConditionNode, 'condition', {
        operator: 'greater_than', valueA: 'not-a-number', valueB: 2
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'CONDITION_FAILED');
    assert.equal(result.targetHandle, 'false');
});

test('switch supports JSON cases and deterministic default routing', async () => {
    const result = await run(SwitchNode, 'switch', {
        valueToTest: 'billing',
        cases: JSON.stringify([
            { value: 'support', handle: 'support' },
            { value: 'billing', handle: 'billing' }
        ]),
        defaultHandle: 'fallback'
    });
    assert.equal(result.targetHandle, 'billing');
    assert.equal(result.matchedCase.handle, 'billing');

    assert.equal(evaluateSwitch({ valueToTest: 'other', matchA: 'a', matchB: 'b' }).targetHandle, 'default');
});

test('switch rejects duplicate case handles', async () => {
    const result = await run(SwitchNode, 'switch', {
        valueToTest: 'a',
        cases: JSON.stringify([{ value: 'a', handle: 'same' }, { value: 'b', handle: 'same' }])
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'SWITCH_FAILED');
});
