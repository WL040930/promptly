import {
    FORM_AI_MEMORY_LIMIT,
    FORM_MAX_FIELDS,
    FORM_MAX_PATCHES,
    FORM_MAX_TEXT_LENGTH,
    FORM_FIELD_TYPES,
    FORM_SETTINGS_KEYS,
    FORM_PATCH_OPERATIONS,
    isChoiceFieldType,
    isFormFieldType,
    isFormPatchOperation
} from '../../../../../shared/formContract.js';

const MAX_VERIFIER_ISSUES = 3;

const issue = (code, path, message) => ({ code, path, message });

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const CLARIFICATION_INPUT_TYPES = Object.freeze(['multiple_choice', 'single_choice', 'text', 'textarea']);

const validateText = (value, path, { required = false, max = FORM_MAX_TEXT_LENGTH } = {}) => {
    if (value === undefined || value === null) {
        return required ? [issue('REQUIRED', path, 'A value is required.')] : [];
    }
    if (typeof value !== 'string') return [issue('INVALID_TEXT', path, 'Expected a string.')];
    if (required && value.trim().length === 0) return [issue('REQUIRED', path, 'A value is required.')];
    if (value.length > max) return [issue('TEXT_TOO_LONG', path, `Text must be ${max} characters or fewer.`)];
    return [];
};

const validateField = (field, path = 'field') => {
    const issues = [];
    if (!isPlainObject(field)) return [issue('INVALID_FIELD', path, 'Expected a field object.')];

    issues.push(...validateText(field.id, `${path}.id`, { required: true, max: 100 }));
    issues.push(...validateText(field.label, `${path}.label`, { required: true, max: 255 }));

    if (!isFormFieldType(field.type)) {
        issues.push(issue('INVALID_FIELD_TYPE', `${path}.type`, `Unsupported field type. Expected one of: ${FORM_FIELD_TYPES.join(', ')}.`));
        return issues;
    }

    if (field.required !== undefined && typeof field.required !== 'boolean') {
        issues.push(issue('INVALID_REQUIRED', `${path}.required`, 'Required must be a boolean.'));
    }

    if (isChoiceFieldType(field.type)) {
        if (!Array.isArray(field.choices) || field.choices.length === 0) {
            issues.push(issue('INVALID_CHOICES', `${path}.choices`, 'Choice fields require at least one choice.'));
        } else {
            field.choices.forEach((choice, index) => {
                issues.push(...validateText(choice, `${path}.choices[${index}]`, { required: true, max: 255 }));
            });
        }
    }

    if (field.type === 'number') {
        for (const key of ['min', 'max']) {
            if (field[key] !== undefined && field[key] !== '' && Number.isNaN(Number(field[key]))) {
                issues.push(issue('INVALID_NUMBER', `${path}.${key}`, `${key} must be numeric.`));
            }
        }
        if (field.min !== undefined && field.max !== undefined && field.min !== '' && field.max !== '' && Number(field.min) > Number(field.max)) {
            issues.push(issue('INVALID_RANGE', path, 'Minimum cannot be greater than maximum.'));
        }
    }

    if (field.type === 'textarea' && field.rows !== undefined && (!Number.isInteger(field.rows) || field.rows < 1 || field.rows > 100)) {
        issues.push(issue('INVALID_ROWS', `${path}.rows`, 'Rows must be an integer between 1 and 100.'));
    }

    if (field.type === 'rating' && field.maxRating !== undefined && (!Number.isInteger(field.maxRating) || field.maxRating < 1 || field.maxRating > 10)) {
        issues.push(issue('INVALID_RATING', `${path}.maxRating`, 'Maximum rating must be an integer between 1 and 10.'));
    }

    return issues;
};

