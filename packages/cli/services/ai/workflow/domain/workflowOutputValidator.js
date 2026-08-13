const MAX_TEXT = 4000;
const MAX_REQUIREMENTS = 30;
const MAX_OPERATIONS = 50;
const MAX_VERIFIER_ISSUES = 3;
const INPUT_TYPES = new Set(['single_choice', 'multiple_choice', 'text', 'textarea', 'resource_choice']);
const PLANNER_TYPES = new Set(['reply', 'message', 'inspect_form', 'inspect_resource', 'diagnose_run', 'direct_plan', 'plan_complete']);
const CAPABILITIES = new Set(['respondent_confirmation', 'owner_approval', 'per_submission_spreadsheet']);
const RESOURCE_CHANGE_TYPES = new Set(['create_google_spreadsheet']);

const issue = (code, path, message) => ({ code, path, message });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const textIssues = (value, path, { required = false, max = MAX_TEXT } = {}) => {
    if (value === undefined || value === null) return required ? [issue('REQUIRED', path, 'A value is required.')] : [];
    if (typeof value !== 'string') return [issue('INVALID_TEXT', path, 'Expected a string.')];
    if (required && !value.trim()) return [issue('REQUIRED', path, 'A value is required.')];
    if (value.length > max) return [issue('TEXT_TOO_LONG', path, `Text must be ${max} characters or fewer.`)];
    return [];
};

const validateRequirements = requirements => {
    if (!Array.isArray(requirements) || requirements.length === 0) {
        return [issue('INVALID_REQUIREMENTS', 'requirements', 'An edit plan requires at least one requirement.')];
    }
    const issues = [];
    const ids = new Set();
    if (requirements.length > MAX_REQUIREMENTS) issues.push(issue('TOO_MANY_REQUIREMENTS', 'requirements', `At most ${MAX_REQUIREMENTS} requirements are allowed.`));
    requirements.forEach((requirement, index) => {
        const path = `requirements[${index}]`;
        if (!isObject(requirement)) {
            issues.push(issue('INVALID_REQUIREMENT', path, 'Requirement must be an object.'));
            return;
        }
        issues.push(...textIssues(requirement.id, `${path}.id`, { required: true, max: 100 }));
        issues.push(...textIssues(requirement.description, `${path}.description`, { required: true, max: 1000 }));
        if (requirement.id && ids.has(requirement.id)) issues.push(issue('DUPLICATE_REQUIREMENT_ID', `${path}.id`, 'Requirement IDs must be unique.'));
        ids.add(requirement.id);
    });
    return issues;
};

const validateInputs = inputs => {
    if (!Array.isArray(inputs) || inputs.length === 0) {
        return [issue('INVALID_CLARIFICATION_INPUTS', 'inputs', 'Clarification requires at least one input.')];
    }
    const issues = [];
    const ids = new Set();
    inputs.forEach((input, index) => {
        const path = `inputs[${index}]`;
        if (!isObject(input)) {
            issues.push(issue('INVALID_CLARIFICATION_INPUT', path, 'Clarification input must be an object.'));
            return;
        }
        issues.push(...textIssues(input.id, `${path}.id`, { required: true, max: 100 }));
        issues.push(...textIssues(input.label, `${path}.label`, { required: true, max: 500 }));
        if (input.required !== undefined && typeof input.required !== 'boolean') {
            issues.push(issue('INVALID_CLARIFICATION_REQUIRED', `${path}.required`, 'Clarification required must be a boolean.'));
        }
        if (input.alternativeGroup !== undefined) {
            issues.push(...textIssues(input.alternativeGroup, `${path}.alternativeGroup`, { required: true, max: 100 }));
        }
        if (!INPUT_TYPES.has(input.type)) issues.push(issue('INVALID_CLARIFICATION_INPUT_TYPE', `${path}.type`, 'Unsupported clarification input type.'));
        if (input.id && ids.has(input.id)) issues.push(issue('DUPLICATE_CLARIFICATION_INPUT_ID', `${path}.id`, 'Clarification input IDs must be unique.'));
        ids.add(input.id);
        if (['single_choice', 'multiple_choice'].includes(input.type)) {
            if (!Array.isArray(input.options) || input.options.length === 0) {
                issues.push(issue('INVALID_CLARIFICATION_OPTIONS', `${path}.options`, 'Choice inputs require options.'));
            } else {
                input.options.forEach((option, optionIndex) => issues.push(...textIssues(option, `${path}.options[${optionIndex}]`, { required: true, max: 500 })));
            }
        }
        if (input.type === 'resource_choice') {
            if (!Array.isArray(input.options) || input.options.length === 0) issues.push(issue('INVALID_RESOURCE_CHOICES', `${path}.options`, 'Resource choices require options.'));
            else input.options.forEach((option, optionIndex) => {
                if (!isObject(option)) issues.push(issue('INVALID_RESOURCE_CHOICE', `${path}.options[${optionIndex}]`, 'Resource choice must be an object.'));
                else {
                    issues.push(...textIssues(option.id, `${path}.options[${optionIndex}].id`, { required: true, max: 200 }));
                    issues.push(...textIssues(option.name, `${path}.options[${optionIndex}].name`, { required: true, max: 500 }));
                }
            });
        }
    });
    return issues;
};

