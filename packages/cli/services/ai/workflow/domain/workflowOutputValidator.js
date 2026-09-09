import {
    CONTROL_FLOW_NODE_KEYS,
    SEMANTIC_CONTROL_FLOW_NODE_KEYS,
    SWITCH_BRANCH_HANDLES,
    isLegacyControlFlowOperation,
    legacyOperationIssueForNodeKey
} from './editCompiler/contracts.js';
import { findUnsupportedWorkflowReferenceTokens } from '../../../../../shared/workflowExpressions.js';

const MAX_TEXT = 4000;
const MAX_REQUIREMENTS = 30;
const MAX_OPERATIONS = 50;
const MAX_VERIFIER_ISSUES = 3;
const INPUT_TYPES = new Set(['single_choice', 'multiple_choice', 'text', 'textarea', 'resource_choice', 'resource_picker']);
const PLANNER_TYPES = new Set(['reply', 'message', 'inspect_form', 'inspect_resource', 'resolve_resource', 'diagnose_run', 'direct_plan', 'plan_complete']);
const CAPABILITIES = new Set(['respondent_confirmation', 'owner_approval', 'per_submission_spreadsheet']);
const PLANNER_CAPABILITY_ALIASES = Object.freeze({
    approval: 'owner_approval',
    approval_gate: 'owner_approval',
    approval_step: 'owner_approval',
    request_approval: 'owner_approval',
    human_approval: 'owner_approval',
    manual_approval: 'owner_approval'
});
const RESOURCE_CHANGE_TYPES = new Set(['create_google_spreadsheet']);
const RESOURCE_CHANGE_TYPE_ALIASES = Object.freeze({
    create_google_sheet: 'create_google_spreadsheet',
    create_google_sheets: 'create_google_spreadsheet',
    create_sheet: 'create_google_spreadsheet',
    create_spreadsheet: 'create_google_spreadsheet',
    google_sheet: 'create_google_spreadsheet',
    google_spreadsheet: 'create_google_spreadsheet',
    creategooglesheet: 'create_google_spreadsheet',
    creategooglespreadsheet: 'create_google_spreadsheet'
});
const NON_CAPABILITY_PLANNER_LABELS = new Set([
    'form', 'forms', 'promptly_form', 'promptly_forms', 'form_submission',
    'google_sheet', 'google_sheets', 'google_spreadsheet', 'google_spreadsheets',
    'email', 'emails'
]);

const issue = (code, path, message) => ({ code, path, message });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const RAW_WORKFLOW_REFERENCE_RE = /\{\{[^{}]+\}\}/g;

const normalizedResourceChangeType = value => String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, '_');

const normalizedPlannerCapability = value => String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, '_');

const normalizedLinearStepRef = (value, index) => {
    const source = String(value || '').trim();
    const withWordBoundaries = source.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
    const slug = withWordBoundaries
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const prefixed = /^[a-z]/.test(slug) ? slug : slug ? `step_${slug}` : `step_${index + 1}`;
    return prefixed.slice(0, 64);
};

const normalizeLinearStepRefs = steps => {
    const refs = new Set();
    return steps.map((step, index) => {
        if (!isObject(step) || typeof step.ref !== 'string' || !step.ref.trim()) return step;
        const base = normalizedLinearStepRef(step.ref, index);
        let ref = base;
        let suffix = 2;
        while (refs.has(ref)) {
            const suffixText = `_${suffix}`;
            ref = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
            suffix += 1;
        }
        refs.add(ref);
        return ref === step.ref ? step : { ...step, ref };
    });
};

