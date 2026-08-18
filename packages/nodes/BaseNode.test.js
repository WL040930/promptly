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

test('canonical workflow expressions resolve email recipient and mixed body at runtime', () => {
    const node = new BaseNode('email_1', 'action', 'email', {
        to: { $expr: 'reference', v: 1, nodeId: 'form_trigger', path: ['fields', 'f_email'] },
        body: {
            $expr: 'template',
            v: 1,
            parts: [
                { text: 'Hi ' },
                { reference: { $expr: 'reference', v: 1, nodeId: 'form_trigger', path: ['fields', 'f_name'] } }
            ]
        }
    });
    const resolved = node.getResolvedConfig({ form_trigger: { fields: { f_email: 'person@example.com', f_name: 'Sam' } } });

    assert.equal(resolved.to, 'person@example.com');
    assert.equal(resolved.body, 'Hi Sam');
});

test('BaseNode exposes the selected connection payload without leaking runtime internals', () => {
    const node = new BaseNode('ai_1', 'ai', 'aiTask', {});
    const context = {
        __runtime: {
            inputs: {
                ai_1: { inputData: { fields: { comment: 'Too slow' } } }
            }
        }
    };

    assert.deepEqual(node.getRuntimeInput(context, 'inputData'), { fields: { comment: 'Too slow' } });
    assert.equal(Object.keys(context).includes('__runtime'), true);
});