const validateContextDelta = value => {
    if (value === undefined || value === null) return [];
    if (!isObject(value)) return [issue('INVALID_CONTEXT_DELTA', 'contextDelta', 'Context delta must be an object.')];
    const issues = [];
    if (value.set !== undefined && !isObject(value.set)) issues.push(issue('INVALID_CONTEXT_SET', 'contextDelta.set', 'Context set must be an object.'));
    for (const key of ['purpose', 'audience', 'tone']) {
        if (value.set?.[key] !== undefined) issues.push(...textIssues(value.set[key], `contextDelta.set.${key}`, { max: 200 }));
    }
    for (const key of ['addInvariants', 'removeInvariants', 'addDecisions', 'removeDecisions']) {
        if (value[key] === undefined) continue;
        if (!Array.isArray(value[key])) {
            issues.push(issue('INVALID_CONTEXT_LIST', `contextDelta.${key}`, 'Context entries must be an array.'));
            continue;
        }
        if (value[key].length > 12) issues.push(issue('TOO_MANY_CONTEXT_ENTRIES', `contextDelta.${key}`, 'At most 12 context entries are allowed.'));
        value[key].forEach((entry, index) => issues.push(...textIssues(entry, `contextDelta.${key}[${index}]`, { required: true, max: 200 })));
    }
    return issues;
};

const validateResourceChanges = changes => {
    if (changes === undefined) return [];
    if (!Array.isArray(changes)) return [issue('INVALID_RESOURCE_CHANGES', 'resourceChanges', 'Resource changes must be an array.')];
    const issues = [];
    const refs = new Set();
    changes.forEach((change, index) => {
        const path = `resourceChanges[${index}]`;
        if (!isObject(change)) {
            issues.push(issue('INVALID_RESOURCE_CHANGE', path, 'Resource change must be an object.'));
            return;
        }
        issues.push(...textIssues(change.ref, `${path}.ref`, { required: true, max: 100 }));
        if (!RESOURCE_CHANGE_TYPES.has(change.type)) issues.push(issue('INVALID_RESOURCE_CHANGE_TYPE', `${path}.type`, 'Unsupported resource change.'));
        issues.push(...textIssues(change.title, `${path}.title`, { required: true, max: 180 }));
        if (change.sheetTitle !== undefined) issues.push(...textIssues(change.sheetTitle, `${path}.sheetTitle`, { max: 100 }));
        if (change.ref && refs.has(change.ref)) issues.push(issue('DUPLICATE_RESOURCE_CHANGE_REF', `${path}.ref`, 'Resource change refs must be unique.'));
        refs.add(change.ref);
    });
    return issues;
};

const LINEAR_STEP_REF = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * A linear blueprint is optional because branching and existing-workflow
 * edits still need the full worker. When present, it gives the server a
 * safe, ordered fallback for a fresh workflow.
 */
