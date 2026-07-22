import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneWorkflowNodeForPaste } from './nodeClipboard.js';

test('pasted node keeps configuration while receiving a new identity and position', () => {
    const source = {
        id: 'email_1',
        type: 'action',
        subType: 'email',
        title: 'Send email',
        position: { x: 100, y: 200 },
        config: { to: '{{form.fields.email}}', headers: { priority: 'normal' } },
        schema: { inputs: [{ name: 'to' }] },
        selected: true,
        dragging: false
    };

    const copy = cloneWorkflowNodeForPaste(source, {
        id: 'email_2',
        title: 'Send email (2)',
        position: { x: 140, y: 240 }
    });

    assert.equal(copy.id, 'email_2');
    assert.equal(copy.title, 'Send email (2)');
    assert.deepEqual(copy.position, { x: 140, y: 240 });
    assert.deepEqual(copy.config, source.config);
    assert.deepEqual(copy.schema, source.schema);
    assert.equal(copy.selected, undefined);
    assert.equal(copy.dragging, undefined);

    copy.config.headers.priority = 'high';
    assert.equal(source.config.headers.priority, 'normal');
});

test('pasting an invalid node is a no-op', () => {
    assert.equal(cloneWorkflowNodeForPaste(null), null);
    assert.equal(cloneWorkflowNodeForPaste({ title: 'Missing ID' }), null);
});
