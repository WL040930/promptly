import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveGoogleFormResponseSource,
    resolveGoogleSheetRowSource
} from './resourceResolution.js';

const lookup = async ({ resource, params = {} }) => {
    if (resource === 'google-forms') {
        return { account: 'owner@example.com', options: [{ value: 'form_event', label: 'Event Registration' }] };
    }
    if (resource === 'google-form-response-sheet') {
        assert.equal(params.formId, 'form_event');
        return { metadata: { formId: 'form_event', formTitle: 'Event Registration', linkedSheetId: 'sheet_event' }, options: [{ value: 'sheet_event', label: 'Event Registration' }] };
    }
    if (resource === 'google-spreadsheets') {
        return { options: [{ value: 'sheet_event', label: 'Event Registration' }] };
    }
    if (resource === 'google-sheet-ranges') {
        assert.equal(params.spreadsheetId, 'sheet_event');
        return { options: [
            { value: "'Archive'!A1:Z100", label: 'Archive' },
            { value: "'Form Responses 1'!A1:Z100", label: 'Form Responses 1' }
        ] };
    }
    throw new Error(`Unexpected resource ${resource}`);
};

test('Google Form response resolution stages form, linked Sheet, then a suggested response tab', async () => {
    const chooseForm = await resolveGoogleFormResponseSource({ userId: 'user_1', resourceLookup: lookup, state: {} });
    assert.equal(chooseForm.status, 'clarification');
    assert.equal(chooseForm.clarification.inputs[0].type, 'resource_picker');
    assert.equal(chooseForm.clarification.inputs[0].id, 'googleFormId');

    const chooseRange = await resolveGoogleFormResponseSource({ userId: 'user_1', resourceLookup: lookup, state: { googleFormId: 'form_event' } });
    assert.equal(chooseRange.status, 'clarification');
    assert.equal(chooseRange.clarification.inputs[0].id, 'googleFormRange');
    assert.equal(chooseRange.clarification.inputs[0].defaultValue, "'Form Responses 1'!A1:Z100");
});

test('Google Form response resolution returns a trusted trigger binding after tab confirmation', async () => {
    const result = await resolveGoogleFormResponseSource({
        userId: 'user_1',
        resourceLookup: lookup,
        state: { googleFormId: 'form_event', googleFormRange: "'Form Responses 1'!A1:Z100" }
    });
    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.resourceSelections, { 'google-spreadsheets': 'sheet_event' });
    assert.deepEqual(result.source, {
        formId: 'form_event',
        formTitle: 'Event Registration',
        spreadsheetId: 'sheet_event',
        spreadsheetName: 'Event Registration',
        range: "'Form Responses 1'!A1:Z100",
        rangeName: 'Form Responses 1'
    });
});

test('Google Sheet row resolution starts with a searchable Sheet picker', async () => {
    const result = await resolveGoogleSheetRowSource({
        userId: 'user_1',
        resourceLookup: async ({ resource }) => {
            assert.equal(resource, 'google-spreadsheets');
            return {
                account: 'owner@example.com',
                options: [{ value: 'sheet_event', label: 'Event Registration responses' }]
            };
        },
        state: {},
        query: 'Event Registration'
    });

    assert.equal(result.status, 'clarification');
    assert.deepEqual(result.clarification.inputs[0], {
        id: 'googleSheetTriggerSpreadsheetId',
        type: 'resource_picker',
        label: 'Google Sheet',
        resource: 'google-spreadsheets',
        account: 'owner@example.com',
        options: [{ id: 'sheet_event', name: 'Event Registration responses', description: null }],
        searchable: true,
        query: 'Event Registration',
        allowCustom: true,
        customLabel: 'Paste Google Sheets URL or ID'
    });
});

test('Google Sheet row resolution returns a trusted trigger binding after tab confirmation', async () => {
    const result = await resolveGoogleSheetRowSource({
        userId: 'user_1',
        resourceLookup: async ({ resource, params = {} }) => {
            if (resource === 'google-spreadsheets') {
                return { options: [{ value: 'sheet_event', label: 'Event Registration responses' }] };
            }
            assert.equal(resource, 'google-sheet-ranges');
            assert.deepEqual(params, { spreadsheetId: 'sheet_event' });
            return { options: [{ value: "'Responses'!A1:Z100", label: 'Responses' }] };
        },
        state: {
            googleSheetTriggerSpreadsheetId: 'sheet_event',
            googleSheetTriggerRange: "'Responses'!A1:Z100"
        }
    });

    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.source, {
        spreadsheetId: 'sheet_event',
        spreadsheetName: 'Event Registration responses',
        range: "'Responses'!A1:Z100",
        rangeName: 'Responses'
    });
});
