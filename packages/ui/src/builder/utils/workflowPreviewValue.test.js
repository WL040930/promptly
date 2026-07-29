import test from 'node:test';
import assert from 'node:assert/strict';
import { expressionPreviewParts, previewValueItems, workflowPreviewFallbackText } from './workflowPreviewValue.js';

test('workflow preview keeps structured row values as individual renderable items', () => {
    const values = [
        { $expr: 'reference', v: 1, nodeId: 'form', path: ['submittedAt'] },
        { $expr: 'reference', v: 1, nodeId: 'form', path: ['responseId'] },
        { $expr: 'reference', v: 1, nodeId: 'form', path: ['fields', 'name'] },
        { $expr: 'reference', v: 1, nodeId: 'form', path: ['fields', 'email'] }
    ];

    assert.deepEqual(previewValueItems(values), values);
    assert.equal(workflowPreviewFallbackText({ $provision: 'sheet1' }), '{"$provision":"sheet1"}');
});

test('workflow preview treats a direct expression description as a visible reference', () => {
    assert.deepEqual(expressionPreviewParts({
        parts: [{ label: 'Event registration › Email', resolved: true }]
    }), [{ reference: { label: 'Event registration › Email', resolved: true } }]);
});
