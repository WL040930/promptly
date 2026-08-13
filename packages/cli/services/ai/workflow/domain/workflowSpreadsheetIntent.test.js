import test from 'node:test';
import assert from 'node:assert/strict';
import { namedSpreadsheetFromText, resolveSpreadsheetIntent, spreadsheetIdFromValue } from './workflowSpreadsheetIntent.js';

test('extracts a named Google Sheet destination from a save request', () => {
    assert.equal(
        namedSpreadsheetFromText('When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.'),
        'Event Registration'
    );
});

test('a clarification URL takes precedence over the request destination', () => {
    assert.deepEqual(resolveSpreadsheetIntent({
        request: 'Save the response to the Event Registration Google Sheet.',
        clarificationState: { spreadsheetId: 'https://docs.google.com/spreadsheets/d/sheet_123/edit#gid=0' }
    }), {
        mode: 'existing_selected', source: 'clarification', spreadsheetId: 'sheet_123'
    });
});

test('removing a pending Sheet creation recovers the original named destination', () => {
    assert.deepEqual(resolveSpreadsheetIntent({
        request: "Why need the Create Google Sheet? I don't think it needs one.",
        pendingProposal: { payload: { resourceIntent: { mode: 'create', source: 'request' } } },
        history: [{ sender: 'user', text: 'Save the response to the Event Registration Google Sheet.' }]
    }), {
        mode: 'existing_named', source: 'history', name: 'Event Registration', replacesProvisioning: true
    });
});

test('keeps unnamed spreadsheet requests eligible for a proposed creation', () => {
    assert.deepEqual(resolveSpreadsheetIntent({ request: 'Save each response to Google Sheets.' }), {
        mode: 'unnamed', source: 'request'
    });
    assert.equal(spreadsheetIdFromValue('sheet_123'), 'sheet_123');
});

test('an explicit create request overrides a named destination', () => {
    assert.deepEqual(resolveSpreadsheetIntent({ request: 'Create a new Event Registration Google Sheet and save each response there.' }), {
        mode: 'create', source: 'request', name: 'Event Registration'
    });
});
