import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowPreviewDiffNodes } from './workflowPreviewDiff.js';

test('workflow preview exposes readable before and after parameter changes', () => {
    const [node] = buildWorkflowPreviewDiffNodes({
        currentNodes: [{ id: 'email_1', type: 'action', subType: 'email', title: 'Thank you email', position: { x: 0, y: 0 }, config: { to: '{{form.email}}', subject: 'Thanks', enabled: true } }],
        proposedNodes: [{ id: 'email_1', type: 'action', subType: 'email', title: 'Thank you email', position: { x: 300, y: 500 }, config: { to: '{{form.email}}', subject: 'We received your request', enabled: false } }]
    });

    assert.equal(node._diffStatus, 'updated');
    assert.deepEqual(node._parameterChanges, [
        { key: 'config.subject', label: 'Subject', before: 'Thanks', after: 'We received your request' },
        { key: 'config.enabled', label: 'Enabled', before: 'Yes', after: 'No' }
    ]);
});

test('workflow preview ignores position-only changes', () => {
    const [node] = buildWorkflowPreviewDiffNodes({
        currentNodes: [{ id: 'log_1', type: 'action', subType: 'log', title: 'Log request', position: { x: 0, y: 0 }, config: { message: 'Received' } }],
        proposedNodes: [{ id: 'log_1', type: 'action', subType: 'log', title: 'Log request', position: { x: 300, y: 500 }, config: { message: 'Received' } }]
    });

    assert.equal(node._diffStatus, 'unchanged');
    assert.deepEqual(node._parameterChanges, []);
});

test('workflow preview lists the configuration that a newly added node will use', () => {
    const [node] = buildWorkflowPreviewDiffNodes({
        currentNodes: [],
        proposedNodes: [{
            id: 'email_1', type: 'action', subType: 'email', title: 'Thank you email',
            config: { to: '{{form_trigger.fields.email}}', subject: 'We received your request', body: 'Thank you for contacting us.' }
        }]
    });

    assert.equal(node._diffStatus, 'added');
    assert.deepEqual(node._parameterSnapshot, [
        { key: 'config.to', label: 'To', value: '{{form_trigger.fields.email}}' },
        { key: 'config.subject', label: 'Subject', value: 'We received your request' },
        { key: 'config.body', label: 'Body', value: 'Thank you for contacting us.' }
    ]);
});
