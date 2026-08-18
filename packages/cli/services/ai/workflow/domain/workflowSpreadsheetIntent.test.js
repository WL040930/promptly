import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isExplicitPerSubmissionSpreadsheetRequest,
    namedSpreadsheetFromText,
    resolveSpreadsheetIntent,
    spreadsheetIdFromValue
} from './workflowSpreadsheetIntent.js';

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

test('requires an existing Sheet for unnamed spreadsheet requests', () => {
    assert.deepEqual(resolveSpreadsheetIntent({ request: 'Save each response to Google Sheets.' }), {
        mode: 'requires_existing', source: 'request'
    });
    assert.equal(spreadsheetIdFromValue('sheet_123'), 'sheet_123');
});

test('an explicit create request overrides a named destination', () => {
    assert.deepEqual(resolveSpreadsheetIntent({ request: 'Create a new Event Registration Google Sheet and save each response there.' }), {
        mode: 'create', source: 'request', name: 'Event Registration'
    });
});

test('does not treat saving every submission to a new Sheet as one Sheet per submission', () => {
    assert.equal(
        isExplicitPerSubmissionSpreadsheetRequest('Create a contact form and save every submission to a new Google Sheet'),
        false
    );
    assert.equal(
        isExplicitPerSubmissionSpreadsheetRequest('Save all responses to a new Google Sheet.'),
        false
    );
});

test('recognizes explicit per-submission Sheet creation', () => {
    for (const request of [
        'Create a separate Google Sheet for each form submission.',
        'For every response, create a new Sheet.',
        'Create one Sheet per submission.'
    ]) {
        assert.equal(isExplicitPerSubmissionSpreadsheetRequest(request), true, request);
    }
});

test('a structured Create answer keeps the original destination name instead of parsing the button label', () => {
    assert.deepEqual(resolveSpreadsheetIntent({
        request: 'Or create a new Sheet: Create a new Event Registration Sheet',
        sourceText: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
        clarificationState: { createSpreadsheet: 'create' }
    }), {
        mode: 'create', source: 'clarification', name: 'Event Registration'
    });
});

test('a resource picker Create choice is treated as a structured create decision', () => {
    assert.deepEqual(resolveSpreadsheetIntent({
        request: 'create',
        sourceText: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
        clarificationState: { spreadsheetId: 'create' }
    }), {
        mode: 'create', source: 'clarification', name: 'Event Registration'
    });
});

test('an applied workflow destination wins over a legacy clarification receipt in history', () => {
    assert.deepEqual(resolveSpreadsheetIntent({
        request: 'Request my approval before saving the response.',
        currentWorkflow: {
            nodes: [{
                id: 'append_response',
                subType: 'googleSheets',
                title: 'Save Event Registration response',
                config: { spreadsheetId: 'sheet_event_registration', range: "'Responses'!A1" }
            }]
        },
        history: [{ sender: 'user', text: 'Create a new Sheet: Create a new “Event Registration” Sheet' }]
    }), {
        mode: 'existing_selected',
        source: 'current_workflow',
        spreadsheetId: 'sheet_event_registration',
        name: 'Save Event Registration response',
        range: "'Responses'!A1"
    });
});

test('legacy Create Sheet receipts do not include their input label in the Sheet name', () => {
    assert.equal(
        namedSpreadsheetFromText('Create a new Sheet: Create a new “Event Registration” Sheet'),
        'Event Registration'
    );
});