const validateClarificationInputs = (inputs = []) => {
    const issues = [];
    if (!Array.isArray(inputs) || inputs.length === 0) {
        return [issue('INVALID_CLARIFICATION_INPUTS', 'inputs', 'A clarification message must contain at least one input.')];
    }

    const ids = new Set();
    inputs.forEach((input, index) => {
        const path = `inputs[${index}]`;
        if (!isPlainObject(input)) {
            issues.push(issue('INVALID_CLARIFICATION_INPUT', path, 'Clarification input must be an object.'));
            return;
        }

        issues.push(...validateText(input.id, `${path}.id`, { required: true, max: 100 }));
        issues.push(...validateText(input.label, `${path}.label`, { required: true, max: 500 }));
        if (!CLARIFICATION_INPUT_TYPES.includes(input.type)) {
            issues.push(issue('INVALID_CLARIFICATION_INPUT_TYPE', `${path}.type`, `Unsupported clarification input type. Expected one of: ${CLARIFICATION_INPUT_TYPES.join(', ')}.`));
        }
        if (input.id && ids.has(input.id)) issues.push(issue('DUPLICATE_CLARIFICATION_INPUT_ID', `${path}.id`, `Clarification input ID '${input.id}' is duplicated.`));
        if (input.id) ids.add(input.id);

        if (input.type === 'multiple_choice' || input.type === 'single_choice') {
            if (!Array.isArray(input.options) || input.options.length === 0) {
                issues.push(issue('INVALID_CLARIFICATION_OPTIONS', `${path}.options`, 'Choice inputs require at least one option.'));
            } else {
                input.options.forEach((option, optionIndex) => {
                    issues.push(...validateText(option, `${path}.options[${optionIndex}]`, { required: true, max: 500 }));
                });
            }
        }
    });

    return issues;
};

export const validateFormSchema = (schema = {}) => {
    const issues = [];
    if (!isPlainObject(schema)) return [issue('INVALID_SCHEMA', '', 'Expected a form schema object.')];

    issues.push(...validateText(schema.title, 'title', { required: true, max: 255 }));
    issues.push(...validateText(schema.description, 'description', { max: FORM_MAX_TEXT_LENGTH }));

    if (!Array.isArray(schema.fields)) {
        issues.push(issue('INVALID_FIELDS', 'fields', 'Fields must be an array.'));
    } else {
        if (schema.fields.length > FORM_MAX_FIELDS) {
            issues.push(issue('TOO_MANY_FIELDS', 'fields', `A form cannot contain more than ${FORM_MAX_FIELDS} fields.`));
        }
        const ids = new Set();
        schema.fields.forEach((field, index) => {
            issues.push(...validateField(field, `fields[${index}]`));
            if (field?.id) {
                if (ids.has(field.id)) issues.push(issue('DUPLICATE_FIELD_ID', `fields[${index}].id`, `Field ID '${field.id}' is duplicated.`));
                ids.add(field.id);
            }
        });
    }

    if (schema.settings !== undefined && !isPlainObject(schema.settings)) {
        issues.push(issue('INVALID_SETTINGS', 'settings', 'Settings must be an object.'));
    }

    const memory = schema.settings?.aiMemory;
    if (memory !== undefined && memory !== null) {
        const summary = typeof memory === 'string' ? memory : memory?.summary;
        issues.push(...validateText(summary, 'settings.aiMemory.summary', { required: true, max: FORM_AI_MEMORY_LIMIT }));
    }

    return issues;
};

