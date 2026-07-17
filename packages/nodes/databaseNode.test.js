import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOrder,
    buildScopedWhere,
    getResourceDefinition,
    parseLimit,
    parseObject,
    requireRecordFilter,
    sanitizeWritableData
} from './integrations/external-apps/database-action/databaseConnector.js';

test('database connector scopes resources to the current user and rejects unsafe fields', () => {
    const definition = getResourceDefinition('forms');
    assert.deepEqual(buildScopedWhere({ definition, userId: 'user-1', filters: { id: 'form-1' } }), {
        userId: 'user-1',
        id: 'form-1'
    });
    assert.throws(() => buildScopedWhere({ definition, userId: 'user-1', filters: { userId: 'other-user' } }), /Unsupported filter/);
    assert.throws(() => sanitizeWritableData({ definition, data: { userId: 'other-user' } }), /cannot be written/);
});

test('database connector validates bounded reads and exact mutations', () => {
    const definition = getResourceDefinition('workflows');
    assert.deepEqual(parseObject('{"id":"w-1"}', 'filters'), { id: 'w-1' });
    assert.equal(parseLimit(100), 100);
    assert.deepEqual(buildOrder({ definition, orderBy: 'updatedAt', orderDirection: 'ASC' }), [['updatedAt', 'ASC']]);
    assert.throws(() => parseLimit(101), /between 1 and 100/);
    assert.throws(() => requireRecordFilter({ name: 'workflow' }), /exact "id" filter/);
    assert.throws(() => buildOrder({ definition, orderBy: 'nodes', orderDirection: 'DESC' }), /Unsupported order field/);
});
