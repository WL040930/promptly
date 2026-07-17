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

