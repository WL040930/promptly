import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fieldBindingKey,
    formPrerequisiteDecision,
    isFormSubmissionRequest,
    needsAiSummary,
    ratingFieldCandidates,
    validateSummaryWorkflowContract
} from './workflowPrerequisites.js';

const feedbackForm = {
    id: 'form_feedback',
    title: 'Customer Feedback',
    fields: [
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'rating', label: 'Rating', type: 'rating', required: true },
        { id: 'comment', label: 'Comment', type: 'textarea', required: false }
    ]
};

test('detects a form-submission request without requiring a model plan', () => {
    assert.equal(isFormSubmissionRequest({ request: 'When a customer submits feedback, save the response.' }), true);
    assert.equal(isFormSubmissionRequest({ request: 'Build a workflow triggered by its submissions.' }), true);
    assert.equal(isFormSubmissionRequest({ request: 'Send a weekly summary email to support.' }), false);
    assert.equal(isFormSubmissionRequest({
        request: 'Add an AI node to summarize the comment.',
        workflow: { nodes: [{ subType: 'form-submission' }] }
    }), true);
    assert.equal(needsAiSummary('Summarize the customer comment.'), true);
});

test('finds rating fields and exposes canonical binding keys', () => {
    const candidates = ratingFieldCandidates(feedbackForm);
    assert.deepEqual(candidates.map(field => field.id), ['rating']);
    assert.equal(fieldBindingKey(feedbackForm, 'rating'), 'form_field_2');
});

test('resolves a named comment field for an AI summary', () => {
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, summarize the comment and email the summary.',
        formSchema: feedbackForm,
        state: {}
    });

    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.context, {
        ratingFieldId: null,
        respondentEmailFieldId: null,
        supportRecipient: null,
        summaryFieldId: 'comment',
        summaryFieldIds: ['comment'],
        summaryMode: 'fields'
    });
    assert.deepEqual(decision.inputs, []);
});

test('asks for a summary field when several long-form fields are possible', () => {
    const form = {
        ...feedbackForm,
        fields: [
            ...feedbackForm.fields,
            { id: 'details', label: 'Additional Details', type: 'textarea' }
        ]
    };
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, summarize the feedback.',
        formSchema: form,
        state: {}
    });

    assert.equal(decision.status, 'clarification');
    assert.deepEqual(decision.inputs.map(input => input.id), ['summaryFieldId']);
    assert.deepEqual(decision.inputs[0].options.map(option => option.id), ['comment', 'details']);
});

test('uses the full submission when explicitly requested', () => {
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, summarize the entire submission.',
        formSchema: feedbackForm,
        state: {}
    });

    assert.equal(decision.status, 'ready');
    assert.equal(decision.context.summaryMode, 'submission');
    assert.equal(decision.context.summaryFieldId, null);
});

test('validates the selected summary input and downstream AI response reference', () => {
    const nodes = [
        { id: 'form_1', subType: 'form-submission' },
        {
            id: 'summary_1',
            subType: 'aiTask',
            config: {
                taskType: 'summarize',
                prompt: {
                    $expr: 'template',
                    v: 1,
                    parts: [
                        { text: 'Summarize this comment: ' },
                        { reference: { $expr: 'reference', v: 1, nodeId: 'form_1', path: ['fields', 'comment'] } }
                    ]
                }
            }
        },
        {
            id: 'email_1',
            subType: 'email',
            config: {
                body: { $expr: 'reference', v: 1, nodeId: 'summary_1', path: ['response'] }
            }
        }
    ];

    assert.deepEqual(validateSummaryWorkflowContract({
        nodes,
        contract: { summaryInput: { mode: 'fields', fieldIds: ['comment'], bindingKeys: ['form_field_3'] } }
    }), []);
});

