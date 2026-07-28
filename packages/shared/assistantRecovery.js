const safeIssueMessage = issue => {
    const generatedWorkflowErrors = {
        WORKFLOW_EDIT_OPERATION_INVALID: 'Promptly generated an incomplete workflow step.',
        WORKFLOW_NODE_KEY_INVALID: 'Promptly selected a workflow step that is not available.',
        WORKFLOW_EDIT_GRAPH_INVALID: 'Promptly could not create valid connections between the workflow steps.',
        WORKFLOW_EDIT_PLAN_INVALID: 'Promptly generated workflow steps that could not be verified.',
        WORKFLOW_AI_NODE_SELECTION_REQUIRED: 'Promptly could not select the workflow steps needed for this request.',
        INVALID_WORKER_RESPONSE: 'The AI response was incomplete before any workflow steps were generated.',
        INVALID_OPERATIONS: 'The AI response did not include a list of workflow steps.',
        EMPTY_OPERATIONS: 'The AI response did not include any workflow steps to apply.',
        TOO_MANY_OPERATIONS: 'The AI response contained too many workflow steps to verify safely.',
        INVALID_OPERATION: 'One generated workflow step was incomplete.',
        AMBIGUOUS_SOURCE_HANDLE: 'An AI-generated connection did not specify which route it should leave from.',
        AMBIGUOUS_TARGET_HANDLE: 'An AI-generated connection did not specify which route it should enter.',
        UNKNOWN_SOURCE_HANDLE: 'An AI-generated connection used an unavailable outgoing route.',
        UNKNOWN_TARGET_HANDLE: 'An AI-generated connection used an unavailable incoming route.'
    };

    return generatedWorkflowErrors[issue?.code]
        || String(issue?.message || 'Promptly could not verify this part of the change.');
};

const cleanIssue = issue => ({
    ...(issue?.code ? { code: String(issue.code) } : {}),
    ...(issue?.path ? { path: String(issue.path) } : {}),
    message: safeIssueMessage(issue)
});

const has = (issues, ...codes) => issues.some(issue => codes.includes(issue.code));

const workflowGenerationIssueCodes = [
    'WORKFLOW_EDIT_OPERATION_INVALID',
    'WORKFLOW_NODE_KEY_INVALID',
    'WORKFLOW_EDIT_GRAPH_INVALID',
    'WORKFLOW_EDIT_PLAN_INVALID',
    'WORKFLOW_AI_NODE_SELECTION_REQUIRED'
];

const workflowConnectionIssueCodes = [
    'AMBIGUOUS_SOURCE_HANDLE',
    'AMBIGUOUS_TARGET_HANDLE',
    'UNKNOWN_SOURCE_HANDLE',
    'UNKNOWN_TARGET_HANDLE'
];

const workflowResponseIssueCodes = [
    'INVALID_WORKER_RESPONSE',
    'INVALID_OPERATIONS',
    'EMPTY_OPERATIONS',
    'TOO_MANY_OPERATIONS',
    'INVALID_OPERATION'
];

const recovery = ({ type, title, summary, steps = [], action, details, retryable = false, location = null }) => ({
    type,
    title,
    summary,
    steps,
    action,
    retryable,
    location,
    details
});

/**
 * Converts internal AI failures into durable, user-facing recovery guidance.
 * The returned object intentionally contains no provider output or prompts.
 */
