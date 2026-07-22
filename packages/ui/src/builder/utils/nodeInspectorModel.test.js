import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeInspectorModel } from './nodeInspectorModel.js';

test('inspector model groups visible fields and exposes readiness issues by field', () => {
    const result = buildNodeInspectorModel({ inputs: [
        { name: 'operation', type: 'select', group: 'Action', options: ['read', 'write'] },
        { name: 'record', type: 'resource-select', resource: 'forms', group: 'Action', required: true, showWhen: { field: 'operation', equals: 'write' } },
        { name: 'limit', type: 'number', group: 'Advanced', advanced: true, min: 1 }
    ] }, { operation: 'write', limit: 10 });
    assert.deepEqual(result.sections.map(section => [section.title, section.advanced]), [['Action', false], ['Advanced', true]]);
    assert.equal(result.validation.ready, false);
    assert.equal(result.issuesByField.record.code, 'MISSING_REQUIRED_CONFIG');
});

