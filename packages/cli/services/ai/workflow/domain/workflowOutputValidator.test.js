import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateWorkflowPlannerResult,
    validateWorkflowWorkerResult,
    validateWorkflowVerifierResult,
    summarizeWorkflowOutputIssues
} from './workflowOutputValidator.js';

// ---------------------------------------------------------------------------
// Planner validator
// ---------------------------------------------------------------------------

test('planner validator accepts a valid reply result', () => {
    const issues = validateWorkflowPlannerResult({ type: 'reply', message: 'Here is the current workflow.' });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a form inspection request with an exact form ID', () => {
    const issues = validateWorkflowPlannerResult({ type: 'inspect_form', formId: 'form_123' });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a Google Form response-source resolution request', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'resolve_resource',
        recipe: 'google_form_response_source',
        query: 'Event Registration'
    });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a Google Sheet new-row source resolution request', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'resolve_resource',
        recipe: 'google_sheet_row_source',
        query: 'Event Registration'
    });
    assert.deepEqual(issues, []);
});

test('planner validator rejects a form inspection request without a form ID', () => {
    const issues = validateWorkflowPlannerResult({ type: 'inspect_form' });
    assert.ok(issues.some(item => item.code === 'REQUIRED' && item.path === 'formId'));
});

test('planner validator accepts a valid message (clarification) result', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'message',
        message: 'Which email provider?',
        inputs: [{ id: 'q1', type: 'single_choice', label: 'Provider', options: ['Gmail', 'SendGrid'] }]
    });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a valid direct_plan result with operations', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'direct_plan',
        summary: 'Update subject.',
        requirements: [{ id: 'req_1', description: 'Set subject to Hello.' }],
        selectedNodeKeys: ['action:email'],
        capabilities: [],
        operations: [{ op: 'update_node', nodeRef: 'n1', updates: { config: { subject: 'Hello' } } }]
    });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a valid plan_complete result', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build a full workflow.',
        requirements: [{ id: 'req_1', description: 'Add a trigger.' }],
        selectedNodeKeys: ['trigger:webhook'],
        capabilities: []
    });
    assert.deepEqual(issues, []);
});

test('planner validator accepts a valid linear blueprint and rejects an unmapped requirement', () => {
    const valid = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build a webhook workflow.',
        requirements: [{ id: 'req_1', description: 'Receive a webhook and send an email.' }],
        selectedNodeKeys: ['trigger:webhook', 'action:email'],
        linearSteps: [
            { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_1'], config: {} },
            { ref: 'send_email', nodeKey: 'action:email', requirementIds: ['req_1'], config: { subject: 'New request' } }
        ],
        capabilities: []
    });
    assert.deepEqual(valid, []);

    const invalid = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build a webhook workflow.',
        requirements: [{ id: 'req_1', description: 'Receive a webhook.' }],
        selectedNodeKeys: ['trigger:webhook', 'action:email'],
        linearSteps: [
            { ref: 'webhook_trigger', nodeKey: 'trigger:webhook', requirementIds: ['req_2'], config: {} },
            { ref: 'send_email', nodeKey: 'action:email', requirementIds: ['req_2'], config: {} }
        ],
        capabilities: []
    });
    assert.ok(invalid.some(item => item.code === 'UNKNOWN_LINEAR_STEP_REQUIREMENT'));
    assert.ok(invalid.some(item => item.code === 'LINEAR_STEP_REQUIREMENT_UNMAPPED'));
});

test('planner validator accepts a proposed Google Sheet creation', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Save approved responses.',
        requirements: [{ id: 'req_1', description: 'Create a response spreadsheet.' }],
        selectedNodeKeys: ['action:googleSheets'],
        resourceChanges: [{ ref: 'responses_sheet', type: 'create_google_spreadsheet', title: 'Form responses', sheetTitle: 'Responses' }]
    });
    assert.deepEqual(issues, []);
});

test('planner validator rejects a spreadsheet change without a title', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete', summary: 'Save responses.', requirements: [{ id: 'req_1', description: 'Create a sheet.' }], selectedNodeKeys: [],
        resourceChanges: [{ ref: 'responses_sheet', type: 'create_google_spreadsheet' }]
    });
    assert.ok(issues.some(item => item.path === 'resourceChanges[0].title'));
});

