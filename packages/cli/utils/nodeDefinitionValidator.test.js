import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNodeDefinition } from './nodeDefinitionValidator.js';

const definition = configSchema => ({
    metadata: { type: 'action', subType: 'example', title: 'Example' },
    configSchema,
    NodeClass: class { async execute() {} }
});

test('node definition validation accepts conditional, resource-backed inputs', () => {
    const issues = validateNodeDefinition(definition({
        inputs: [
            { name: 'operation', type: 'select', options: ['read', 'write'] },
            { name: 'resourceId', type: 'resource-select', resource: 'forms', showWhen: { field: 'operation', equals: 'read' } }
        ],
        outputs: []
    }));
    assert.deepEqual(issues, []);
});

test('node definition validation rejects shallow or broken UI contracts', () => {
    const issues = validateNodeDefinition(definition({
        inputs: [
            { name: 'unknown', type: 'mystery' },
            { name: 'resource', type: 'resource-select' },
            { name: 'choice', type: 'select', showWhen: { field: 'missing', equals: true } }
        ],
        outputs: []
    }));
    assert.deepEqual(new Set(issues.map(item => item.code)), new Set([
        'INVALID_INPUT_TYPE',
        'MISSING_INPUT_RESOURCE',
        'MISSING_INPUT_OPTIONS',
        'UNKNOWN_CONDITION_FIELD'
    ]));
});
