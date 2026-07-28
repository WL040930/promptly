import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantRecovery } from './assistantRecovery.js';

test('assistant recovery directs respondent-email blockers to the linked form', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        issues: [{ code: 'RESPONDENT_CONTACT_FIELD_MISSING', message: 'The form must contain a required email field.' }],
        context: { formId: 'form_1' }
    });

    assert.equal(result.title, 'An email field is needed');
    assert.deepEqual(result.action, { type: 'open_form', label: 'Open form', formId: 'form_1', section: 'build' });
    assert.equal(result.details[0].code, 'RESPONDENT_CONTACT_FIELD_MISSING');
});

test('assistant recovery makes temporary provider failures retryable', () => {
    const result = buildAssistantRecovery({ surface: 'workflow', code: 'WORKFLOW_AI_PROVIDER_TIMEOUT', context: { retryText: 'Add an email step' } });

    assert.equal(result.type, 'temporary_ai_problem');
    assert.equal(result.retryable, true);
    assert.equal(result.action.type, 'retry');
});

test('assistant recovery keeps generic failure details safe and actionable', () => {
    const result = buildAssistantRecovery({
        surface: 'assistant',
        code: 'UNKNOWN',
        issues: [{ code: 'INTERNAL', path: 'nodes.0', message: 'A node is invalid.' }]
    });

    assert.equal(result.title, 'This request is not ready yet');
    assert.equal(result.details.length, 1);
    assert.equal(result.details[0].message, 'A node is invalid.');
});

test('assistant recovery hides incomplete operations nested in an unsafe workflow proposal', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'WORKFLOW_EDIT_OPERATION_INVALID', message: 'Every operation requires an op value.' }],
        context: { retryText: 'Check whether email is empty and send a thank-you email when it is not.' }
    });

    assert.equal(result.title, 'Promptly could not build the workflow steps');
    assert.equal(result.action.type, 'retry');
    assert.doesNotMatch(result.details[0].message, /op value/i);
});

test('assistant recovery explains an AI connection missing its route', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'AMBIGUOUS_TARGET_HANDLE', message: 'Choose an input route for node "node_48c85867ad5b467d94b48a7f2d83ba59".' }],
        context: { retryText: 'Check whether email is empty and send a thank-you email when it is not.' }
    });

    assert.equal(result.title, 'Promptly could not connect the workflow steps');
    assert.match(result.summary, /request is clear/i);
    assert.equal(result.action.type, 'retry');
    assert.doesNotMatch(result.details[0].message, /node_48c/i);
    assert.doesNotMatch(result.details[0].message, /input route/i);
});

test('assistant recovery explains when AI returns no workflow operations', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'INVALID_OPERATIONS', path: 'operations', message: 'Worker operations must be an array.' }],
        context: { retryText: 'Check whether email is empty and send a thank-you email when it is not.' }
    });

    assert.equal(result.title, 'Promptly could not generate the workflow steps');
    assert.match(result.summary, /not the problem/i);
    assert.equal(result.location, 'AI proposal generation — no workflow node was changed.');
    assert.equal(result.details[0].message, 'The AI response did not include a list of workflow steps.');
});