test('planner validator rejects an unknown type', () => {
    const issues = validateWorkflowPlannerResult({ type: 'invent_workflow' });
    assert.ok(issues.some(i => i.code === 'INVALID_PLANNER_TYPE'));
});

test('planner validator rejects a reply without a message', () => {
    const issues = validateWorkflowPlannerResult({ type: 'reply', message: '' });
    assert.ok(issues.some(i => i.code === 'REQUIRED' && i.path === 'message'));
});

test('planner validator rejects message type with no inputs', () => {
    const issues = validateWorkflowPlannerResult({ type: 'message', message: 'Choose one', inputs: [] });
    assert.ok(issues.some(i => i.code === 'INVALID_CLARIFICATION_INPUTS'));
});

test('planner validator rejects choice input with no options', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'message',
        message: 'Choose one',
        inputs: [{ id: 'q1', type: 'single_choice', label: 'Provider', options: [] }]
    });
    assert.ok(issues.some(i => i.code === 'INVALID_CLARIFICATION_OPTIONS'));
});

test('planner validator rejects an unknown capability', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build.',
        requirements: [{ id: 'req_1', description: 'Do it.' }],
        selectedNodeKeys: [],
        capabilities: ['invent_magic']
    });
    assert.ok(issues.some(i => i.code === 'UNKNOWN_CAPABILITY'));
});

test('planner validator rejects the removed application review capability', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Review applications.',
        requirements: [{ id: 'req_1', description: 'Review submitted applications.' }],
        selectedNodeKeys: ['trigger:form-submission', 'logic:approval'],
        capabilities: ['application_review_decision']
    });

    assert.ok(issues.some(item => item.code === 'UNKNOWN_CAPABILITY'));
});

test('planner validator rejects missing requirements for plan types', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build.',
        requirements: [],
        selectedNodeKeys: []
    });
    assert.ok(issues.some(i => i.code === 'INVALID_REQUIREMENTS'));
});

test('planner validator rejects duplicate requirement IDs', () => {
    const issues = validateWorkflowPlannerResult({
        type: 'plan_complete',
        summary: 'Build.',
        requirements: [
            { id: 'req_1', description: 'First requirement.' },
            { id: 'req_1', description: 'Duplicate.' }
        ],
        selectedNodeKeys: []
    });
    assert.ok(issues.some(i => i.code === 'DUPLICATE_REQUIREMENT_ID'));
});

// ---------------------------------------------------------------------------
// Worker validator
// ---------------------------------------------------------------------------

test('worker validator accepts a valid operations array', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{ op: 'update_node', nodeRef: 'n1', updates: { config: { to: 'user@example.com' } } }]
    });
    assert.deepEqual(issues, []);
});

test('worker validator rejects missing operations array', () => {
    const issues = validateWorkflowWorkerResult({ something: 'else' });
    assert.ok(issues.some(i => i.code === 'INVALID_OPERATIONS'));
});

test('worker validator rejects an empty operations array', () => {
    const issues = validateWorkflowWorkerResult({ operations: [] });
    assert.ok(issues.some(i => i.code === 'EMPTY_OPERATIONS'));
});

test('worker validator rejects operations exceeding the maximum count', () => {
    const issues = validateWorkflowWorkerResult({
        operations: Array.from({ length: 55 }, (_, i) => ({ op: `op_${i}`, nodeRef: 'n1' }))
    });
    assert.ok(issues.some(i => i.code === 'TOO_MANY_OPERATIONS'));
});

test('worker validator rejects an operation missing an op field', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{ nodeRef: 'n1', updates: {} }]
    });
    assert.ok(issues.some(i => i.code === 'INVALID_OPERATION'));
});

test('worker validator accepts the semantic conditional branch operation', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2', handle: 'approved' },
            condition: {
                ref: 'attendance_is_online',
                title: 'Attendance is Online',
                config: { valueA: { $binding: 'form_field_2' }, operator: 'equals', valueB: 'Online' }
            },
            whenTrue: { ref: 'send_online', nodeKey: 'action:email', config: { subject: 'Joining instructions' } },
            whenFalse: { ref: 'send_venue', nodeKey: 'action:email', config: { subject: 'Venue instructions' } }
        }]
    });

    assert.deepEqual(issues, []);
});

