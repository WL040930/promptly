import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FORM_RESPONSE_SHEET_DESTINATIONS,
    resolveFormResponseSheetDestination,
    validateFormResponseSheetDestination
} from './formResponseSheetDestination.js';

const formTrigger = { id: 'form', type: 'trigger', subType: 'form-submission', nodeKey: 'trigger:form-submission' };
const runtimeCreator = { id: 'create', type: 'action', subType: 'googleSheetsCreate', nodeKey: 'action:googleSheetsCreate' };
const append = { id: 'append', type: 'action', subType: 'googleSheets', nodeKey: 'action:googleSheets' };
const provisionedSheet = { type: 'create_google_spreadsheet', ref: 'responses', title: 'Event Registration' };

test('one-time form response Sheet provisioning rejects a runtime Sheet creator', () => {
    const input = {
        nodes: [formTrigger, runtimeCreator, append],
        resourceChanges: [provisionedSheet],
        spreadsheetIntent: { mode: 'create', source: 'clarification', name: 'Event Registration' },
        capabilities: []
    };

    assert.equal(resolveFormResponseSheetDestination(input), FORM_RESPONSE_SHEET_DESTINATIONS.provisionOnce);
    assert.deepEqual(validateFormResponseSheetDestination(input).map(issue => issue.code), [
        'WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN'
    ]);
});

test('per-submission form response Sheets reject one-time provisioning', () => {
    const input = {
        nodes: [formTrigger, runtimeCreator, append],
        resourceChanges: [provisionedSheet],
        capabilities: ['per_submission_spreadsheet']
    };

    assert.equal(resolveFormResponseSheetDestination(input), FORM_RESPONSE_SHEET_DESTINATIONS.perSubmission);
    assert.deepEqual(validateFormResponseSheetDestination(input).map(issue => issue.code), [
        'WORKFLOW_FORM_RESPONSE_PROVISIONING_FORBIDDEN'
    ]);
});

test('an existing form response Sheet rejects a runtime creator', () => {
    const input = {
        nodes: [formTrigger, runtimeCreator, append],
        spreadsheetIntent: { mode: 'existing_selected', spreadsheetId: 'sheet_event' }
    };

    assert.equal(resolveFormResponseSheetDestination(input), FORM_RESPONSE_SHEET_DESTINATIONS.existing);
    assert.deepEqual(validateFormResponseSheetDestination(input).map(issue => issue.code), [
        'WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN'
    ]);
});

test('a non-form workflow can still create Sheets at runtime', () => {
    const input = { nodes: [runtimeCreator] };
    assert.equal(resolveFormResponseSheetDestination(input), FORM_RESPONSE_SHEET_DESTINATIONS.none);
    assert.deepEqual(validateFormResponseSheetDestination(input), []);
});

test('a runtime creator nested inside a form branch is also rejected', () => {
    const input = {
        nodes: [formTrigger],
        resourceChanges: [provisionedSheet],
        spreadsheetIntent: { mode: 'create', source: 'clarification' },
        operations: [{
            op: 'add_condition_branch',
            whenTrue: runtimeCreator,
            whenFalse: append
        }]
    };

    assert.deepEqual(validateFormResponseSheetDestination(input).map(issue => issue.code), [
        'WORKFLOW_FORM_RESPONSE_RUNTIME_SHEET_CREATOR_FORBIDDEN'
    ]);
});