const validatePatchShape = (patch, path, { allowUnknownSettings = false } = {}) => {
    const issues = [];
    if (!isPlainObject(patch)) return [issue('INVALID_PATCH', path, 'Expected a patch object.')];
    if (!isFormPatchOperation(patch.op)) {
        return [issue('INVALID_PATCH_OPERATION', `${path}.op`, `Unsupported operation. Expected one of: ${FORM_PATCH_OPERATIONS.join(', ')}.`)];
    }

    if (patch.op === 'add') {
        issues.push(...validateField(patch.field, `${path}.field`));
        if (patch.insertAfter !== undefined) issues.push(...validateText(patch.insertAfter, `${path}.insertAfter`, { max: 100 }));
        if (patch.insertBefore !== undefined) issues.push(...validateText(patch.insertBefore, `${path}.insertBefore`, { max: 100 }));
        if (patch.insertAfter !== undefined && patch.insertBefore !== undefined) {
            issues.push(issue('CONFLICTING_PLACEMENT', path, 'An add patch cannot specify both insertAfter and insertBefore.'));
        }
    }
    if (patch.op === 'update' || patch.op === 'remove') {
        issues.push(...validateText(patch.id, `${path}.id`, { required: true, max: 100 }));
        if (patch.op === 'update' && !isPlainObject(patch.updates)) issues.push(issue('INVALID_UPDATES', `${path}.updates`, 'Update patches require an updates object.'));
    }
    if (patch.op === 'move') {
        issues.push(...validateText(patch.id, `${path}.id`, { required: true, max: 100 }));
        if (patch.insertAfter !== undefined) issues.push(...validateText(patch.insertAfter, `${path}.insertAfter`, { max: 100 }));
        if (patch.insertBefore !== undefined) issues.push(...validateText(patch.insertBefore, `${path}.insertBefore`, { max: 100 }));
        if (patch.insertAfter !== undefined && patch.insertBefore !== undefined) {
            issues.push(issue('CONFLICTING_PLACEMENT', path, 'A move patch cannot specify both insertAfter and insertBefore.'));
        }
    }
    if (patch.op === 'update_meta') {
        if (!isPlainObject(patch.updates)) issues.push(issue('INVALID_METADATA_UPDATE', `${path}.updates`, 'Metadata updates require an updates object.'));
        else {
            const keys = Object.keys(patch.updates);
            if (keys.some(key => !['title', 'description'].includes(key))) issues.push(issue('INVALID_METADATA_KEY', `${path}.updates`, 'Only title and description may be changed.'));
            issues.push(...validateText(patch.updates.title, `${path}.updates.title`, { max: 255 }));
            issues.push(...validateText(patch.updates.description, `${path}.updates.description`, { max: FORM_MAX_TEXT_LENGTH }));
        }
    }
    if (patch.op === 'update_settings') {
        if (!isPlainObject(patch.updates)) issues.push(issue('INVALID_SETTINGS_UPDATE', `${path}.updates`, 'Settings updates require an updates object.'));
        else {
            const keys = Object.keys(patch.updates);
            if (keys.length === 0) issues.push(issue('EMPTY_SETTINGS_UPDATE', `${path}.updates`, 'Settings updates must change at least one setting.'));
            if (!allowUnknownSettings && keys.some(key => !FORM_SETTINGS_KEYS.includes(key))) {
                issues.push(issue('INVALID_SETTINGS_KEY', `${path}.updates`, `Only these settings may be changed: ${FORM_SETTINGS_KEYS.join(', ')}.`));
            }
            for (const key of keys) {
                const value = patch.updates[key];
                if (['acceptingResponses', 'limitOnePerBrowser', 'hasResponseLimit'].includes(key) && typeof value !== 'boolean') {
                    issues.push(issue('INVALID_SETTING_VALUE', `${path}.updates.${key}`, `${key} must be a boolean.`));
                }
                if (key === 'responseLimit' && !((typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value)))) {
                    issues.push(issue('INVALID_SETTING_VALUE', `${path}.updates.${key}`, 'responseLimit must be a numeric value.'));
                }
                if (key === 'confirmationMessage') issues.push(...validateText(value, `${path}.updates.${key}`, { max: FORM_MAX_TEXT_LENGTH }));
            }
        }
    }
    if (patch.op === 'update_memory') {
        const memory = patch.updates?.memory;
        if (memory !== null && memory !== undefined) {
            issues.push(...validateText(memory.summary, `${path}.updates.memory.summary`, { required: true, max: FORM_AI_MEMORY_LIMIT }));
        }
    }

    return issues;
};

