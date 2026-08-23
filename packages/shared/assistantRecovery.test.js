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

test('workflow recovery can mark retry as a resumable active-work action', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_PROVIDER_TIMEOUT',
        context: { retryText: 'Build the feedback workflow.', resumeActiveWork: true }
    });

    assert.deepEqual(result.action, { type: 'retry', label: 'Try again', mode: 'resume_active_work' });
});

test('assistant-state conflicts do not claim that the form changed', () => {
    const result = buildAssistantRecovery({
        surface: 'form',
        code: 'FORM_AI_STATE_CONFLICT',
        context: { retryText: 'Add a section for contact details' }
    });

    assert.equal(result.type, 'assistant_state_conflict');
    assert.equal(result.title, 'The assistant conversation was updated');
    assert.doesNotMatch(result.summary, /form changed|current version no longer matches/i);
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

test('assistant recovery explains planner omissions without exposing a raw required-field error', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'REQUIRED', path: 'resourceChanges[0].title', message: 'A value is required.' }],
        context: { retryText: 'Save the registration response to a new Google Sheet.' }
    });

    assert.equal(result.details[0].message, 'Promptly generated an incomplete workflow value and needs to rebuild this part of the request.');
    assert.doesNotMatch(result.details[0].message, /A value is required/i);
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

test('assistant recovery gives conditional branch failures a specific retry path', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'WORKFLOW_CONDITION_BRANCH_OPERATION_REQUIRED', message: 'Use add_condition_branch to add a new Condition and its true/false outcomes.' }],
        context: { retryText: 'If attendance mode is Online, send joining instructions; otherwise send venue instructions.' }
    });

    assert.equal(result.type, 'conditional_branch_invalid');
    assert.equal(result.title, 'Promptly could not add the conditional branch');
    assert.equal(result.action.type, 'retry');
    assert.equal(result.retryable, true);
    assert.equal(result.details[0].message, 'Promptly needs to rebuild this conditional branch using its supported branch operation.');
});

test('assistant recovery does not make an explicitly rejected workflow draft applicable', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_VERIFICATION_FAILED',
        issues: [{ code: 'REQUIREMENT_NOT_SATISFIED', path: 'req_notify', message: 'The low-rating notification is missing.' }],
        context: { retryText: 'Build the feedback workflow.', resumeActiveWork: true }
    });

    assert.equal(result.type, 'workflow_verification_failed');
    assert.match(result.summary, /no changes were made/i);
    assert.deepEqual(result.action, { type: 'retry', label: 'Try again', mode: 'resume_active_work' });
    assert.equal(result.retryable, true);
    assert.equal(result.details[0].message, 'Promptly could not confirm that one requested workflow detail was satisfied.');
});

test('assistant recovery explains a missing approved route as a conditional workflow repair', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'WORKFLOW_APPROVAL_APPROVED_ACTION_INVALID', message: 'An approved action is required.' }],
        context: { retryText: 'Ask for approval before sending the compensation offer.' }
    });

    assert.equal(result.type, 'conditional_branch_invalid');
    assert.equal(result.title, 'Promptly could not add the conditional branch');
    assert.equal(result.action.type, 'retry');
});

test('assistant recovery sends a missing rating field back to the selected form', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'RATING_FIELD_MISSING',
        issues: [{ code: 'RATING_FIELD_MISSING', message: 'The selected form needs a rating field.' }],
        context: { formId: 'form_feedback' }
    });

    assert.equal(result.type, 'workflow_setup_needed');
    assert.equal(result.action.type, 'open_form');
    assert.equal(result.action.formId, 'form_feedback');
});

test('assistant recovery keeps an ambiguous generated branch reference actionable', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'WORKFLOW_SEMANTIC_REF_AMBIGUOUS', message: 'A generated control-flow step was named more than once.' }],
        context: { retryText: 'If attendance mode is Online, send joining instructions; otherwise send venue instructions.' }
    });

    assert.equal(result.type, 'conditional_branch_invalid');
    assert.equal(result.action.type, 'retry');
    assert.equal(result.details[0].message, 'Promptly could not identify a later route that refers to a newly generated branch step.');
});

test('assistant recovery hides internal IDs for unreachable workflow nodes', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{ code: 'UNREACHABLE_NODE', path: 'nodes[1]', message: 'Node "node_16695a0382d544babb28f1d79856e432" cannot be reached from the trigger.' }],
        context: { retryText: 'Save the form response to Sheets.' }
    });

    assert.equal(result.type, 'workflow_graph_invalid');
    assert.equal(result.title, 'Promptly could not connect all workflow steps');
    assert.equal(result.action.type, 'retry');
    assert.equal(result.details[0].message, 'Promptly could not connect all workflow steps to the trigger.');
    assert.doesNotMatch(result.details[0].message, /node_16695/i);
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

test('assistant recovery preserves an invalid workflow reference ahead of an empty repair draft', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [
            { code: 'WORKFLOW_NODE_REF_INVALID', message: "Unknown nodeRef 'n99'." },
            { code: 'EMPTY_OPERATIONS', message: 'An edit proposal must contain at least one operation.' }
        ],
        context: { retryText: 'Wait for approval before sending the email.' }
    });

    assert.equal(result.type, 'workflow_node_reference_invalid');
    assert.match(result.summary, /referred to a step/i);
    assert.equal(result.details[0].message, 'Promptly could not match one generated step to the current workflow.');
});

test('assistant recovery identifies a Google Sheet header/row contract mismatch', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'WORKFLOW_AI_UNSAFE_PROPOSAL',
        issues: [{
            code: 'INVALID_NODE_CONFIG_INVALID_DATA_GRID',
            path: 'nodes[1].config.headers',
            message: 'Header row must contain rows and columns.'
        }],
        context: { retryText: 'Save Event Registration responses to a Google Sheet.' }
    });

    assert.equal(result.type, 'spreadsheet_response_columns');
    assert.equal(result.title, 'Promptly could not prepare the Google Sheet columns');
    assert.match(result.summary, /different formats/i);
    assert.equal(result.action.type, 'retry');
});

test('assistant recovery gives Google connection blockers a direct connection action', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'GOOGLE_CONNECTION_REQUIRED',
        issues: [{ code: 'GOOGLE_CONNECTION_REQUIRED', message: 'Connect Google to browse spreadsheets and Gmail providers.' }]
    });

    assert.equal(result.type, 'connection_required');
    assert.equal(result.title, 'Connect Google to use this Sheet');
    assert.match(result.summary, /Google Sheets/);
    assert.deepEqual(result.action, { type: 'open_connections', label: 'Connect Google' });
});

test('assistant recovery distinguishes a Google reconnect from a first-time connection', () => {
    const result = buildAssistantRecovery({
        surface: 'workflow',
        code: 'GOOGLE_RECONNECT_REQUIRED',
        issues: [{ code: 'GOOGLE_RECONNECT_REQUIRED', message: 'Reconnect Google.' }]
    });

    assert.equal(result.title, 'Reconnect Google to use this Sheet');
    assert.equal(result.action.label, 'Reconnect Google');
    assert.match(result.summary, /reconnect your Google account/i);
});
