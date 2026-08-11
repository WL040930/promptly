import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFormReference } from './formReferenceResolver.js';

test('form reference resolver selects the named Event Registration form', () => {
    const result = resolveFormReference({
        request: 'When the Event Registration form is submitted, save the response to the Event Registration Google Sheet.',
        forms: [
            { id: 'form_event', title: 'Event Registration' },
            { id: 'form_contact', title: 'Contact Us' }
        ]
    });

    assert.deepEqual(result, {
        status: 'selected',
        form: { id: 'form_event', title: 'Event Registration' }
    });
});

test('form reference resolver selects a clear close title match', () => {
    const result = resolveFormReference({
        request: 'Save every event registration response to Sheets.',
        forms: [
            { id: 'form_event', title: 'Event Registrations' },
            { id: 'form_feedback', title: 'Product Feedback' }
        ]
    });

    assert.equal(result.status, 'selected');
    assert.equal(result.form.id, 'form_event');
});

test('form reference resolver asks the user when the best matches tie', () => {
    const result = resolveFormReference({
        request: 'When the registration form is submitted, save the response.',
        forms: [
            { id: 'form_event', title: 'Event Registration' },
            { id: 'form_member', title: 'Member Registration' }
        ]
    });

    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.options.map(option => option.id), ['form_event', 'form_member']);
});

test('form reference resolver does not guess from an unrelated request', () => {
    const result = resolveFormReference({
        request: 'Send a weekly summary email to the team.',
        forms: [{ id: 'form_contact', title: 'Contact Us' }]
    });

    assert.equal(result.status, 'missing');
    assert.deepEqual(result.options, []);
});
