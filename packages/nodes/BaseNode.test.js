import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseNode } from './BaseNode.js';

test('BaseNode refuses to execute a config with an unresolved template variable', () => {
    const node = new BaseNode('email_1', 'action', 'email', { to: '{{fields.f_email}}' });

    assert.throws(
        () => node.getResolvedConfig({}),
        error => error.code === 'WORKFLOW_VARIABLE_UNRESOLVED'
            && error.unresolvedVariables[0].path === 'config.to'
    );
});
