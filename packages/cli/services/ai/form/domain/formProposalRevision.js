import { FORM_SETTINGS_KEYS } from '../../../../../shared/formContract.js';
import { applyFormPatches, FormPatchValidationError } from './formPatchEngine.js';

const cloneJson = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const stableJson = value => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const sameValue = (left, right) => stableJson(left) === stableJson(right);

const activeFields = schema => (Array.isArray(schema?.fields) ? schema.fields : [])
    .filter(field => field && !field.deleted);

const revisionError = (code, message) => new FormPatchValidationError(message, [{ code, path: 'proposal', message }]);

const changedFieldUpdates = ({ source, target }) => {
    const sourceKeys = Object.keys(source || {}).filter(key => key !== 'id');
    const targetKeys = Object.keys(target || {}).filter(key => key !== 'id');
    const removedKey = sourceKeys.find(key => !Object.hasOwn(target || {}, key));
    if (removedKey) {
        throw revisionError(
            'FORM_PROPOSAL_REVISION_UNREPRESENTABLE',
            `The revised draft removes the “${removedKey}” field property, which cannot be safely applied as a form update.`
        );
    }

    return Object.fromEntries(targetKeys
        .filter(key => !sameValue(source?.[key], target?.[key]))
        .map(key => [key, cloneJson(target[key])]));
};

const assertRetainedFieldOrder = ({ sourceFields, targetFields }) => {
    const sourceIds = new Set(sourceFields.map(field => field.id));
    const retainedSourceOrder = sourceFields.filter(field => targetFields.some(target => target.id === field.id)).map(field => field.id);
    const retainedTargetOrder = targetFields.filter(field => sourceIds.has(field.id)).map(field => field.id);
    if (!sameValue(retainedSourceOrder, retainedTargetOrder)) {
        throw revisionError(
            'FORM_PROPOSAL_REVISION_UNREPRESENTABLE',
            'The revised draft reorders existing fields, which cannot be safely applied as a form proposal.'
        );
    }
};

const fieldAddPatches = ({ sourceFields, targetFields }) => {
    const sourceIds = new Set(sourceFields.map(field => field.id));

    return targetFields.flatMap((field, index) => {
        if (sourceIds.has(field.id)) return [];

        const patch = { op: 'add', field: cloneJson(field) };
        const prior = targetFields[index - 1];
        if (prior) {
            patch.insertAfter = prior.id;
            return [patch];
        }

        const nextSavedField = targetFields.slice(index + 1).find(candidate => sourceIds.has(candidate.id));
        if (nextSavedField) patch.insertBefore = nextSavedField.id;
        return [patch];
    });
};

const settingsPatches = ({ sourceSettings = {}, targetSettings = {} }) => {
    const updates = {};
    for (const key of FORM_SETTINGS_KEYS) {
        const sourceHasKey = Object.hasOwn(sourceSettings, key);
        const targetHasKey = Object.hasOwn(targetSettings, key);
        if (sourceHasKey && !targetHasKey) {
            throw revisionError(
                'FORM_PROPOSAL_REVISION_UNREPRESENTABLE',
                `The revised draft clears the “${key}” form setting, which cannot be safely applied as a form update.`
            );
        }
        if (targetHasKey && !sameValue(sourceSettings[key], targetSettings[key])) updates[key] = cloneJson(targetSettings[key]);
    }

    const patches = Object.keys(updates).length > 0 ? [{ op: 'update_settings', updates }] : [];
    if (!sameValue(sourceSettings.aiMemory, targetSettings.aiMemory)) {
        patches.push({ op: 'update_memory', updates: { memory: cloneJson(targetSettings.aiMemory ?? null) } });
    }
    return patches;
};

/** Reconstructs the server-stored, still-unapplied form draft. */
export const materializePendingFormProposal = ({ currentSchema = {}, proposal = {} } = {}) => {
    if (!Array.isArray(proposal?.patches)) {
        throw revisionError('FORM_PROPOSAL_REVISION_INVALID', 'The pending form proposal does not contain a valid patch list.');
    }
    return applyFormPatches({ currentSchema, patches: proposal.patches });
};

/**
 * Converts a final draft schema into the minimal applyable patch list relative
 * to the persisted form. A proposal may revise draft-only fields, but the
 * result must always be directly applicable to the saved form.
 */
export const rebaseFormProposalSchema = ({ currentSchema = {}, targetSchema = {} } = {}) => {
    const sourceFields = activeFields(currentSchema);
    const targetFields = activeFields(targetSchema);
    const sourceById = new Map(sourceFields.map(field => [field.id, field]));
    const targetById = new Map(targetFields.map(field => [field.id, field]));

    assertRetainedFieldOrder({ sourceFields, targetFields });

    const patches = [];
    const metaUpdates = {};
    for (const key of ['title', 'description']) {
        if (!sameValue(currentSchema?.[key], targetSchema?.[key])) metaUpdates[key] = cloneJson(targetSchema?.[key]);
    }
    if (Object.keys(metaUpdates).length > 0) patches.push({ op: 'update_meta', updates: metaUpdates });

    patches.push(...settingsPatches({ sourceSettings: currentSchema?.settings || {}, targetSettings: targetSchema?.settings || {} }));

    for (const field of sourceFields) {
        if (!targetById.has(field.id)) patches.push({ op: 'remove', id: field.id });
    }
    for (const field of targetFields) {
        const source = sourceById.get(field.id);
        if (!source) continue;
        const updates = changedFieldUpdates({ source, target: field });
        if (Object.keys(updates).length > 0) patches.push({ op: 'update', id: field.id, updates });
    }
    patches.push(...fieldAddPatches({ sourceFields, targetFields }));

    const applied = applyFormPatches({ currentSchema, patches });
    if (!sameValue(applied.schema, targetSchema)) {
        throw revisionError(
            'FORM_PROPOSAL_REVISION_UNREPRESENTABLE',
            'The revised draft could not be represented as a safe proposal for the saved form.'
        );
    }
    return applied;
};

export const rebaseFormProposalRevision = ({ currentSchema = {}, draftSchema = {}, revisionPatches = [] } = {}) => {
    const revisedDraft = applyFormPatches({ currentSchema: draftSchema, patches: revisionPatches });
    return rebaseFormProposalSchema({ currentSchema, targetSchema: revisedDraft.schema });
};
