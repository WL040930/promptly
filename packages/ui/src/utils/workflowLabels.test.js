import assert from 'node:assert/strict';
import test from 'node:test';
import { displayWorkflowActionLabel, displayWorkflowNodeLabel, displayWorkflowResourceDetail, displayWorkflowResourceLabel } from './workflowLabels.js';

test('workflow labels hide internal resource identifiers', () => {
    assert.equal(displayWorkflowActionLabel('create_google_spreadsheet'), 'Create Google Sheet');
    assert.equal(displayWorkflowResourceLabel({ type: 'create_google_spreadsheet', title: 'contact form and save every submission to a new' }), 'Create Google Sheet');
    assert.equal(displayWorkflowResourceLabel({ type: 'create_google_sheet', title: 'contact form and save every submission to a new' }), 'Create Google Sheet');
    assert.equal(displayWorkflowResourceDetail({ type: 'create_google_spreadsheet', title: 'contact form and save every submission to a new', sheetTitle: 'Responses' }), 'Tab: Responses');
});

test('workflow labels handle node subtype and camelCase values', () => {
    assert.equal(displayWorkflowNodeLabel({ subType: 'form-submission' }), 'Form submission');
    assert.equal(displayWorkflowActionLabel('customCode'), 'Custom JavaScript');
    assert.equal(displayWorkflowActionLabel('send_email'), 'Send email');
    assert.equal(displayWorkflowActionLabel('action:googleSheets'), 'Google Sheets');
});

test('already readable labels remain readable', () => {
    assert.equal(displayWorkflowActionLabel('Google Sheets Action'), 'Google Sheets Action');
    assert.equal(displayWorkflowActionLabel('Promptly Form'), 'Promptly Form');
});
