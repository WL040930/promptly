import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveClarificationSubmission,
    updateClarificationDraft
} from './clarificationContract.js';

const destinationInputs = [
    {
        id: 'spreadsheetId',
        type: 'text',
        label: 'Existing Google Sheet URL or ID',
        alternativeGroup: 'spreadsheetDestination'
    },
    {
        id: 'createSpreadsheet',
        type: 'resource_choice',
        label: 'Create a new Sheet',
        alternativeGroup: 'spreadsheetDestination',
        options: [{ id: 'create', name: 'Create a new Event Registration Sheet' }]
    }
];

test('one answer completes a required alternative clarification group', () => {
    const result = resolveClarificationSubmission({
        inputs: destinationInputs,
        state: { createSpreadsheet: 'create' }
    });

    assert.equal(result.complete, true);
    assert.deepEqual(result.state, { createSpreadsheet: 'create' });
    assert.deepEqual(result.answers, [{
        id: 'createSpreadsheet',
        label: 'Create a new Sheet',
        answer: 'Create a new Event Registration Sheet'
    }]);
    assert.equal(result.decisionCount, 1);
});

test('clarification completion rejects missing required answers and conflicting alternatives', () => {
    const required = resolveClarificationSubmission({
        inputs: [
            { id: 'provider', type: 'text', label: 'Provider' },
            { id: 'recipient', type: 'text', label: 'Recipient' }
        ],
        state: { provider: 'Gmail' }
    });
    assert.equal(required.complete, false);
    assert.deepEqual(required.missingInputIds, ['recipient']);

    const conflict = resolveClarificationSubmission({
        inputs: destinationInputs,
        state: { spreadsheetId: 'sheet_123', createSpreadsheet: 'create' }
    });
    assert.equal(conflict.complete, false);
    assert.deepEqual(conflict.conflictingGroups, ['spreadsheetDestination']);
});

test('updating one alternative clears its peers without submitting the draft', () => {
    assert.deepEqual(updateClarificationDraft({
        inputs: destinationInputs,
        state: { spreadsheetId: 'sheet_123' },
        inputId: 'createSpreadsheet',
        value: 'create'
    }), { createSpreadsheet: 'create' });
});

test('resource pickers accept a saved default while still requiring an explicit submit', () => {
    const result = resolveClarificationSubmission({
        inputs: [{
            id: 'range',
            type: 'resource_picker',
            label: 'Response tab',
            options: [{ id: "'Form Responses 1'!A1", name: 'Form Responses 1' }]
        }],
        state: { range: "'Form Responses 1'!A1" }
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.answers, [{ id: 'range', label: 'Response tab', answer: 'Form Responses 1' }]);
});