export const validateFormPatches = (currentSchema, patches = []) => {
    const issues = [];
    if (!Array.isArray(patches)) return [issue('INVALID_PATCHES', 'patches', 'Patches must be an array.')];
    if (patches.length > FORM_MAX_PATCHES) issues.push(issue('TOO_MANY_PATCHES', 'patches', `A proposal cannot contain more than ${FORM_MAX_PATCHES} patches.`));

    const fields = Array.isArray(currentSchema?.fields) ? currentSchema.fields : [];
    const fieldIds = new Set(fields.filter(field => field && !field.deleted).map(field => field.id));
    // Soft-deleted IDs remain reserved even though they are not valid update
    // or remove targets in the user-visible form.
    const reservedFieldIds = new Set(fields.map(field => field?.id).filter(Boolean));
    const addedIds = new Set();
    const touchedIds = new Set();
    const movedIds = new Set();
    const removedIds = new Set();
    const moveAnchorIds = new Set();

    patches.forEach((patch, index) => {
        const path = `patches[${index}]`;
        issues.push(...validatePatchShape(patch, path));
        if (!patch || typeof patch !== 'object') return;

        if (patch.op === 'add' && patch.field?.id) {
            if (reservedFieldIds.has(patch.field.id) || addedIds.has(patch.field.id)) {
                issues.push(issue('DUPLICATE_FIELD_ID', `${path}.field.id`, `Field ID '${patch.field.id}' already exists.`));
            } else {
                addedIds.add(patch.field.id);
            }
        }
        if (patch.op === 'add') {
            const anchor = patch.insertAfter || patch.insertBefore;
            if (anchor && !fieldIds.has(anchor) && !addedIds.has(anchor)) {
                issues.push(issue('UNKNOWN_PLACEMENT_ANCHOR', `${path}.${patch.insertBefore ? 'insertBefore' : 'insertAfter'}`, `Placement anchor '${anchor}' does not exist.`));
            }
        }
        if (patch.op === 'move' && patch.id) {
            if (patch.id === currentSchema?.id) {
                issues.push(issue('FORM_ID_USED_AS_FIELD_ID', `${path}.id`, `Form ID '${patch.id}' cannot be used as a field ID. Use an existing fields[].id.`));
            } else if (!fieldIds.has(patch.id) && !addedIds.has(patch.id)) {
                issues.push(issue('UNKNOWN_FIELD', `${path}.id`, `Field ID '${patch.id}' does not exist.`));
            }
            if (removedIds.has(patch.id)) {
                issues.push(issue('CONFLICTING_PATCHES', path, `Field '${patch.id}' cannot be moved after it is removed.`));
            }
            if (movedIds.has(patch.id)) {
                issues.push(issue('CONFLICTING_PATCHES', path, `Field '${patch.id}' is moved more than once in this proposal.`));
            }
            movedIds.add(patch.id);

            const anchor = patch.insertAfter || patch.insertBefore;
            if (anchor) {
                if (anchor === patch.id) {
                    issues.push(issue('SELF_PLACEMENT', path, `Field '${patch.id}' cannot be placed relative to itself.`));
                } else if (removedIds.has(anchor) || (!fieldIds.has(anchor) && !addedIds.has(anchor))) {
                    issues.push(issue('UNKNOWN_PLACEMENT_ANCHOR', `${path}.${patch.insertBefore ? 'insertBefore' : 'insertAfter'}`, `Placement anchor '${anchor}' does not exist.`));
                }
                moveAnchorIds.add(anchor);
            }
        }
        if ((patch.op === 'update' || patch.op === 'remove') && patch.id) {
            if (patch.id === currentSchema?.id) {
                issues.push(issue('FORM_ID_USED_AS_FIELD_ID', `${path}.id`, `Form ID '${patch.id}' cannot be used as a field ID. Use an existing fields[].id or an add patch.`));
            } else if (!fieldIds.has(patch.id) && !addedIds.has(patch.id)) {
                issues.push(issue('UNKNOWN_FIELD', `${path}.id`, `Field ID '${patch.id}' does not exist.`));
            }
            if (touchedIds.has(patch.id)) issues.push(issue('CONFLICTING_PATCHES', path, `Field '${patch.id}' is changed more than once in this proposal.`));
            if (patch.op === 'remove') {
                if (movedIds.has(patch.id)) issues.push(issue('CONFLICTING_PATCHES', path, `Field '${patch.id}' cannot be removed after it is moved.`));
                if (moveAnchorIds.has(patch.id)) issues.push(issue('CONFLICTING_PATCHES', path, `Field '${patch.id}' cannot be removed while it is a move anchor.`));
                removedIds.add(patch.id);
            }
            touchedIds.add(patch.id);
        }
    });

    return issues;
};