test('worker validator accepts every semantic control-flow operation', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [
            {
                op: 'add_switch_routes',
                from: { nodeRef: 'n1', handle: 'event' },
                switch: { ref: 'route_mode', config: { valueToTest: { $binding: 'form_field_2' } } },
                cases: [{ value: 'Online', action: { ref: 'online', nodeKey: 'action:email', config: {} } }],
                otherwise: { ref: 'other', nodeKey: 'action:email', config: {} }
            },
            {
                op: 'add_error_handler',
                connection: { from: { nodeRef: 'n2', handle: 'outputData' }, to: { nodeRef: 'n3', handle: 'event' } },
                handler: { ref: 'handle_error', config: {} },
                whenError: { ref: 'alert_team', nodeKey: 'action:email', config: {} }
            },
            {
                op: 'add_approval_gate',
                connection: { from: { nodeRef: 'n4', handle: 'event' }, to: { nodeRef: 'n5', handle: 'event' } },
                approval: { ref: 'review', config: {} },
                whenRejected: { ref: 'notify_rejected', nodeKey: 'action:email', config: {} }
            },
            {
                op: 'move_approval_gate',
                approvalNodeRef: 'n8',
                connection: { from: { nodeRef: 'n9', handle: 'false' }, to: { nodeRef: 'n10', handle: 'event' } }
            },
            {
                op: 'join_branches',
                branches: [{ from: { nodeRef: 'n6', handle: 'outputData' } }, { from: { nodeRef: 'n7', handle: 'outputData' } }],
                merge: { ref: 'join_routes', config: { mergeMode: 'array' } },
                continueWith: { ref: 'log_join', nodeKey: 'action:logger', config: {} }
            }
        ]
    });

    assert.deepEqual(issues, []);
});

test('worker validator rejects a meaningful but incomplete approval rejection action', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{
            op: 'add_approval_gate',
            connection: { from: { nodeRef: 'n1', handle: 'event' }, to: { nodeRef: 'n2', handle: 'event' } },
            approval: { ref: 'review', config: {} },
            whenRejected: { ref: 'notify_rejection' }
        }]
    });

    assert.ok(issues.some(item => item.code === 'WORKFLOW_APPROVAL_REJECTED_ACTION_INVALID'));
});

test('worker validator rejects malformed semantic control-flow operations before compilation', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [
            {
                op: 'add_switch_routes',
                from: { nodeRef: 'n1' },
                switch: { ref: 'route', config: {} },
                cases: [{ value: 'Online', action: { ref: 'same', nodeKey: 'action:email', config: {} } }, { value: 'Online', action: { ref: 'same', nodeKey: 'action:email', config: {} } }],
                otherwise: { ref: 'same', nodeKey: 'logic:approval', config: {} }
            },
            {
                op: 'join_branches',
                branches: [{ from: { nodeRef: 'n2' } }],
                merge: { ref: 'merge', config: { mergeMode: 'invalid' } },
                continueWith: { ref: 'merge', nodeKey: 'action:logger', config: {} }
            }
        ]
    });

    assert.ok(issues.some(item => item.code === 'WORKFLOW_SWITCH_SOURCE_HANDLE_REQUIRED'));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_SWITCH_CONFIG_INVALID'));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_SWITCH_CASE_INVALID'));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_MERGE_BRANCHES_INVALID'));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_MERGE_CONFIG_INVALID'));
});

test('worker validator rejects an incomplete semantic conditional branch before compilation', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{
            op: 'add_condition_branch',
            from: { nodeRef: 'n2' },
            condition: { ref: 'same_ref', config: { valueA: { $binding: 'form_field_2' }, operator: 'equals' } },
            whenTrue: { ref: 'same_ref', nodeKey: 'action:email', config: {} },
            whenFalse: { ref: 'same_ref', nodeKey: 'logic:condition', config: {} }
        }]
    });

    assert.ok(issues.some(item => item.code === 'WORKFLOW_CONDITION_SOURCE_HANDLE_REQUIRED'));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_CONDITION_CONFIG_INVALID' && item.path.endsWith('valueB')));
    assert.ok(issues.some(item => item.code === 'WORKFLOW_CONDITION_BRANCH_ACTION_INVALID' && item.path.endsWith('whenFalse.nodeKey')));
});

