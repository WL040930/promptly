import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateFormPatches,
    validateFormSchema,
    validatePlannerResult,
    validateWorkerResult,
    validateVerifierResult
} from './formSchemaValidator.js';

const form = {
    title: 'Contact form',
    description: '',
    settings: {},
    fields: [
        { id: 'email', type: 'email', label: 'Email', required: true }
    ]
};

test('validateFormSchema rejects unsupported field types and invalid choices', () => {
    const issues = validateFormSchema({
        ...form,
        fields: [
            { id: 'bad', type: 'unknown', label: 'Bad field' },
            { id: 'choice', type: 'radio', label: 'Role', choices: [] }
        ]
    });

    assert.ok(issues.some(issue => issue.code === 'INVALID_FIELD_TYPE'));
    assert.ok(issues.some(issue => issue.code === 'INVALID_CHOICES'));
});

test('required form text rejects blank titles and field labels', () => {
    const issues = validateFormSchema({
        ...form,
        title: '   ',
        fields: [{ id: 'email', type: 'email', label: '  ' }]
    });

    assert.ok(issues.some(issue => issue.path === 'title' && issue.code === 'REQUIRED'));
    assert.ok(issues.some(issue => issue.path === 'fields[0].label' && issue.code === 'REQUIRED'));
});

test('validateFormPatches rejects duplicate IDs, unknown targets, and conflicting updates', () => {
    const issues = validateFormPatches(form, [
        { op: 'add', field: { id: 'email', type: 'text', label: 'Duplicate' } },
        { op: 'update', id: 'missing', updates: { required: true } },
        { op: 'update', id: 'email', updates: { required: false } },
        { op: 'remove', id: 'email' }
    ]);

    assert.ok(issues.some(issue => issue.code === 'DUPLICATE_FIELD_ID'));
    assert.ok(issues.some(issue => issue.code === 'UNKNOWN_FIELD'));
    assert.ok(issues.some(issue => issue.code === 'CONFLICTING_PATCHES'));
});

test('validateFormPatches identifies when the form ID is used as a field target', () => {
    const issues = validateFormPatches({ id: 'form_1', fields: [], settings: {} }, [
        { op: 'update', id: 'form_1', updates: { label: 'Wrong target' } }
    ]);

    assert.ok(issues.some(issue => issue.code === 'FORM_ID_USED_AS_FIELD_ID'));
});

test('validateFormPatches accepts safe form settings updates and rejects unknown settings', () => {
    const validIssues = validateFormPatches({ id: 'form_1', fields: [], settings: {} }, [
        { op: 'update_settings', updates: { acceptingResponses: true } }
    ]);
    assert.deepEqual(validIssues, []);

    const invalidIssues = validateFormPatches({ id: 'form_1', fields: [], settings: {} }, [
        { op: 'update_settings', updates: { accentColor: '#fff' } }
    ]);
    assert.ok(invalidIssues.some(issue => issue.code === 'INVALID_SETTINGS_KEY'));
});

test('validatePlannerResult and validateWorkerResult reject malformed model contracts', () => {
    assert.ok(validatePlannerResult({ type: 'plan_complete' }).length > 0);
    assert.ok(validateWorkerResult({ patches: [{ op: 'add', field: { type: 'text' } }] }).length > 0);
    assert.deepEqual(validateWorkerResult({ patches: [] }), []);
});

test('validatePlannerResult accepts a read-only conversational reply', () => {
    assert.deepEqual(validatePlannerResult({
        type: 'reply',
        message: 'A dropdown is useful when respondents choose one value from a known list.'
    }), []);
});

test('validatePlannerResult accepts a safe direct proposal contract', () => {
    assert.deepEqual(validatePlannerResult({
        type: 'direct_proposal',
        summary: 'Make the existing email field required.',
        requirements: [{ id: 'req_1', description: 'Make the existing email field required.' }],
        patches: [{ op: 'update', id: 'email', updates: { required: true } }]
    }), []);
});

test('validatePlannerResult rejects duplicate requirement IDs', () => {
    const issues = validatePlannerResult({
        type: 'plan_complete',
        summary: 'Build the form.',
        requirements: [
            { id: 'req_1', description: 'Add an email field.' },
            { id: 'req_1', description: 'Make it required.' }
        ]
    });

    assert.ok(issues.some(issue => issue.code === 'DUPLICATE_REQUIREMENT_ID'));
});

test('validatePlannerResult treats a null memory update as no memory change', () => {
    assert.deepEqual(validatePlannerResult({
        type: 'plan_complete',
        summary: 'Build the form.',
        requirements: [{ id: 'req_1', description: 'Add an email field.' }],
        memoryUpdate: null
    }), []);
});

test('validatePlannerResult requires usable clarification inputs', () => {
    assert.ok(validatePlannerResult({ type: 'message', message: 'Need details.', inputs: [] }).some(issue => issue.code === 'INVALID_CLARIFICATION_INPUTS'));
    assert.ok(validatePlannerResult({
        type: 'message',
        message: 'Need details.',
        inputs: [{ id: 'q1', type: 'multiple_choice', label: 'Fields?', options: [] }]
    }).some(issue => issue.code === 'INVALID_CLARIFICATION_OPTIONS'));
    assert.deepEqual(validatePlannerResult({
        type: 'message',
        message: 'Need details.',
        inputs: [{ id: 'q1', type: 'multiple_choice', label: 'Fields?', options: ['Name', 'Email'] }]
    }), []);
});

test('validateVerifierResult enforces status and issue shape', () => {
    assert.ok(validateVerifierResult({ status: 'pass', issues: [{ message: 'Unexpected change.' }] }).some(issue => issue.code === 'PASS_WITH_VERIFIER_ISSUES'));
    assert.ok(validateVerifierResult({ status: 'repair', issues: [{}] }).some(issue => issue.path === 'issues[0].message'));
    assert.deepEqual(validateVerifierResult({
        status: 'pass',
        issues: []
    }), []);
    assert.ok(validateVerifierResult({
        status: 'repair',
        issues: [1, 2, 3, 4].map((_, index) => ({ message: `Issue ${index}` }))
    }).some(issue => issue.code === 'TOO_MANY_VERIFIER_ISSUES'));
});