export const buildAssistantRecovery = ({ surface = 'assistant', code, issues = [], context = {} } = {}) => {
    const safeIssues = (Array.isArray(issues) ? issues : []).slice(0, 3).map(cleanIssue);
    const primaryIssue = safeIssues[0] || null;
    const retryAction = context.retryText
        ? { type: 'retry', label: 'Try again' }
        : { type: 'focus_composer', label: 'Try again' };

    if (has(safeIssues, 'RESPONDENT_CONTACT_FIELD_MISSING')) {
        return recovery({
            type: 'missing_respondent_email',
            title: 'An email field is needed',
            summary: 'Promptly cannot send a reply to a form respondent until the linked form collects an email address.',
            steps: ['Add a required Email field to the linked form.', 'Use that field as the respondent email, then try this request again.'],
            action: context.formId ? { type: 'open_form', label: 'Open form', formId: context.formId, section: 'build' } : { type: 'focus_composer', label: 'Describe a different change' },
            details: safeIssues
        });
    }

    if (has(safeIssues, 'RESPONDENT_RECIPIENT_FIELD_AMBIGUOUS')) {
        return recovery({
            type: 'ambiguous_respondent_email',
            title: 'Choose the respondent email field',
            summary: 'The linked form has more than one possible email field, so Promptly cannot safely choose who should receive the message.',
            steps: ['Choose the respondent email field in the form settings.', 'Then try this request again.'],
            action: context.formId ? { type: 'open_form', label: 'Open form settings', formId: context.formId, section: 'settings' } : { type: 'focus_composer', label: 'Clarify the recipient' },
            details: safeIssues
        });
    }

    if (has(safeIssues, 'WORKFLOW_RESOURCE_UNAVAILABLE', 'GOOGLE_CONNECTION_REQUIRED', 'GOOGLE_RECONNECT_REQUIRED')) {
        return recovery({
            type: 'connection_required',
            title: 'A connected service needs attention',
            summary: 'Promptly could not verify one of the account resources needed for this change.',
            steps: ['Check the relevant connection in Settings.', 'Return here and try the request again.'],
            action: { type: 'open_connections', label: 'Open connections' },
            details: safeIssues
        });
    }

    if (has(safeIssues, 'WORKFLOW_RESOURCE_NOT_FOUND')) {
        return recovery({
            type: 'resource_not_found',
            title: 'A selected resource is no longer available',
            summary: 'Promptly could not find a selected account resource for this change.',
            steps: ['Choose an available resource in the workflow.', 'Then generate a new proposal.'],
            action: { type: 'focus_composer', label: 'Generate a new proposal' },
            details: safeIssues
        });
    }

    if (has(safeIssues, 'FORM_SUBMISSION_TRIGGER_MISSING', 'EMAIL_ACTION_MISSING', 'APPROVAL_NODE_MISSING', 'APPROVAL_BRANCH_EMAILS_MISSING', 'APPROVED_BRANCH_EMAIL_MISSING', 'REJECTED_BRANCH_EMAIL_MISSING', 'RESPONDENT_CONFIRMATION_DISCONNECTED', 'RESPONDENT_RECIPIENT_FIELD_INVALID', 'RESPONDENT_RECIPIENT_NOT_DYNAMIC')) {
        return recovery({
            type: 'workflow_setup_needed',
            title: 'This automation needs more setup',
            summary: primaryIssue?.message || 'Promptly could not complete the requested workflow safely.',
            steps: ['Review the required trigger, connection, and recipient details.', 'Try the request again once the missing setup is clear.'],
            action: { type: 'focus_composer', label: 'Clarify the change' },
            details: safeIssues
        });
    }

    if (['WORKFLOW_AI_STATE_CONFLICT', 'FORM_AI_STATE_CONFLICT', 'AUTOMATION_REVISION_CONFLICT', 'FORM_PROPOSAL_STALE'].includes(code)) {
        return recovery({
            type: 'stale_change',
            title: 'This item changed while Promptly was working',
            summary: 'No changes were made because the current version no longer matches the one Promptly reviewed.',
            steps: ['Review the latest version.', 'Generate a new proposal.'],
            action: retryAction,
            details: safeIssues,
            retryable: true
        });
    }

    if (['WORKFLOW_AI_RATE_LIMITED', 'FORM_AI_RATE_LIMITED', 'WORKFLOW_AI_PROVIDER_TIMEOUT', 'FORM_AI_PROVIDER_TIMEOUT', 'WORKFLOW_AI_PROVIDER_UNAVAILABLE', 'FORM_AI_PROVIDER_UNAVAILABLE', 'WORKFLOW_AI_STREAM_TIMEOUT', 'FORM_AI_STREAM_TIMEOUT', 'WORKFLOW_AI_STREAM_INCOMPLETE', 'FORM_AI_STREAM_INCOMPLETE', 'CHAT_AI_PROVIDER_FAILED', 'ASSISTANT_STREAM_TIMEOUT', 'ASSISTANT_STREAM_INCOMPLETE', 'ASSISTANT_STREAM_START_FAILED'].includes(code)) {
        return recovery({
            type: 'temporary_ai_problem',
            title: 'Promptly could not finish this request',
            summary: 'The AI service was temporarily unavailable or took too long to respond. No changes were made.',
            steps: ['Try the same request again in a moment.'],
            action: retryAction,
            details: safeIssues,
            retryable: true
        });
    }

    if (workflowResponseIssueCodes.includes(code) || has(safeIssues, ...workflowResponseIssueCodes)) {
        return recovery({
            type: 'workflow_response_incomplete',
            title: 'Promptly could not generate the workflow steps',
            summary: 'Your workflow and its nodes are not the problem. The AI returned an incomplete draft before it selected or changed any node. No changes were made.',
            steps: ['Try the same request again so Promptly can generate a complete set of steps.', 'If it keeps happening, break the request into two smaller changes.'],
            action: retryAction,
            location: 'AI proposal generation — no workflow node was changed.',
            details: safeIssues,
            retryable: true
        });
    }

    if (workflowConnectionIssueCodes.includes(code) || has(safeIssues, ...workflowConnectionIssueCodes)) {
        return recovery({
            type: 'workflow_connection_invalid',
            title: 'Promptly could not connect the workflow steps',
            summary: 'Your request is clear, but one of the proposed connections did not specify the correct route on a multi-route step. No changes were made.',
            steps: ['Try the same request again so Promptly can rebuild the connections.', 'If it keeps happening, say which branch should continue to each next step.'],
            action: retryAction,
            location: 'A connection between newly proposed workflow steps.',
            details: safeIssues,
            retryable: true
        });
    }

    if (workflowGenerationIssueCodes.includes(code) || has(safeIssues, ...workflowGenerationIssueCodes)) {
        return recovery({
            type: 'workflow_steps_invalid',
            title: 'Promptly could not build the workflow steps',
            summary: 'Your request is clear, but this attempt did not produce a valid workflow. No changes were made.',
            steps: ['Try the same request again so Promptly can rebuild the workflow steps.', 'If it keeps happening, name the form field that contains the email address.'],
            action: retryAction,
            details: safeIssues,
            retryable: true
        });
    }

    return recovery({
        type: 'proposal_not_ready',
        title: surface === 'form' ? 'The form changes are not ready yet' : surface === 'workflow' ? 'The workflow changes are not ready yet' : 'This request is not ready yet',
        summary: primaryIssue?.message || 'Promptly could not prepare a reliable change, so no changes were made.',
        steps: ['Review the details below.', 'Try again with any missing information.'],
        action: retryAction,
        details: safeIssues,
        retryable: true
    });
};