export const summarizeValidationIssues = (issues = []) => issues.map((item) => {
    if (typeof item === 'string') return item;
    if (item?.requirementId) return `Requirement ${item.requirementId}: ${item.message}`;
    return `${item?.code || 'INVALID_RESPONSE'} at ${item?.path || 'response'}: ${item?.message || 'Unknown validation issue.'}`;
}).join('\n');

const validatePlannerRequirements = (result, issues) => {
    if (!Array.isArray(result.requirements) || result.requirements.length === 0) {
        issues.push(issue('INVALID_REQUIREMENTS', 'requirements', 'A completed plan must contain at least one requirement.'));
        return;
    }

    const requirementIds = new Set();
    result.requirements.forEach((requirement, index) => {
        if (!isPlainObject(requirement)) {
            issues.push(issue('INVALID_REQUIREMENT', `requirements[${index}]`, 'Requirement must be an object.'));
            return;
        }
        issues.push(...validateText(requirement.id, `requirements[${index}].id`, { required: true, max: 100 }));
        issues.push(...validateText(requirement.description, `requirements[${index}].description`, { required: true, max: 1000 }));
        if (requirement.id && requirementIds.has(requirement.id)) {
            issues.push(issue('DUPLICATE_REQUIREMENT_ID', `requirements[${index}].id`, `Requirement ID '${requirement.id}' is duplicated.`));
        }
        if (requirement.id) requirementIds.add(requirement.id);
    });
};

const validateContextDelta = (value, issues) => {
    if (value === undefined || value === null) return;
    if (!isPlainObject(value)) {
        issues.push(issue('INVALID_CONTEXT_DELTA', 'contextDelta', 'Context delta must be an object.'));
        return;
    }
    if (value.set !== undefined && !isPlainObject(value.set)) issues.push(issue('INVALID_CONTEXT_SET', 'contextDelta.set', 'Context set must be an object.'));
    for (const key of ['purpose', 'audience', 'tone']) {
        if (value.set?.[key] !== undefined) issues.push(...validateText(value.set[key], `contextDelta.set.${key}`, { max: 200 }));
    }
    for (const key of ['addInvariants', 'removeInvariants', 'addDecisions', 'removeDecisions']) {
        if (value[key] === undefined) continue;
        if (!Array.isArray(value[key])) {
            issues.push(issue('INVALID_CONTEXT_LIST', `contextDelta.${key}`, 'Context entries must be an array.'));
            continue;
        }
        if (value[key].length > 12) issues.push(issue('TOO_MANY_CONTEXT_ENTRIES', `contextDelta.${key}`, 'At most 12 context entries are allowed.'));
        value[key].forEach((entry, index) => issues.push(...validateText(entry, `contextDelta.${key}[${index}]`, { required: true, max: 200 })));
    }
};