const uniquePlannerRequirementId = (index, usedIds) => {
    const base = `req_${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `${base}_${suffix}`;
        suffix += 1;
    }
    return id;
};

const normalizePlannerRequirements = requirements => {
    if (!Array.isArray(requirements)) return requirements;
    const usedIds = new Set();
    return requirements.map((requirement, index) => {
        if (typeof requirement === 'string') {
            const description = requirement.trim();
            if (!description) return requirement;
            const id = uniquePlannerRequirementId(index, usedIds);
            usedIds.add(id);
            return { id, description };
        }
        if (!isObject(requirement)) return requirement;

        const description = typeof requirement.description === 'string'
            ? requirement.description.trim()
            : requirement.description;
        if (typeof description !== 'string' || !description) return requirement;

        const hasId = typeof requirement.id === 'string' && requirement.id.trim();
        const id = hasId ? requirement.id : uniquePlannerRequirementId(index, usedIds);
        usedIds.add(id);
        if (id === requirement.id && description === requirement.description) return requirement;
        return { ...requirement, id, description };
    });
};

const normalizePlannerResourceChanges = changes => {
    if (!Array.isArray(changes)) return changes;
    const usedRefs = new Set(changes
        .filter(isObject)
        .map(change => change.ref)
        .filter(ref => typeof ref === 'string' && ref.trim()));
    let generatedRefIndex = 0;

    return changes.map(change => {
        if (!isObject(change)) return change;
        const alias = RESOURCE_CHANGE_TYPE_ALIASES[normalizedResourceChangeType(change.type)];
        let normalized = alias ? { ...change, type: alias } : change;
        if (normalized.type !== 'create_google_spreadsheet') return normalized;
        if (typeof normalized.ref === 'string' && normalized.ref.trim()) return normalized;

        let ref;
        do {
            generatedRefIndex += 1;
            ref = generatedRefIndex === 1
                ? 'response_spreadsheet'
                : `response_spreadsheet_${generatedRefIndex}`;
        } while (usedRefs.has(ref));
        usedRefs.add(ref);
        normalized = { ...normalized, ref };
        return normalized;
    });
};

const normalizePlannerCapabilities = capabilities => {
    if (!Array.isArray(capabilities)) return capabilities;
    return capabilities.flatMap(capability => {
        const namedCapability = isObject(capability)
            ? ['capability', 'name', 'value', 'id'].map(key => capability[key]).find(value => typeof value === 'string')
            : capability;
        if (typeof namedCapability !== 'string') return [capability];
        const normalized = normalizedPlannerCapability(namedCapability);
        // Node and resource catalog labels describe selectedNodeKeys, not
        // execution capabilities. Dropping only these known labels keeps
        // unknown capability values strict for validation and repair.
        if (NON_CAPABILITY_PLANNER_LABELS.has(normalized)) return [];
        const canonical = PLANNER_CAPABILITY_ALIASES[normalized] || normalized;
        return [CAPABILITIES.has(canonical) ? canonical : namedCapability];
    });
};

const normalizePlannerLinearSteps = (steps, requirements) => {
    if (!Array.isArray(steps)) return steps;
    const normalizedSteps = normalizeLinearStepRefs(steps);
    if (normalizedSteps.length < 2 || normalizedSteps.length > 8) return undefined;

    const requirementIds = new Set((requirements || [])
        .filter(isObject)
        .map(requirement => requirement.id)
        .filter(id => typeof id === 'string' && id));
    const mappedRequirementIds = new Set();
    for (const step of normalizedSteps) {
        if (!isObject(step)
            || typeof step.ref !== 'string' || !step.ref.trim()
            || typeof step.nodeKey !== 'string' || !step.nodeKey.trim()
            || (step.config !== undefined && !isObject(step.config))
            || !Array.isArray(step.requirementIds) || step.requirementIds.length === 0) {
            return undefined;
        }
        for (const requirementId of step.requirementIds) {
            if (typeof requirementId !== 'string' || !requirementId.trim() || !requirementIds.has(requirementId)) {
                return undefined;
            }
            mappedRequirementIds.add(requirementId);
        }
    }
    return [...requirementIds].every(requirementId => mappedRequirementIds.has(requirementId))
        ? normalizedSteps
        : undefined;
};

const normalizePlannerType = result => {
    if (!isObject(result)) return result;
    const type = String(result.type || '').trim().toLocaleLowerCase();
    if (PLANNER_TYPES.has(type)) return type === result.type ? result : { ...result, type };
    // Some OpenAI-compatible models preserve every required plan field but
    // occasionally omit the discriminator. Infer it only from the complete
    // plan core, so ordinary incomplete objects remain validation failures.
    const hasCompletePlanCore = typeof result.summary === 'string'
        && Array.isArray(result.requirements)
        && Array.isArray(result.selectedNodeKeys);
    if (!type && hasCompletePlanCore) {
        return { ...result, type: Array.isArray(result.operations) ? 'direct_plan' : 'plan_complete' };
    }
    if (['clarification', 'clarify', 'question'].includes(type)) return { ...result, type: 'message' };
    if (['response', 'answer', 'text'].includes(type)) return { ...result, type: 'reply' };
    if (['proposal', 'plan', 'workflow', 'workflow_plan', 'workflow_proposal', 'direct_proposal'].includes(type)) {
        return { ...result, type: Array.isArray(result.operations) ? 'direct_plan' : 'plan_complete' };
    }
    return result;
};

/**
 * Keep the planner contract strict while tolerating common model spellings at
 * the AI boundary. The persisted/apply contract remains exactly
 * create_google_spreadsheet; unknown resource types are left untouched so the
 * validator can reject them instead of silently dropping a requested change.
 */
export const normalizeWorkflowPlannerResult = (result, { existingWorkflow = null } = {}) => {
    if (!isObject(result)) return result;
    result = normalizePlannerType(result);
    const hasExistingGraph = (existingWorkflow?.nodes || []).length > 0
        || (existingWorkflow?.edges || []).length > 0;
    const { linearSteps, ...withoutLinearBlueprint } = result;
    const requirements = Array.isArray(withoutLinearBlueprint.requirements)
        ? normalizePlannerRequirements(withoutLinearBlueprint.requirements)
        : withoutLinearBlueprint.requirements;
    const normalizedLinearSteps = normalizePlannerLinearSteps(linearSteps, requirements);
    return {
        ...withoutLinearBlueprint,
        ...(Array.isArray(withoutLinearBlueprint.requirements) ? { requirements } : {}),
        ...(Array.isArray(withoutLinearBlueprint.capabilities) ? {
            capabilities: normalizePlannerCapabilities(withoutLinearBlueprint.capabilities)
        } : {}),
        // linearSteps are an optional deterministic fallback. If the model
        // supplied an incomplete blueprint, omit it and let the worker build
        // from the validated requirements and selected node keys instead.
        ...(!hasExistingGraph && normalizedLinearSteps !== undefined ? { linearSteps: normalizedLinearSteps } : {}),
        ...(Array.isArray(withoutLinearBlueprint.resourceChanges) ? {
            resourceChanges: normalizePlannerResourceChanges(withoutLinearBlueprint.resourceChanges)
        } : {})
    };
};

const schemaByNodeKey = specs => new Map((specs || []).map(spec => [
    spec?.nodeKey || `${spec?.type || ''}:${spec?.subType || ''}`,
    spec?.schema || {}
]));

const nodeForRef = (workflow, nodeRef) => {
    const index = Number(String(nodeRef || '').replace(/^n/, ''));
    return Number.isInteger(index) && index > 0 ? workflow?.nodes?.[index - 1] || null : null;
};

const rawReferenceIssues = (value, path, issues) => {
    if (typeof value === 'string') {
        for (const match of value.matchAll(RAW_WORKFLOW_REFERENCE_RE)) {
            issues.push(issue(
                'WORKFLOW_REFERENCE_RAW_TOKEN',
                path,
                'Use a structured $binding or $template for workflow data instead of a legacy double-brace workflow reference.'
            ));
        }
        for (const token of findUnsupportedWorkflowReferenceTokens(value)) {
            issues.push(issue(
                'WORKFLOW_REFERENCE_RAW_TOKEN',
                path,
                'Use a structured $binding or $template for workflow data instead of unsupported interpolation syntax.'
            ));
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => rawReferenceIssues(item, `${path}[${index}]`, issues));
        return;
    }
    if (isObject(value)) {
        Object.entries(value).forEach(([key, item]) => rawReferenceIssues(item, `${path}.${key}`, issues));
    }
};

const workflowReferenceIssuesInConfig = ({ config, path, schema, issues }) => {
    const workflowInputs = new Set((schema?.inputs || [])
        .filter(input => input?.valueSyntax === 'workflow-expression')
        .map(input => input.name));
    for (const [name, value] of Object.entries(config || {})) {
        if (workflowInputs.has(name)) rawReferenceIssues(value, `${path}.${name}`, issues);
    }
};

const rawWorkflowReferenceIssues = ({ operations = [], specs = [], workflow = null } = {}) => {
    const schemas = schemaByNodeKey(specs);
    const issues = [];
    const inspectNode = (node, path, fallbackSchema = {}) => {
        if (!isObject(node) || !isObject(node.config)) return;
        const key = node.nodeKey || `${node.type || ''}:${node.subType || ''}`;
        workflowReferenceIssuesInConfig({ config: node.config, path: `${path}.config`, schema: schemas.get(key) || fallbackSchema, issues });
    };
    const inspect = (value, path) => {
        if (!isObject(value)) return;
        if (isObject(value.config) && (value.nodeKey || value.ref)) inspectNode(value, path);
        if (isObject(value.node) && (value.node.nodeKey || value.node.config)) inspectNode(value.node, `${path}.node`);
        if (value.op === 'update_node' && isObject(value.updates?.config)) {
            const existing = nodeForRef(workflow, value.nodeRef);
            const key = existing?.nodeKey || `${existing?.type || ''}:${existing?.subType || ''}`;
            workflowReferenceIssuesInConfig({ config: value.updates.config, path: `${path}.updates.config`, schema: schemas.get(key) || existing?.schema || {}, issues });
        }
        for (const [key, child] of Object.entries(value)) {
            if (key === 'config' || key === 'updates' || key === 'node') continue;
            if (isObject(child) || Array.isArray(child)) inspect(child, `${path}.${key}`);
        }
    };
    const inspectSemanticConfig = (operation, path) => {
        const definitions = [
            ['condition', CONTROL_FLOW_NODE_KEYS.condition],
            ['handler', CONTROL_FLOW_NODE_KEYS.catchError],
            ['approval', CONTROL_FLOW_NODE_KEYS.approval],
            ['merge', CONTROL_FLOW_NODE_KEYS.merge]
        ];
        definitions.forEach(([name, nodeKey]) => {
            const definition = operation?.[name];
            if (isObject(definition?.config)) {
                inspectNode({ nodeKey, config: definition.config }, `${path}.${name}`, schemas.get(nodeKey) || {});
            }
        });
        if (operation?.op === 'add_switch_routes') {
            const config = {
                valueToTest: operation.switch?.config?.valueToTest,
                cases: (operation.cases || []).map(routeCase => routeCase?.value)
            };
            inspectNode({ nodeKey: CONTROL_FLOW_NODE_KEYS.switch, config }, `${path}.switch`, schemas.get(CONTROL_FLOW_NODE_KEYS.switch) || {});
        }
    };
    operations.forEach((operation, index) => {
        const path = `operations[${index}]`;
        inspectSemanticConfig(operation, path);
        inspect(operation, path);
    });
    return issues;
};

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
        if (['resource_choice', 'resource_picker'].includes(input.type)) {
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
        if (!RESOURCE_CHANGE_TYPES.has(change.type)) {
            issues.push({
                ...issue('INVALID_RESOURCE_CHANGE_TYPE', `${path}.type`, 'Unsupported resource change type. Use create_google_spreadsheet for a proposed Google Sheet.'),
                allowed: [...RESOURCE_CHANGE_TYPES]
            });
        }
        // The planner may omit a new Sheet title. The pipeline derives a safe
        // title from the selected form/request before provisioning; keep the
        // downstream resource contract strict once that normalization runs.
        issues.push(...textIssues(change.title, `${path}.title`, { max: 180 }));
        if (change.sheetTitle !== undefined) issues.push(...textIssues(change.sheetTitle, `${path}.sheetTitle`, { max: 100 }));
        if (change.ref && refs.has(change.ref)) issues.push(issue('DUPLICATE_RESOURCE_CHANGE_REF', `${path}.ref`, 'Resource change refs must be unique.'));
        refs.add(change.ref);
    });
    return issues;
};

const LINEAR_STEP_REF = /^[a-z][a-z0-9_]{0,63}$/;
const CONDITION_OPERATORS_WITHOUT_VALUE_B = new Set(['exists', 'empty', 'truthy', 'falsy']);
const MERGE_MODES = new Set(['object', 'array', 'last']);

const missingConditionValue = value => value === undefined || value === null || (typeof value === 'string' && !value.trim());

const validateConditionBranchAction = (action, path) => {
    if (action === null || action === undefined) return [];
    if (!isObject(action)) return [issue('WORKFLOW_CONDITION_BRANCH_ACTION_INVALID', path, 'Each conditional outcome must be a node definition.')];
    const issues = [
        ...textIssues(action.nodeKey, `${path}.nodeKey`, { required: true, max: 150 })
    ];
    if (SEMANTIC_CONTROL_FLOW_NODE_KEYS.has(action.nodeKey)) {
        issues.push(issue('WORKFLOW_CONDITION_BRANCH_ACTION_INVALID', `${path}.nodeKey`, 'A conditional outcome must be an ordinary node. Add another control-flow step with its semantic operation.'));
    }
    if (!isObject(action.config)) issues.push(issue('WORKFLOW_CONDITION_BRANCH_ACTION_INVALID', `${path}.config`, 'Each conditional outcome requires a config object.'));
    if (action.title !== undefined) issues.push(...textIssues(action.title, `${path}.title`, { max: 180 }));
    if (action.description !== undefined) issues.push(...textIssues(action.description, `${path}.description`, { max: 1000 }));
    if (action.afterNodeRef !== undefined) issues.push(...textIssues(action.afterNodeRef, `${path}.afterNodeRef`, { max: 64 }));
    return issues;
};

const validateConditionBranchOperation = (operation, path) => {
    const issues = [];
    if (!isObject(operation.from)) {
        issues.push(issue('WORKFLOW_CONDITION_SOURCE_HANDLE_REQUIRED', `${path}.from`, 'A conditional branch must identify the existing source route.'));
    } else {
        issues.push(...textIssues(operation.from.nodeRef, `${path}.from.nodeRef`, { required: true, max: 64 }));
        if (missingConditionValue(operation.from.handle)) {
            issues.push(issue('WORKFLOW_CONDITION_SOURCE_HANDLE_REQUIRED', `${path}.from.handle`, 'A conditional branch must identify the source route handle.'));
        } else {
            issues.push(...textIssues(operation.from.handle, `${path}.from.handle`, { required: true, max: 100 }));
        }
    }

    const condition = operation.condition;
    if (!isObject(condition)) {
        issues.push(issue('WORKFLOW_CONDITION_BRANCH_INVALID', `${path}.condition`, 'A conditional branch requires a condition definition.'));
    } else {
        if (condition.title !== undefined) issues.push(...textIssues(condition.title, `${path}.condition.title`, { max: 180 }));
        if (condition.description !== undefined) issues.push(...textIssues(condition.description, `${path}.condition.description`, { max: 1000 }));
        if (condition.afterNodeRef !== undefined) issues.push(...textIssues(condition.afterNodeRef, `${path}.condition.afterNodeRef`, { max: 64 }));
        if (!isObject(condition.config)) {
            issues.push(issue('WORKFLOW_CONDITION_CONFIG_INVALID', `${path}.condition.config`, 'A conditional branch requires a condition config object.'));
        } else {
            if (missingConditionValue(condition.config.valueA)) {
                issues.push(issue('WORKFLOW_CONDITION_CONFIG_INVALID', `${path}.condition.config.valueA`, 'The condition needs a value to evaluate.'));
            }
            issues.push(...textIssues(condition.config.operator, `${path}.condition.config.operator`, { required: true, max: 100 }));
            if (!CONDITION_OPERATORS_WITHOUT_VALUE_B.has(condition.config.operator) && missingConditionValue(condition.config.valueB)) {
                issues.push(issue('WORKFLOW_CONDITION_CONFIG_INVALID', `${path}.condition.config.valueB`, 'The condition needs the value to compare against.'));
            }
        }
    }

    if (operation.whenTrue === null || operation.whenTrue === undefined) {
        if (operation.whenFalse === null || operation.whenFalse === undefined) {
            issues.push(issue('WORKFLOW_CONDITION_BRANCH_ACTION_INVALID', path, 'A conditional branch needs at least one outcome; set the unused route to null to end that path.'));
        }
    }
    issues.push(...validateConditionBranchAction(operation.whenTrue, `${path}.whenTrue`));
    issues.push(...validateConditionBranchAction(operation.whenFalse, `${path}.whenFalse`));
    return issues;
};

const validateEndpoint = (endpoint, path, { code, message, requireHandle = false } = {}) => {
    if (!isObject(endpoint)) return [issue(code, path, message)];
    const issues = textIssues(endpoint.nodeRef, `${path}.nodeRef`, { required: true, max: 64 });
    if (requireHandle && missingConditionValue(endpoint.handle)) {
        issues.push(issue(code, `${path}.handle`, `${message} Include the route handle.`));
    } else if (endpoint.handle !== undefined && endpoint.handle !== null) {
        issues.push(...textIssues(endpoint.handle, `${path}.handle`, { required: true, max: 100 }));
    }
    return issues;
};

const validateControlDefinition = (definition, path, { code, message, config = true } = {}) => {
    if (!isObject(definition)) return [issue(code, path, message)];
    const issues = [];
    if (definition.title !== undefined) issues.push(...textIssues(definition.title, `${path}.title`, { max: 180 }));
    if (definition.description !== undefined) issues.push(...textIssues(definition.description, `${path}.description`, { max: 1000 }));
    if (definition.afterNodeRef !== undefined) issues.push(...textIssues(definition.afterNodeRef, `${path}.afterNodeRef`, { max: 64 }));
    if (config && !isObject(definition.config)) issues.push(issue(code, `${path}.config`, `${message} It needs a config object.`));
    return issues;
};

const validateSemanticAction = (action, path, { code, message } = {}) => {
    if (!isObject(action)) return [issue(code, path, message)];
    const issues = [
        ...textIssues(action.nodeKey, `${path}.nodeKey`, { required: true, max: 150 })
    ];
    if (SEMANTIC_CONTROL_FLOW_NODE_KEYS.has(action.nodeKey)) {
        issues.push(issue(code, `${path}.nodeKey`, 'Use a separate semantic operation for a control-flow node.'));
    }
    if (!isObject(action.config)) issues.push(issue(code, `${path}.config`, `${message} It needs a config object.`));
    if (action.title !== undefined) issues.push(...textIssues(action.title, `${path}.title`, { max: 180 }));
    if (action.description !== undefined) issues.push(...textIssues(action.description, `${path}.description`, { max: 1000 }));
    if (action.afterNodeRef !== undefined) issues.push(...textIssues(action.afterNodeRef, `${path}.afterNodeRef`, { max: 64 }));
    return issues;
};

const validateSwitchRoutesOperation = (operation, path) => {
    const issues = [
        ...validateEndpoint(operation.from, `${path}.from`, {
            code: 'WORKFLOW_SWITCH_SOURCE_HANDLE_REQUIRED',
            message: 'A Switch must identify the source route.',
            requireHandle: true
        }),
        ...validateControlDefinition(operation.switch, `${path}.switch`, {
            code: 'WORKFLOW_SWITCH_INVALID',
            message: 'A Switch route needs a Switch definition.'
        })
    ];
    const switchDefinition = operation.switch;
    if (isObject(switchDefinition?.config) && missingConditionValue(switchDefinition.config.valueToTest)) {
        issues.push(issue('WORKFLOW_SWITCH_CONFIG_INVALID', `${path}.switch.config.valueToTest`, 'A Switch needs a value to test.'));
    }
    if (!Array.isArray(operation.cases) || operation.cases.length === 0 || operation.cases.length > SWITCH_BRANCH_HANDLES.length) {
        issues.push(issue('WORKFLOW_SWITCH_CASES_INVALID', `${path}.cases`, 'A Switch needs one or two case routes.'));
    } else {
        const values = new Set();
        operation.cases.forEach((routeCase, index) => {
            const casePath = `${path}.cases[${index}]`;
            if (!isObject(routeCase) || !Object.hasOwn(routeCase || {}, 'value')) {
                issues.push(issue('WORKFLOW_SWITCH_CASE_INVALID', casePath, 'Each Switch case needs a value and an action.'));
                return;
            }
            if (!['string', 'number', 'boolean'].includes(typeof routeCase.value) && routeCase.value !== null) {
                issues.push(issue('WORKFLOW_SWITCH_CASE_INVALID', `${casePath}.value`, 'Switch case values must be strings, numbers, booleans, or null.'));
            } else {
                const key = JSON.stringify(routeCase.value);
                if (values.has(key)) issues.push(issue('WORKFLOW_SWITCH_CASE_INVALID', `${casePath}.value`, 'Switch case values must be unique.'));
                values.add(key);
            }
            issues.push(...validateSemanticAction(routeCase.action, `${casePath}.action`, {
                code: 'WORKFLOW_SWITCH_CASE_ACTION_INVALID',
                message: 'Each Switch case needs an action.'
            }));
        });
    }
    issues.push(...validateSemanticAction(operation.otherwise, `${path}.otherwise`, {
        code: 'WORKFLOW_SWITCH_DEFAULT_ACTION_INVALID',
        message: 'A Switch needs a default action.'
    }));
    return issues;
};

const validateErrorHandlerOperation = (operation, path) => {
    const issues = [
        ...validateEndpoint(operation.connection?.from, `${path}.connection.from`, {
            code: 'WORKFLOW_ERROR_HANDLER_CONNECTION_INVALID',
            message: 'An error handler needs the existing source connection.'
        }),
        ...validateEndpoint(operation.connection?.to, `${path}.connection.to`, {
            code: 'WORKFLOW_ERROR_HANDLER_CONNECTION_INVALID',
            message: 'An error handler needs the existing destination connection.'
        }),
        ...validateControlDefinition(operation.handler, `${path}.handler`, {
            code: 'WORKFLOW_ERROR_HANDLER_INVALID',
            message: 'An error handler needs a Catch Error definition.'
        }),
        ...validateSemanticAction(operation.whenError, `${path}.whenError`, {
            code: 'WORKFLOW_ERROR_HANDLER_RECOVERY_INVALID',
            message: 'An error handler needs a recovery action.'
        })
    ];
    return issues;
};

const validateApprovalGateOperation = (operation, path) => {
    const isNewRoute = !isObject(operation.connection);
    const issues = isNewRoute
        ? [
            ...validateEndpoint(operation.from, `${path}.from`, {
                code: 'WORKFLOW_APPROVAL_SOURCE_HANDLE_REQUIRED',
                message: 'A new approval route needs the source route to review.',
                requireHandle: true
            }),
            ...validateSemanticAction(operation.whenApproved, `${path}.whenApproved`, {
                code: 'WORKFLOW_APPROVAL_APPROVED_ACTION_INVALID',
                message: 'A new approval route needs an approved action.'
            })
        ]
        : [
            ...validateEndpoint(operation.connection?.from, `${path}.connection.from`, {
                code: 'WORKFLOW_APPROVAL_GATE_CONNECTION_INVALID',
                message: 'An approval gate needs the existing source connection.'
            }),
            ...validateEndpoint(operation.connection?.to, `${path}.connection.to`, {
                code: 'WORKFLOW_APPROVAL_GATE_CONNECTION_INVALID',
                message: 'An approval gate needs the existing destination connection.'
            })
        ];
    issues.push(...validateControlDefinition(operation.approval, `${path}.approval`, {
        code: 'WORKFLOW_APPROVAL_GATE_INVALID',
        message: 'An approval gate needs an Approval definition.'
    }));
    if (operation.whenRejected !== undefined && operation.whenRejected !== null) {
        issues.push(...validateSemanticAction(operation.whenRejected, `${path}.whenRejected`, {
            code: 'WORKFLOW_APPROVAL_REJECTED_ACTION_INVALID',
            message: 'The rejected route needs an action.'
        }));
    }
    return issues;
};

const validateTerminalApprovalOperation = (operation, path) => [
    ...validateEndpoint(operation.from, `${path}.from`, {
        code: 'WORKFLOW_TERMINAL_APPROVAL_SOURCE_INVALID',
        message: 'A terminal approval needs the source route to review.',
        requireHandle: true
    }),
    ...validateControlDefinition(operation.approval, `${path}.approval`, {
        code: 'WORKFLOW_TERMINAL_APPROVAL_INVALID',
        message: 'A terminal approval needs an Approval definition.'
    })
];

const validateMoveApprovalGateOperation = (operation, path) => {
    const issues = [
        ...textIssues(operation.approvalNodeRef, `${path}.approvalNodeRef`, { required: true, max: 64 }),
        ...validateEndpoint(operation.connection?.from, `${path}.connection.from`, {
        code: 'WORKFLOW_APPROVAL_GATE_CONNECTION_INVALID',
        message: 'An approval move needs the existing source connection.'
        }),
        ...validateEndpoint(operation.connection?.to, `${path}.connection.to`, {
        code: 'WORKFLOW_APPROVAL_GATE_CONNECTION_INVALID',
        message: 'An approval move needs the existing destination connection.'
        })
    ];
    if (operation.approvalUpdates === undefined) return issues;
    if (!isObject(operation.approvalUpdates)) {
        issues.push(issue('WORKFLOW_APPROVAL_MOVE_INVALID', `${path}.approvalUpdates`, 'Approval updates must be an object.'));
        return issues;
    }
    issues.push(...textIssues(operation.approvalUpdates.title, `${path}.approvalUpdates.title`, { max: 180 }));
    issues.push(...textIssues(operation.approvalUpdates.description, `${path}.approvalUpdates.description`, { max: 1000 }));
    if (operation.approvalUpdates.config !== undefined && !isObject(operation.approvalUpdates.config)) {
        issues.push(issue('WORKFLOW_APPROVAL_MOVE_INVALID', `${path}.approvalUpdates.config`, 'Approval updates need a config object.'));
    }
    return issues;
};

const validateJoinBranchesOperation = (operation, path) => {
    const issues = [];
    if (!Array.isArray(operation.branches) || operation.branches.length < 2 || operation.branches.length > 12) {
        issues.push(issue('WORKFLOW_MERGE_BRANCHES_INVALID', `${path}.branches`, 'A branch join needs between two and twelve incoming routes.'));
    } else {
        const routes = new Set();
        operation.branches.forEach((branch, index) => {
            const branchPath = `${path}.branches[${index}].from`;
            issues.push(...validateEndpoint(branch?.from, branchPath, {
                code: 'WORKFLOW_MERGE_BRANCH_INVALID',
                message: 'Each branch join input needs a source route.'
            }));
            const route = branch?.from?.nodeRef ? `${branch.from.nodeRef}:${branch.from.handle || ''}` : null;
            if (route) {
                if (routes.has(route)) issues.push(issue('WORKFLOW_MERGE_BRANCHES_DUPLICATE', branchPath, 'Each branch join input must be different.'));
                routes.add(route);
            }
        });
    }
    issues.push(...validateControlDefinition(operation.merge, `${path}.merge`, {
        code: 'WORKFLOW_MERGE_INVALID',
        message: 'A branch join needs a Merge definition.'
    }));
    if (isObject(operation.merge?.config) && operation.merge.config.mergeMode !== undefined && !MERGE_MODES.has(operation.merge.config.mergeMode)) {
        issues.push(issue('WORKFLOW_MERGE_CONFIG_INVALID', `${path}.merge.config.mergeMode`, 'Merge mode must be object, array, or last.'));
    }
    issues.push(...validateSemanticAction(operation.continueWith, `${path}.continueWith`, {
        code: 'WORKFLOW_MERGE_CONTINUATION_INVALID',
        message: 'A branch join needs a post-merge action.'
    }));
    return issues;
};

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
    if (result.type === 'resolve_resource') {
        if (!['google_form_response_source', 'google_sheet_row_source'].includes(result.recipe)) {
            issues.push(issue('INVALID_RESOURCE_RECIPE', 'recipe', 'Unsupported resource resolution recipe.'));
        }
        issues.push(...textIssues(result.query, 'query', { max: 300 }));
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

export const validateWorkflowWorkerResult = (result, { specs = [], workflow = null } = {}) => {
    if (!isObject(result)) return [issue('INVALID_WORKER_RESPONSE', '', 'Worker response must be an object.')];
    if (!Array.isArray(result.operations)) return [issue('INVALID_OPERATIONS', 'operations', 'Worker operations must be an array.')];
    if (result.operations.length === 0) return [issue('EMPTY_OPERATIONS', 'operations', 'An edit proposal must contain at least one operation.')];
    if (result.operations.length > MAX_OPERATIONS) return [issue('TOO_MANY_OPERATIONS', 'operations', `At most ${MAX_OPERATIONS} operations are allowed.`)];
    return [
        ...rawWorkflowReferenceIssues({ operations: result.operations, specs, workflow }),
        ...result.operations.flatMap((operation, index) => {
        const path = `operations[${index}]`;
        if (!isObject(operation) || typeof operation.op !== 'string' || !operation.op) {
            return [issue('INVALID_OPERATION', path, 'Every operation requires an op value.')];
        }
        if (isLegacyControlFlowOperation(operation)) {
            const requirement = legacyOperationIssueForNodeKey(operation.node?.nodeKey);
            return [issue(requirement.code, `${path}.node.nodeKey`, requirement.message)];
        }
        switch (operation.op) {
        case 'add_condition_branch':
            return validateConditionBranchOperation(operation, path);
        case 'add_switch_routes':
            return validateSwitchRoutesOperation(operation, path);
        case 'add_error_handler':
            return validateErrorHandlerOperation(operation, path);
        case 'add_approval_gate':
            return validateApprovalGateOperation(operation, path);
        case 'add_terminal_approval':
            return validateTerminalApprovalOperation(operation, path);
        case 'move_approval_gate':
            return validateMoveApprovalGateOperation(operation, path);
        case 'join_branches':
            return validateJoinBranchesOperation(operation, path);
        default:
            return [];
        }
        })
    ];
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