test('rejects a summary prompt that falls back to the whole submission', () => {
    const issues = validateSummaryWorkflowContract({
        nodes: [
            { id: 'form_1', subType: 'form-submission' },
            { id: 'summary_1', subType: 'aiTask', config: { taskType: 'summarize', prompt: 'Summarize the feedback.' } },
            { id: 'email_1', subType: 'email', config: { body: { $expr: 'reference', v: 1, nodeId: 'summary_1', path: ['response'] } } }
        ],
        contract: { summaryInput: { mode: 'fields', fieldIds: ['comment'], bindingKeys: ['form_field_3'] } }
    });

    assert.deepEqual(issues.map(issue => issue.code), ['AI_SUMMARY_INPUT_MISSING']);
});

test('requires a support recipient while resolving the single rating and respondent email fields', () => {
    const decision = formPrerequisiteDecision({
        request: 'When a customer submits feedback, notify support when the rating is 3 or below before sending a compensation offer.',
        formSchema: feedbackForm,
        respondentEmail: { field: feedbackForm.fields[0], candidates: [feedbackForm.fields[0]], ambiguous: false },
        state: {}
    });

    assert.equal(decision.status, 'clarification');
    assert.deepEqual(decision.context, {
        ratingFieldId: 'rating',
        respondentEmailFieldId: 'email',
        supportRecipient: null
    });
    assert.deepEqual(decision.inputs.map(input => input.id), ['supportRecipient']);
});

test('asks which rating field to use when several rating fields match', () => {
    const form = {
        ...feedbackForm,
        fields: [
            ...feedbackForm.fields,
            { id: 'service_rating', label: 'Service rating', type: 'rating', required: true }
        ]
    };
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, notify support when any rating is 3 or below.',
        formSchema: form,
        respondentEmail: { field: feedbackForm.fields[0], candidates: [feedbackForm.fields[0]], ambiguous: false },
        state: { supportRecipient: 'support@example.com' }
    });

    assert.equal(decision.status, 'clarification');
    assert.deepEqual(decision.inputs.map(input => input.id), ['ratingFieldId']);
    assert.deepEqual(decision.inputs[0].options.map(option => option.id), ['rating', 'service_rating']);
});

test('is ready after required form selections and a valid support recipient are supplied', () => {
    const decision = formPrerequisiteDecision({
        request: 'When a customer submits feedback, notify support when the rating is 3 or below before sending a compensation offer.',
        formSchema: feedbackForm,
        respondentEmail: { field: feedbackForm.fields[0], candidates: [feedbackForm.fields[0]], ambiguous: false },
        state: { supportRecipient: 'support@example.com' }
    });

    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.context, {
        ratingFieldId: 'rating',
        respondentEmailFieldId: 'email',
        supportRecipient: 'support@example.com'
    });
    assert.deepEqual(decision.inputs, []);
});

test('accepts an explicit compensation recipient without requiring a respondent email field', () => {
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, send a compensation offer after approval.',
        formSchema: { ...feedbackForm, fields: feedbackForm.fields.filter(field => field.type !== 'email') },
        respondentEmail: { field: null, candidates: [], ambiguous: false },
        state: { compensationRecipient: 'offers@example.com' }
    });

    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.context, {
        ratingFieldId: null,
        respondentEmailFieldId: null,
        supportRecipient: null,
        compensationRecipient: 'offers@example.com'
    });
    assert.deepEqual(decision.inputs, []);
});

test('asks again when an explicit compensation recipient is invalid', () => {
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, send a compensation offer.',
        formSchema: feedbackForm,
        respondentEmail: { field: feedbackForm.fields[0], candidates: [feedbackForm.fields[0]], ambiguous: false },
        state: { compensationRecipient: 'not-an-email' }
    });

    assert.equal(decision.status, 'clarification');
    assert.deepEqual(decision.inputs.map(input => input.id), ['compensationRecipient']);
});

test('blocks compensation workflows when the form has no respondent email field', () => {
    const decision = formPrerequisiteDecision({
        request: 'When feedback is submitted, send a compensation offer.',
        formSchema: { ...feedbackForm, fields: feedbackForm.fields.filter(field => field.type !== 'email') },
        respondentEmail: { field: null, candidates: [], ambiguous: false },
        state: {}
    });

    assert.equal(decision.status, 'blocked');
    assert.equal(decision.blockedReason, 'RESPONDENT_CONTACT_FIELD_MISSING');
});
