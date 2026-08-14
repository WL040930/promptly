import test from 'node:test';
import assert from 'node:assert/strict';
import {
    expressionPreviewParts,
    previewValueItems,
    workflowExpressionPreviewParts,
    workflowPreviewFallbackText,
    workflowPreviewDisplayText,
    workflowTextFieldValue
} from './workflowPreviewValue.js';

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

test('workflow preview uses an upstream field label for canonical AI expressions', () => {
    const expression = { $expr: 'reference', v: 1, nodeId: 'form_1', path: ['fields', 'f_email'] };

    assert.deepEqual(workflowExpressionPreviewParts(expression, {
        availableVars: [{
            runtimePath: 'form_1.fields.f_email',
            nodeTitle: 'Event Registration',
            label: 'Email'
        }]
    }), [{
        reference: {
            label: 'Event Registration › Email',
            sourceLabel: 'Event Registration',
            valueLabel: 'Email',
            resolved: true,
            runtimeReference: 'form_1.fields.f_email'
        }
    }]);
});

test('workflow text fields keep valid expressions structured and show other objects as JSON', () => {
    const expression = { $expr: 'reference', v: 1, nodeId: 'form_1', path: ['fields', 'f_email'] };

    assert.equal(workflowTextFieldValue(expression), expression);
    assert.equal(workflowTextFieldValue({ recipient: 'ops@example.com' }), '{"recipient":"ops@example.com"}');
});

test('spreadsheet cells render canonical references as readable labels', () => {
    const expression = { $expr: 'reference', v: 1, nodeId: 'form_1', path: ['submittedAt'] };

    assert.equal(workflowPreviewDisplayText(expression, {
        availableVars: [{
            runtimePath: 'form_1.submittedAt',
            nodeTitle: 'Event Registration',
            label: 'Submitted At'
        }]
    }), 'Event Registration › Submitted At');
    assert.equal(workflowPreviewDisplayText(expression, {
        compact: true,
        availableVars: [{
            runtimePath: 'form_1.submittedAt',
            nodeTitle: 'Event Registration',
            label: 'Submitted At'
        }]
    }), 'Submitted At');
    assert.notEqual(workflowPreviewDisplayText(expression), '[object Object]');
});
