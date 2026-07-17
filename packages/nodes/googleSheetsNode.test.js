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
    assert.deepEqual(parseJsonValue('{"x":1}', 'config'), { x: 1 });
    assert.equal(parseBoolean('true'), true);
    assert.match(buildSheetsUrl({ spreadsheetId, range: 'Sheet 1!A1:C3', operation: 'read', query: { majorDimension: 'ROWS' } }), /Sheet%201!A1%3AC3/);
});

test('Google Sheets connector rejects invalid configuration', () => {
    assert.throws(() => validateSpreadsheetId('short'), /Spreadsheet ID is invalid/);
    assert.throws(() => validateRange(''), /range is required/);
    assert.throws(() => validateValues('{"not":"rows"}'), /non-empty JSON array/);
    assert.throws(() => parseBoolean('maybe'), /true or false/);
});