export const validatePlannerResult = (result = {}) => {
    const issues = [];
    if (!isPlainObject(result)) return [issue('INVALID_PLANNER_RESPONSE', '', 'Planner response must be an object.')];
    if (!['reply', 'message', 'plan_complete', 'direct_proposal'].includes(result.type)) issues.push(issue('INVALID_PLANNER_TYPE', 'type', 'Planner type must be reply, message, plan_complete, or direct_proposal.'));

    if (result.type === 'reply') {
        issues.push(...validateText(result.message, 'message', { required: true, max: 4000 }));
    }

    if (result.type === 'message') {
        issues.push(...validateText(result.message, 'message', { required: true, max: 4000 }));
        issues.push(...validateClarificationInputs(result.inputs));
    }

    if (result.type === 'plan_complete' || result.type === 'direct_proposal') {
        issues.push(...validateText(result.summary, 'summary', { required: true, max: 4000 }));
        validatePlannerRequirements(result, issues);
        if (result.type === 'direct_proposal') issues.push(...validateWorkerResult(result));
        if (result.memoryUpdate !== undefined && result.memoryUpdate !== null) {
            if (!isPlainObject(result.memoryUpdate) || !['none', 'replace', 'clear'].includes(result.memoryUpdate.action)) {
                issues.push(issue('INVALID_MEMORY_ACTION', 'memoryUpdate.action', 'Memory action must be none, replace, or clear.'));
            }
            if (result.memoryUpdate.action === 'replace') issues.push(...validateText(result.memoryUpdate.summary, 'memoryUpdate.summary', { required: true, max: FORM_AI_MEMORY_LIMIT }));
        }
        validateContextDelta(result.contextDelta, issues);
    }

    return issues;
};

export const validateWorkerResult = (result = {}) => {
    const issues = [];
    if (!isPlainObject(result)) return [issue('INVALID_WORKER_RESPONSE', '', 'Worker response must be an object.')];
    if (!Array.isArray(result.patches)) issues.push(issue('INVALID_PATCHES', 'patches', 'Worker patches must be an array.'));
    else result.patches.forEach((patch, index) => issues.push(...validatePatchShape(patch, `patches[${index}]`, { allowUnknownSettings: true })));
    return issues;
};

export const validateVerifierResult = (result = {}) => {
    const issues = [];
    if (!isPlainObject(result)) return [issue('INVALID_VERIFIER_RESPONSE', '', 'Verifier response must be an object.')];
    if (!['pass', 'repair'].includes(result.status)) issues.push(issue('INVALID_VERIFIER_STATUS', 'status', 'Verifier status must be pass or repair.'));
    if (!Array.isArray(result.issues)) {
        issues.push(issue('INVALID_VERIFIER_ISSUES', 'issues', 'Verifier issues must be an array.'));
    } else {
        if (result.issues.length > MAX_VERIFIER_ISSUES) {
            issues.push(issue('TOO_MANY_VERIFIER_ISSUES', 'issues', `Verifier may return at most ${MAX_VERIFIER_ISSUES} issues.`));
        }
        result.issues.forEach((verifierIssue, index) => {
            const path = `issues[${index}]`;
            if (!isPlainObject(verifierIssue)) {
                issues.push(issue('INVALID_VERIFIER_ISSUE', path, 'Verifier issue must be an object.'));
                return;
            }
            issues.push(...validateText(verifierIssue.message, `${path}.message`, { required: true, max: 1000 }));
            if (verifierIssue.requirementId !== undefined) issues.push(...validateText(verifierIssue.requirementId, `${path}.requirementId`, { max: 100 }));
        });
    }
    if (result.status === 'pass' && Array.isArray(result.issues) && result.issues.length > 0) {
        issues.push(issue('PASS_WITH_VERIFIER_ISSUES', 'issues', 'A passing verification must not contain issues.'));
    }
    if (result.status === 'repair' && (!Array.isArray(result.issues) || result.issues.length === 0)) {
        issues.push(issue('MISSING_VERIFIER_ISSUES', 'issues', 'A repair result must include at least one issue.'));
    }
    return issues;
};
