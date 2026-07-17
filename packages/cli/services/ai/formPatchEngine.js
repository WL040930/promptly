import { validateFormPatches, validateFormSchema } from './formSchemaValidator.js';

const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export class FormPatchValidationError extends Error {
    constructor(message, issues = []) {
        super(message);
        this.name = 'FormPatchValidationError';
        this.code = 'FORM_PROPOSAL_INVALID';
        this.issues = issues;
    }
}

const enrichPatch = (patch, index) => ({
    ...cloneJson(patch),
    patchId: patch.patchId || `patch_${index + 1}`
});

export const applyFormPatches = ({ currentSchema = {}, patches = [] }) => {
    const patchIssues = validateFormPatches(currentSchema, patches);
    if (patchIssues.length > 0) {
        throw new FormPatchValidationError('The proposal contains invalid changes.', patchIssues);
    }

    const normalizedPatches = patches.map(enrichPatch);
    const updatedSchema = {
        ...cloneJson(currentSchema),
        settings: { ...(cloneJson(currentSchema.settings) || {}) },
        fields: Array.isArray(currentSchema.fields) ? cloneJson(currentSchema.fields) : []
    };

    for (const patch of normalizedPatches) {
        if (patch.op === 'add') {
            const field = cloneJson(patch.field);
            if (patch.insertAfter) {
                const index = updatedSchema.fields.findIndex(fieldItem => fieldItem.id === patch.insertAfter);
                updatedSchema.fields.splice(index === -1 ? updatedSchema.fields.length : index + 1, 0, field);
            } else {
                updatedSchema.fields.push(field);
            }
        }

        if (patch.op === 'remove') {
            const index = updatedSchema.fields.findIndex(field => field.id === patch.id);
            const existing = updatedSchema.fields[index];
            patch.label = existing.label || existing.title || patch.id;
            patch.originalField = cloneJson(existing);
            patch.originalIndex = index;
            updatedSchema.fields.splice(index, 1);
        }

        if (patch.op === 'update') {
            const index = updatedSchema.fields.findIndex(field => field.id === patch.id);
            const existing = updatedSchema.fields[index];
            patch.label = existing.label || existing.title || patch.id;
            patch.originalField = cloneJson(existing);
            patch.originalIndex = index;
            updatedSchema.fields[index] = { ...existing, ...cloneJson(patch.updates) };
        }

        if (patch.op === 'update_meta') {
            patch.originalMeta = {
                title: updatedSchema.title,
                description: updatedSchema.description
            };
            Object.assign(updatedSchema, cloneJson(patch.updates));
        }

        if (patch.op === 'update_memory') {
            patch.originalMemory = cloneJson(currentSchema.settings?.aiMemory);
            if (patch.updates?.memory) updatedSchema.settings.aiMemory = cloneJson(patch.updates.memory);
            else delete updatedSchema.settings.aiMemory;
        }
    }

    const schemaIssues = validateFormSchema(updatedSchema);
    if (schemaIssues.length > 0) {
        throw new FormPatchValidationError('The proposal would create an invalid form.', schemaIssues);
    }

    return {
        schema: updatedSchema,
        patches: normalizedPatches,
        issues: []
    };
};

