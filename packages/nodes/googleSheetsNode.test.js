import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSheetsUrl,
    parseBoolean,
    parseJsonValue,
    validateRange,
    validateSpreadsheetId,
    validateValues
} from './integrations/external-apps/google-sheets-action/googleSheetsConnector.js';

test('Google Sheets connector validates bounded range values', () => {
    const spreadsheetId = 'a'.repeat(30);
    assert.equal(validateSpreadsheetId(spreadsheetId), spreadsheetId);
    assert.equal(validateRange('Sheet 1!A1:C3'), 'Sheet 1!A1:C3');
    assert.deepEqual(validateValues('[["Name","Status"],["Ada","Active"]]'), [['Name', 'Status'], ['Ada', 'Active']]);
    assert.deepEqual(
        validateValues([['Name', 'Diet'], ['Ada', ['Vegetarian', 'Vegan']]]),
        [['Name', 'Diet'], ['Ada', 'Vegetarian, Vegan']]
    );
    assert.deepEqual(validateValues([['Name', 'Diet'], ['Ada', []]]), [['Name', 'Diet'], ['Ada', '']]);
    assert.deepEqual(parseJsonValue('{"x":1}', 'config'), { x: 1 });
    assert.equal(parseBoolean('true'), true);
    assert.match(buildSheetsUrl({ spreadsheetId, range: 'Sheet 1!A1:C3', operation: 'read', query: { majorDimension: 'ROWS' } }), /Sheet%201!A1%3AC3/);
});

test('Google Sheets connector serializes Date values from form-submission triggers', () => {
    const submittedAt = new Date('2026-08-12T03:47:06.288Z');

    assert.deepEqual(validateValues([[submittedAt, 'Lim']]), [[
        '2026-08-12T03:47:06.288Z',
        'Lim'
    ]]);
});

test('Google Sheets connector rejects invalid configuration', () => {
    assert.throws(() => validateSpreadsheetId('short'), /Spreadsheet ID is invalid/);
    assert.throws(() => validateRange(''), /range is required/);
    assert.throws(() => validateValues('{"not":"rows"}'), /non-empty JSON array/);
    assert.throws(() => validateValues([['Ada', { dietary: ['Vegetarian'] }]]), /Values\[0\]\[1\].*scalar/);
    assert.throws(() => validateValues([['Ada', [['Vegetarian']]]]), /Values\[0\]\[1\].*flat array/);
    assert.throws(() => validateValues([['Ada', Number.NaN]]), /Values\[0\]\[1\].*scalar/);
    assert.throws(() => parseBoolean('maybe'), /true or false/);
});
