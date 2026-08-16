import test from 'node:test';
import assert from 'node:assert/strict';
import { clarificationMessageData } from './clarificationMessage.js';

test('persisted Form AI clarifications keep their canonical inputs after refresh', () => {
    const result = clarificationMessageData({
        kind: 'clarification',
        payload: {
            inputs: [{
                id: 'event_type',
                type: 'radio',
                label: 'Event type',
                options: ['In-person', 'Virtual']
            }]
        }
    });

    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].id, 'event_type');
});

test('empty persisted form-target clarifications still render an answer field', () => {
    const result = clarificationMessageData({
        kind: 'clarification',
        text: 'Which form should trigger the workflow?',
        payload: {
            options: [{ id: 'form-target', type: 'form_choice', label: 'Choose a form', options: [] }]
        }
    });

    assert.deepEqual(result.options, [{
        id: 'formId',
        type: 'text',
        label: 'Form name or ID',
        placeholder: 'Enter a form name or ID…',
        required: true
    }]);
});
