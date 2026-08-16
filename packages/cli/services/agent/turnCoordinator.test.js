import test from 'node:test';
import assert from 'node:assert/strict';
import { clarificationStateForAnswer, decidePendingTurn } from './turnCoordinator.js';

const pending = {
    kind: 'respondent_email_field',
    question: { options: [{ id: 'email', label: 'Email' }, { id: 'work_email', label: 'Work email' }] }
};

const pendingSheetDestination = {
    kind: 'awaiting_agent_clarification',
    question: {
        text: 'Please specify the Google Sheet where responses should be appended, or create a new sheet.',
        options: [{ id: 'createSpreadsheet', label: 'Create a new Google Sheet' }]
    }
};

const pendingFormTarget = {
    kind: 'form_target',
    question: {
        text: 'Which form should trigger the workflow?',
        options: [{ id: 'formId', type: 'text', label: 'Form name or ID', required: true }]
    }
};

test('routes an exact clarification option back to the pending run', () => {
    assert.deepEqual(decidePendingTurn({ message: '2', pending }), { kind: 'clarification_answer', answer: '2' });
});

test('routes a natural-language new Sheet answer back to the pending clarification', () => {
    assert.deepEqual(decidePendingTurn({ message: 'create a new google sheet', pending: pendingSheetDestination }), {
        kind: 'clarification_answer',
        answer: 'create a new google sheet'
    });
    assert.deepEqual(clarificationStateForAnswer({ message: 'create a new google sheet', pending: pendingSheetDestination }), {
        createSpreadsheet: 'create'
    });
});

test('stores a free-text form target in the structured clarification state', () => {
    assert.deepEqual(clarificationStateForAnswer({ message: 'Job Application', pending: pendingFormTarget }), {
        formId: 'Job Application'
    });
});

test('does not feed a greeting into a pending clarification', () => {
    assert.deepEqual(decidePendingTurn({ message: 'who are you', pending }), { kind: 'conversation' });
});

test('routes a new workflow request away from an old pending run', () => {
    assert.deepEqual(decidePendingTurn({ message: 'create a workflow from the form', pending }), {
        kind: 'new_action',
        message: 'create a workflow from the form'
    });
});
