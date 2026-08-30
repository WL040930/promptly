import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ONBOARDING_DEMO_KEY,
    assertWritableWorkspaceRecord,
    demoKeyForScope,
    parseWorkspaceScope,
    workspaceWhere
} from './workspaceScope.js';

test('workspace scopes default to an isolated live workspace', () => {
    assert.equal(parseWorkspaceScope(), 'live');
    assert.equal(parseWorkspaceScope('LIVE'), 'live');
    assert.equal(parseWorkspaceScope('unexpected'), 'live');
    assert.equal(demoKeyForScope('live'), null);
    assert.equal(demoKeyForScope('demo'), ONBOARDING_DEMO_KEY);
});

test('workspace ownership filters separate live and sample records', () => {
    assert.deepEqual(workspaceWhere({ userId: 'user-1', scope: 'live' }), { userId: 'user-1', demoKey: null });
    assert.deepEqual(workspaceWhere({ userId: 'user-1', scope: 'demo', extra: { id: 'sample-1' } }), {
        id: 'sample-1',
        userId: 'user-1',
        demoKey: ONBOARDING_DEMO_KEY
    });
});

test('sample records are rejected by the write guard', () => {
    assert.doesNotThrow(() => assertWritableWorkspaceRecord({ demoKey: null }));
    assert.throws(
        () => assertWritableWorkspaceRecord({ demoKey: ONBOARDING_DEMO_KEY }),
        error => error.code === 'DEMO_WORKSPACE_READ_ONLY' && error.status === 409
    );
});
