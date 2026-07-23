import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePendingTurn } from './turnCoordinator.js';

const pending = {
    kind: 'respondent_email_field',
    question: { options: [{ id: 'email', label: 'Email' }, { id: 'work_email', label: 'Work email' }] }
};

test('routes an exact clarification option back to the pending run', () => {
    assert.deepEqual(decidePendingTurn({ message: '2', pending }), { kind: 'clarification_answer', answer: '2' });
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