const validateLinearSteps = (steps, requirements = []) => {
    if (steps === undefined) return [];
    if (!Array.isArray(steps)) return [issue('INVALID_LINEAR_STEPS', 'linearSteps', 'linearSteps must be an array.')];
    const issues = [];
    if (steps.length < 2 || steps.length > 8) {
        issues.push(issue('INVALID_LINEAR_STEP_COUNT', 'linearSteps', 'A linear workflow must contain between 2 and 8 steps.'));
    }
    const refs = new Set();
    const mappedRequirementIds = new Set();
    steps.forEach((step, index) => {
        const path = `linearSteps[${index}]`;
        if (!isObject(step)) {
            issues.push(issue('INVALID_LINEAR_STEP', path, 'Each linear step must be an object.'));
            return;
        }
        issues.push(...textIssues(step.ref, `${path}.ref`, { required: true, max: 64 }));
        if (typeof step.ref === 'string' && step.ref && !LINEAR_STEP_REF.test(step.ref)) {
            issues.push(issue('INVALID_LINEAR_STEP_REF', `${path}.ref`, 'Use a lowercase letter followed by lowercase letters, numbers, or underscores.'));
        }
        if (step.ref && refs.has(step.ref)) issues.push(issue('DUPLICATE_LINEAR_STEP_REF', `${path}.ref`, 'Each linear step ref must be unique.'));
        refs.add(step.ref);
        issues.push(...textIssues(step.nodeKey, `${path}.nodeKey`, { required: true, max: 150 }));
        if (step.title !== undefined) issues.push(...textIssues(step.title, `${path}.title`, { max: 180 }));
        if (step.config !== undefined && !isObject(step.config)) {
            issues.push(issue('INVALID_LINEAR_STEP_CONFIG', `${path}.config`, 'A linear step config must be an object.'));
        }
        if (!Array.isArray(step.requirementIds) || step.requirementIds.length === 0) {
            issues.push(issue('INVALID_LINEAR_STEP_REQUIREMENTS', `${path}.requirementIds`, 'Each linear step must map at least one requirement.'));
        } else {
            step.requirementIds.forEach((requirementId, requirementIndex) => {
                issues.push(...textIssues(requirementId, `${path}.requirementIds[${requirementIndex}]`, { required: true, max: 100 }));
                if (typeof requirementId === 'string' && requirementId) mappedRequirementIds.add(requirementId);
            });
        }
    });
    const declaredRequirementIds = new Set((requirements || []).map(requirement => requirement?.id).filter(Boolean));
    for (const requirementId of mappedRequirementIds) {
        if (!declaredRequirementIds.has(requirementId)) {
            issues.push(issue('UNKNOWN_LINEAR_STEP_REQUIREMENT', 'linearSteps', `Linear steps reference unknown requirement '${requirementId}'.`));
        }
    }
    for (const requirementId of declaredRequirementIds) {
        if (!mappedRequirementIds.has(requirementId)) {
            issues.push(issue('LINEAR_STEP_REQUIREMENT_UNMAPPED', 'linearSteps', `Requirement '${requirementId}' is not mapped to a linear step.`));
        }
    }
    return issues;
};

export const validateWorkflowPlannerResult = result => {
    if (!isObject(result)) return [issue('INVALID_PLANNER_RESPONSE', '', 'Planner response must be an object.')];
    const issues = [];
    if (!PLANNER_TYPES.has(result.type)) issues.push(issue('INVALID_PLANNER_TYPE', 'type', 'Unsupported planner outcome.'));
    if (result.type === 'reply') issues.push(...textIssues(result.message, 'message', { required: true }));
    if (result.type === 'inspect_form') issues.push(...textIssues(result.formId, 'formId', { required: true, max: 150 }));
    if (result.type === 'inspect_resource') {
        if (result.resource !== 'google-spreadsheets') issues.push(issue('INVALID_RESOURCE_LOOKUP', 'resource', 'Only Google Sheets can be inspected.'));
        issues.push(...textIssues(result.query, 'query', { required: true, max: 300 }));
    }
    if (result.type === 'diagnose_run') {
        if (!['referenced', 'latest_failed', 'latest'].includes(result.selector)) {
            issues.push(issue('INVALID_RUN_SELECTOR', 'selector', 'Run selector must be referenced, latest_failed, or latest.'));
        }
        if (result.selector === 'referenced') issues.push(...textIssues(result.runId, 'runId', { required: true, max: 150 }));
        if (result.goal !== undefined && !['explain', 'explain_and_propose'].includes(result.goal)) {
            issues.push(issue('INVALID_DIAGNOSIS_GOAL', 'goal', 'Diagnosis goal must be explain or explain_and_propose.'));
        }
    }
    if (result.type === 'message') {
        issues.push(...textIssues(result.message, 'message', { required: true }));
        issues.push(...validateInputs(result.inputs));
    }
    if (['direct_plan', 'plan_complete'].includes(result.type)) {
        issues.push(...textIssues(result.summary, 'summary', { required: true }));
        issues.push(...validateRequirements(result.requirements));
        if (!Array.isArray(result.selectedNodeKeys)) issues.push(issue('INVALID_NODE_KEYS', 'selectedNodeKeys', 'selectedNodeKeys must be an array.'));
        else result.selectedNodeKeys.forEach((key, index) => issues.push(...textIssues(key, `selectedNodeKeys[${index}]`, { required: true, max: 150 })));
        if (result.capabilities !== undefined) {
            if (!Array.isArray(result.capabilities)) issues.push(issue('INVALID_CAPABILITIES', 'capabilities', 'capabilities must be an array.'));
            else result.capabilities.forEach((capability, index) => {
                if (!CAPABILITIES.has(capability)) issues.push(issue('UNKNOWN_CAPABILITY', `capabilities[${index}]`, `Unsupported capability '${String(capability)}'.`));
            });
        }
        if (result.type === 'direct_plan') issues.push(...validateWorkflowWorkerResult(result));
        if (result.type === 'plan_complete') issues.push(...validateLinearSteps(result.linearSteps, result.requirements));
        issues.push(...validateContextDelta(result.contextDelta));
        issues.push(...validateResourceChanges(result.resourceChanges));
    }
    return issues;
};

