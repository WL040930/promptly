import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowAssistantInternals } from './workflowAssistant.js';

const { normalizeInput, isOutOfScope } = workflowAssistantInternals;

test('workflow assistant accepts workflow edits that reference form fields', () => {
    assert.equal(isOutOfScope('Set the confirmation email recipient to the required email form field'), false);
    assert.equal(isOutOfScope('Change the approval branch email'), false);
});

test('workflow assistant redirects edits belonging to another AI surface', () => {
    assert.equal(isOutOfScope('Create a new form'), true);
    assert.equal(isOutOfScope('Modify another workflow'), true);
    assert.equal(isOutOfScope('Delete my form fields'), true);
});

test('workflow assistant normalizes text and command input consistently', () => {
    assert.equal(normalizeInput(null, '  add an email step  '), 'add an email step');
    assert.equal(normalizeInput({ type: 'submit_text', text: '  update the email  ' }, ''), 'update the email');
    assert.equal(normalizeInput(null, ''), '');
});