test('worker validator retires raw Condition node creation', () => {
    const issues = validateWorkflowWorkerResult({
        operations: [{ op: 'create_node', node: { ref: 'condition', nodeKey: 'logic:condition', config: {} } }]
    });

    assert.deepEqual(issues.map(item => item.code), ['WORKFLOW_CONDITION_BRANCH_OPERATION_REQUIRED']);
});

test('worker validator retires raw creation for every semantic control-flow node', () => {
    const cases = [
        ['logic:switch', 'WORKFLOW_SWITCH_ROUTES_OPERATION_REQUIRED'],
        ['logic:catchError', 'WORKFLOW_ERROR_HANDLER_OPERATION_REQUIRED'],
        ['logic:merge', 'WORKFLOW_MERGE_OPERATION_REQUIRED'],
        ['logic:approval', 'WORKFLOW_APPROVAL_GATE_OPERATION_REQUIRED']
    ];
    for (const [nodeKey, code] of cases) {
        const issues = validateWorkflowWorkerResult({
            operations: [{ op: 'create_node', node: { ref: 'control', nodeKey, config: {} } }]
        });
        assert.deepEqual(issues.map(item => item.code), [code]);
    }
});

// ---------------------------------------------------------------------------
// Verifier validator
// ---------------------------------------------------------------------------

test('verifier validator accepts a passing result with no issues', () => {
    const issues = validateWorkflowVerifierResult({ status: 'pass', issues: [] });
    assert.deepEqual(issues, []);
});

test('verifier validator accepts a repair result with issues', () => {
    const issues = validateWorkflowVerifierResult({
        status: 'repair',
        issues: [{ requirementId: 'req_1', message: 'Subject not set.' }]
    });
    assert.deepEqual(issues, []);
});

test('verifier validator rejects an unknown status', () => {
    const issues = validateWorkflowVerifierResult({ status: 'unknown', issues: [] });
    assert.ok(issues.some(i => i.code === 'INVALID_VERIFIER_STATUS'));
});

test('verifier validator rejects pass status with issues present', () => {
    const issues = validateWorkflowVerifierResult({
        status: 'pass',
        issues: [{ requirementId: 'req_1', message: 'Problem.' }]
    });
    assert.ok(issues.some(i => i.code === 'PASS_WITH_ISSUES'));
});

test('verifier validator rejects repair status with no issues', () => {
    const issues = validateWorkflowVerifierResult({ status: 'repair', issues: [] });
    assert.ok(issues.some(i => i.code === 'REPAIR_WITHOUT_ISSUES'));
});

test('verifier validator rejects more than three verifier issues', () => {
    const issues = validateWorkflowVerifierResult({
        status: 'repair',
        issues: [
            { message: 'Issue 1.' },
            { message: 'Issue 2.' },
            { message: 'Issue 3.' },
            { message: 'Issue 4.' }
        ]
    });
    assert.ok(issues.some(i => i.code === 'TOO_MANY_VERIFIER_ISSUES'));
});

// ---------------------------------------------------------------------------
// summarizeWorkflowOutputIssues
// ---------------------------------------------------------------------------

test('summarizeWorkflowOutputIssues joins issues into a readable string', () => {
    const summary = summarizeWorkflowOutputIssues([
        { code: 'REQUIRED', path: 'message', message: 'A value is required.' },
        { code: 'INVALID_OPERATIONS', path: 'operations', message: 'Operations must be an array.' }
    ]);
    assert.match(summary, /REQUIRED at message/);
    assert.match(summary, /INVALID_OPERATIONS at operations/);
});

test('summarizeWorkflowOutputIssues returns empty string for no issues', () => {
    assert.equal(summarizeWorkflowOutputIssues([]), '');
    assert.equal(summarizeWorkflowOutputIssues(null), '');
});
