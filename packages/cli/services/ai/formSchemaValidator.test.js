import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateFormPatches,
    validateFormSchema,
    validatePlannerResult,
    validateWorkerResult
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

test('validatePlannerResult and validateWorkerResult reject malformed model contracts', () => {
    assert.ok(validatePlannerResult({ type: 'plan_complete' }).length > 0);
    assert.ok(validateWorkerResult({ type: 'proposal', patches: [{ op: 'add', field: { type: 'text' } }] }).length > 0);
});
