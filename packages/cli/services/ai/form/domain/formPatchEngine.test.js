import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFormPatches, FormPatchValidationError } from './formPatchEngine.js';

const form = {
    id: 'form_1',
    title: 'Contact form',
    description: '',
    settings: {},
    fields: [
        { id: 'email', type: 'email', label: 'Email', required: false }
    ]
};

test('applyFormPatches returns an enriched proposal without mutating the source form', () => {
    const result = applyFormPatches({
        currentSchema: form,
        patches: [
            { op: 'update', id: 'email', updates: { required: true } },
            { op: 'add', field: { id: 'name', type: 'text', label: 'Name', required: true } }
        ]
    });

    assert.equal(result.schema.fields[0].required, true);
    assert.equal(result.schema.fields[1].id, 'name');
    assert.deepEqual(result.patches.map(patch => patch.patchId), ['patch_1', 'patch_2']);
    assert.equal(form.fields[0].required, false);
    assert.equal(form.fields.length, 1);
});

test('applyFormPatches applies and preserves form settings updates', () => {
    const currentSchema = {
        id: 'form_1',
        title: 'Contact form',
        description: '',
        settings: { acceptingResponses: false },
        fields: []
    };

    const result = applyFormPatches({
        currentSchema,
        patches: [{ op: 'update_settings', updates: { acceptingResponses: true } }]
    });

    assert.equal(result.schema.settings.acceptingResponses, true);
    assert.deepEqual(result.patches[0].originalSettings, { acceptingResponses: false });
    assert.equal(currentSchema.settings.acceptingResponses, false);
});

test('applyFormPatches supports explicit before placement for layout fields', () => {
    const result = applyFormPatches({
        currentSchema: {
            title: 'Registration',
            description: '',
            settings: {},
            fields: [{ id: 'name', type: 'text', label: 'Full Name' }]
        },
        patches: [{
            op: 'add',
            field: { id: 'heading_contact', type: 'heading', label: 'Contact Information' },
            insertBefore: 'name'
        }]
    });

    assert.deepEqual(result.schema.fields.map(field => field.id), ['heading_contact', 'name']);
});

test('applyFormPatches moves an existing field without changing its definition', () => {
    const currentSchema = {
        title: 'Event Registration',
        description: '',
        settings: {},
        fields: [
            { id: 'name', type: 'text', label: 'Name' },
            { id: 'consent', type: 'checkbox', label: 'Consent', required: true, choices: ['Yes'] },
            { id: 'special_req', type: 'textarea', label: 'Special Requirements', required: false }
        ]
    };

    const result = applyFormPatches({
        currentSchema,
        patches: [{ op: 'move', id: 'special_req', insertBefore: 'consent' }]
    });

    assert.deepEqual(result.schema.fields.map(field => field.id), ['name', 'special_req', 'consent']);
    assert.deepEqual(result.schema.fields[1], currentSchema.fields[2]);
    assert.equal(result.patches[0].originalIndex, 2);
    assert.equal(result.patches[0].anchorLabel, 'Consent');
    assert.deepEqual(result.patches[0].originalField, currentSchema.fields[2]);
    assert.deepEqual(currentSchema.fields.map(field => field.id), ['name', 'consent', 'special_req']);
});

test('applyFormPatches rejects an unknown placement anchor', () => {
    assert.throws(
        () => applyFormPatches({
            currentSchema: {
                title: 'Registration',
                description: '',
                settings: {},
                fields: [{ id: 'name', type: 'text', label: 'Full Name' }]
            },
            patches: [{
                op: 'add',
                field: { id: 'heading_contact', type: 'heading', label: 'Contact Information' },
                insertBefore: 'missing'
            }]
        }),
        error => error.code === 'FORM_PROPOSAL_INVALID'
            && error.issues?.some(issue => issue.code === 'UNKNOWN_PLACEMENT_ANCHOR')
    );
});

test('applyFormPatches fails closed when a patch would create an invalid form', () => {
    assert.throws(() => applyFormPatches({
        currentSchema: form,
        patches: [{ op: 'add', field: { id: 'role', type: 'radio', label: 'Role', choices: [] } }]
    }), (error) => {
        assert.ok(error instanceof FormPatchValidationError);
        assert.ok(error.issues.some(issue => issue.code === 'INVALID_CHOICES'));
        return true;
    });
});