export const validateWorkflowWorkerResult = result => {
    if (!isObject(result)) return [issue('INVALID_WORKER_RESPONSE', '', 'Worker response must be an object.')];
    if (!Array.isArray(result.operations)) return [issue('INVALID_OPERATIONS', 'operations', 'Worker operations must be an array.')];
    if (result.operations.length === 0) return [issue('EMPTY_OPERATIONS', 'operations', 'An edit proposal must contain at least one operation.')];
    if (result.operations.length > MAX_OPERATIONS) return [issue('TOO_MANY_OPERATIONS', 'operations', `At most ${MAX_OPERATIONS} operations are allowed.`)];
    return result.operations.flatMap((operation, index) => (
        isObject(operation) && typeof operation.op === 'string' && operation.op
            ? []
            : [issue('INVALID_OPERATION', `operations[${index}]`, 'Every operation requires an op value.')]
    ));
};

export const validateWorkflowVerifierResult = result => {
    if (!isObject(result)) return [issue('INVALID_VERIFIER_RESPONSE', '', 'Verifier response must be an object.')];
    const issues = [];
    if (!['pass', 'repair'].includes(result.status)) issues.push(issue('INVALID_VERIFIER_STATUS', 'status', 'Verifier status must be pass or repair.'));
    if (!Array.isArray(result.issues)) {
        issues.push(issue('INVALID_VERIFIER_ISSUES', 'issues', 'Verifier issues must be an array.'));
    } else {
        if (result.issues.length > MAX_VERIFIER_ISSUES) issues.push(issue('TOO_MANY_VERIFIER_ISSUES', 'issues', `At most ${MAX_VERIFIER_ISSUES} verifier issues are allowed.`));
        result.issues.forEach((item, index) => {
            if (!isObject(item)) issues.push(issue('INVALID_VERIFIER_ISSUE', `issues[${index}]`, 'Verifier issue must be an object.'));
            else {
                issues.push(...textIssues(item.message, `issues[${index}].message`, { required: true, max: 1000 }));
                issues.push(...textIssues(item.requirementId, `issues[${index}].requirementId`, { max: 100 }));
            }
        });
    }
    if (result.status === 'pass' && result.issues?.length) issues.push(issue('PASS_WITH_ISSUES', 'issues', 'A passing verification cannot contain issues.'));
    if (result.status === 'repair' && !result.issues?.length) issues.push(issue('REPAIR_WITHOUT_ISSUES', 'issues', 'A repair result requires at least one issue.'));
    return issues;
};

export const summarizeWorkflowOutputIssues = issues => (issues || [])
    .map(item => `${item.code || 'INVALID_OUTPUT'} at ${item.path || 'response'}: ${item.message || 'Invalid output.'}`)
    .join('\n');
