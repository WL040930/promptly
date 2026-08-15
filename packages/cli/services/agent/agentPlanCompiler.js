import crypto from 'crypto';
import Ajv from 'ajv';

const MAX_STEPS = 16;
const MAX_DEPENDENCIES = 12;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const ajv = new Ajv({ allErrors: true, strict: false, removeAdditional: false });
const validatorCache = new WeakMap();

const issue = (code, path, message, details = {}) => ({ code, path, message, ...details });

const requestedDomains = intent => {
    const operations = Array.isArray(intent?.requestedOperations) ? intent.requestedOperations : [];
    return operations.length > 0
        ? [...new Set(operations.map(operation => operation.domain).filter(Boolean))]
        : (Array.isArray(intent?.domains) ? intent.domains : []);
};

const stepCapability = step => String(step?.capability || step?.type || '').trim();
const boundedArgs = value => isPlainObject(value)
    ? Object.fromEntries(Object.entries(value).slice(0, 24).map(([key, item]) => [String(key).slice(0, 120), clone(item)]))
    : {};

const outcomeMatchesArtifact = (outcome, artifactType) => {
    if ((outcome.artifactTypes || []).includes(artifactType)) return true;
    const text = `${outcome.id} ${outcome.title} ${outcome.description}`.toLowerCase();
    return artifactType === 'form_proposal'
        ? /\b(form|survey)\b/.test(text)
        : artifactType === 'workflow_proposal'
            ? /\b(workflow|automation)\b/.test(text)
            : false;
};

const normalizeOutcome = (outcome, index) => ({
    id: String(outcome?.id || `outcome_${index + 1}`).trim(),
    title: String(outcome?.title || outcome?.type || `Outcome ${index + 1}`).trim(),
    description: String(outcome?.description || outcome?.reason || '').trim(),
    dependsOn: Array.isArray(outcome?.dependsOn)
        ? outcome.dependsOn.map(String).filter(dependency => dependency !== String(outcome?.id || `outcome_${index + 1}`).trim()).slice(0, MAX_DEPENDENCIES)
        : [],
    artifactTypes: Array.isArray(outcome?.artifactTypes) ? outcome.artifactTypes.map(String).slice(0, 8) : [],
    affectedResources: Array.isArray(outcome?.affectedResources) ? clone(outcome.affectedResources).slice(0, 8) : [],
    risk: ['low', 'medium', 'high'].includes(outcome?.risk) ? outcome.risk : 'medium'
});

const outcomesFrom = (value = {}) => {
    if (Array.isArray(value.outcomes) && value.outcomes.length > 0) {
        return value.outcomes.slice(0, 12).map(normalizeOutcome);
    }
    return [];
};

const requiredOutcomeDefinitions = (intent = {}) => {
    const outcomes = [];
    const domains = requestedDomains(intent);
    if (domains.includes('form')) outcomes.push({
        id: 'form_solution',
        title: intent.goal === 'modify' ? 'Update the form' : 'Create the form',
        description: 'Prepare a reviewable form proposal.',
        artifactTypes: ['form_proposal'],
        risk: intent.risk || 'medium'
    });
    if (domains.includes('workflow')) outcomes.push({
        id: 'workflow_solution',
        title: intent.goal === 'modify' ? 'Update the workflow' : 'Create the workflow',
        description: 'Prepare a reviewable workflow proposal using supported nodes and account resources.',
        artifactTypes: ['workflow_proposal'],
        dependsOn: domains.includes('form') ? ['form_solution'] : [],
        risk: intent.risk || 'medium'
    });
    return outcomes;
};

const ensureOutcomeCoverage = (outcomes, intent = {}) => {
    const required = requiredOutcomeDefinitions(intent);
    const canonical = required.map((definition, index) => {
        const source = outcomes.find(outcome => outcomeMatchesArtifact(outcome, definition.artifactTypes[0]));
        return normalizeOutcome({
            ...definition,
            ...(source || {}),
            id: definition.id,
            dependsOn: definition.dependsOn || []
        }, index);
    });
    const requiredIds = new Set(canonical.map(outcome => outcome.id));
    const canonicalIds = new Set(required.map(outcome => outcome.id));
    const extras = outcomes
        .filter(outcome => !outcomeMatchesArtifact(outcome, 'form_proposal') && !outcomeMatchesArtifact(outcome, 'workflow_proposal'))
        .map((outcome, index) => normalizeOutcome({
            ...outcome,
            dependsOn: (outcome.dependsOn || []).filter(dependency => canonicalIds.has(dependency))
        }, canonical.length + index));
    return [
        ...canonical.filter(outcome => requiredIds.has(outcome.id)),
        ...extras
    ].slice(0, 12);
};

export const makeOutcomePlan = (value = {}, intent = {}) => ({
    schemaVersion: 2,
    id: String(value.id || `plan_${crypto.randomUUID().replace(/-/g, '')}`).slice(0, 100),
    summary: String(value.summary || 'Prepare the requested solution.').trim().slice(0, 2000),
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.slice(0, 10).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    missingInformation: Array.isArray(value.missingInformation) ? value.missingInformation.slice(0, 8).map(item => String(item).trim().slice(0, 500)).filter(Boolean) : [],
    affectedResources: Array.isArray(value.affectedResources) ? clone(value.affectedResources).slice(0, 10) : [],
    outcomes: ensureOutcomeCoverage(outcomesFrom(value), intent),
    approvalRequired: true,
    intent: {
        goal: intent.goal || null,
        domains: requestedDomains(intent),
        requestedOperations: Array.isArray(intent.requestedOperations) ? intent.requestedOperations : []
    }
});

export const makeAdaptivePlan = (value = {}, intent = {}) => {
    const outcomePlan = makeOutcomePlan(value, intent);
    // The model owns outcomes; the compiler owns the executable capability graph.
    // This prevents model output such as `registered_capability` from reaching
    // the runtime and keeps the graph deterministic for supported domains.
    return { ...outcomePlan, steps: clone(makeFallbackExecutionSteps(intent)) };
};

const makeFallbackExecutionSteps = (intent = {}) => {
    const domains = requestedDomains(intent);
    const steps = [];
    if (domains.includes('form')) {
        steps.push({ id: 'design_form', type: 'design_form', title: 'Prepare the form proposal', dependsOn: [] });
    }
    if (domains.includes('workflow')) {
        steps.push({
            id: 'design_workflow',
            type: 'design_workflow',
            title: 'Prepare the workflow proposal',
            dependsOn: domains.includes('form') ? ['design_form'] : []
        });
    }
    return steps;
};

export const makeFallbackOutcomePlan = (intent = {}) => {
    const outcomes = requiredOutcomeDefinitions(intent);
    if (outcomes.length === 0) outcomes.push({
        id: 'solution',
        title: 'Prepare the requested solution',
        description: 'Inspect the request and produce the safest supported result.',
        artifactTypes: [],
        risk: intent.risk || 'medium'
    });
    return makeAdaptivePlan({
        summary: 'I prepared the requested solution for review.',
        outcomes,
        approvalRequired: true
    }, intent);
};

const validateArgs = (args, schema, path) => {
    if (!schema) return [];
    let validate = validatorCache.get(schema);
    if (!validate) {
        try {
            validate = ajv.compile(schema);
            validatorCache.set(schema, validate);
        } catch (error) {
            return [issue('CAPABILITY_SCHEMA_INVALID', path, `Capability input schema could not be compiled: ${error.message}`)];
        }
    }
    if (validate(args)) return [];
    return (validate.errors || []).slice(0, 12).map(error => issue(
        'CAPABILITY_ARGUMENT_INVALID',
        `${path}${error.instancePath || ''}`,
        error.message || 'Capability arguments are invalid.',
        { keyword: error.keyword, params: error.params }
    ));
};

const collectReferences = (value, refs = []) => {
    if (typeof value === 'string') {
        const match = value.match(/^\$step\.([^.]+)(?:\.|$)/);
        if (match) refs.push(match[1]);
        return refs;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectReferences(item, refs));
        return refs;
    }
    if (isPlainObject(value)) Object.values(value).forEach(item => collectReferences(item, refs));
    return refs;
};

const topologicalOrder = steps => {
    const ids = new Set(steps.map(step => step.id));
    const indegree = new Map(steps.map(step => [step.id, 0]));
    const outgoing = new Map(steps.map(step => [step.id, []]));
    const issues = [];

    steps.forEach(step => {
        step.dependsOn.forEach(dependency => {
            if (!ids.has(dependency)) {
                issues.push(issue('UNKNOWN_PLAN_DEPENDENCY', `steps.${step.id}.dependsOn`, `Step '${step.id}' depends on unknown step '${dependency}'.`));
                return;
            }
            indegree.set(step.id, indegree.get(step.id) + 1);
            outgoing.get(dependency).push(step.id);
        });
    });
    if (issues.length > 0) return { order: [], issues };

    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
    const order = [];
    while (queue.length > 0) {
        const id = queue.shift();
        order.push(id);
        for (const target of outgoing.get(id) || []) {
            indegree.set(target, indegree.get(target) - 1);
            if (indegree.get(target) === 0) queue.push(target);
        }
    }
    if (order.length !== steps.length) {
        issues.push(issue('PLAN_CYCLE', 'steps', 'The plan contains a dependency cycle. Remove the cycle or split the dependent work.'));
    }
    return { order, issues };
};

const outcomeById = plan => new Map((plan.outcomes || []).map(outcome => [outcome.id, outcome]));

export const compileExecutionPlan = ({ plan, registry, context = {} } = {}) => {
    const rawSteps = Array.isArray(plan?.execution?.steps)
        ? plan.execution.steps
        : Array.isArray(plan?.steps) ? plan.steps : [];
    const issues = [];
    if (!registry || typeof registry.get !== 'function') {
        return { valid: false, issues: [issue('CAPABILITY_REGISTRY_MISSING', 'registry', 'An agent capability registry is required.')] };
    }
    if (rawSteps.length === 0) {
        return { valid: false, issues: [issue('PLAN_STEPS_MISSING', 'steps', 'The plan did not contain an executable capability step.')] };
    }
    if (rawSteps.length > MAX_STEPS) issues.push(issue('PLAN_TOO_LARGE', 'steps', `The plan contains more than ${MAX_STEPS} executable steps.`));

    const seen = new Set();
    const steps = rawSteps.slice(0, MAX_STEPS).map((rawStep, index) => {
        const id = String(rawStep?.id || `step_${index + 1}`).trim();
        const capabilityName = stepCapability(rawStep);
        const dependsOn = Array.isArray(rawStep?.dependsOn)
            ? [...new Set(rawStep.dependsOn.map(String))].filter(dependency => dependency !== id).slice(0, MAX_DEPENDENCIES)
            : [];
        const refs = collectReferences(rawStep?.args);
        refs.forEach(reference => {
            if (!dependsOn.includes(reference)) dependsOn.push(reference);
        });
        if (!id) issues.push(issue('STEP_ID_MISSING', `steps.${index}`, 'Every execution step needs an ID.'));
        if (seen.has(id)) issues.push(issue('STEP_ID_DUPLICATE', `steps.${id}`, `Step ID '${id}' is duplicated.`));
        seen.add(id);
        if (!capabilityName) issues.push(issue('STEP_CAPABILITY_MISSING', `steps.${id}`, 'Every execution step needs a capability.'));
        const capability = capabilityName ? registry.get(capabilityName) : null;
        if (capabilityName && !capability) {
            issues.push(issue('CAPABILITY_UNAVAILABLE', `steps.${id}.capability`, `Capability '${capabilityName}' is not available.`, {
                capability: capabilityName,
                alternatives: context.capabilityAlternatives?.[capabilityName] || []
            }));
        }
        if (capability) issues.push(...validateArgs(isPlainObject(rawStep?.args) ? rawStep.args : {}, capability.inputSchema, `steps.${id}.args`));
        return {
            id,
            type: capabilityName,
            capability: capabilityName,
            title: String(rawStep?.title || rawStep?.description || capability?.description || capabilityName || `Step ${index + 1}`).trim(),
            description: String(rawStep?.description || capability?.description || '').trim(),
            args: boundedArgs(rawStep?.args),
            dependsOn,
            sourceOutcomeIds: Array.isArray(rawStep?.sourceOutcomeIds) ? rawStep.sourceOutcomeIds.map(String) : [],
            status: 'pending'
        };
    });

    const outcomeIds = outcomeById(plan);
    const outcomeSeen = new Set();
    for (const outcome of plan?.outcomes || []) {
        if (outcomeSeen.has(outcome.id)) issues.push(issue('OUTCOME_ID_DUPLICATE', `outcomes.${outcome.id}`, `Outcome ID '${outcome.id}' is duplicated.`));
        outcomeSeen.add(outcome.id);
    }
    for (const outcome of plan?.outcomes || []) {
        outcome.dependsOn.forEach(dependency => {
            if (!outcomeIds.has(dependency)) issues.push(issue('UNKNOWN_OUTCOME_DEPENDENCY', `outcomes.${outcome.id}.dependsOn`, `Outcome '${outcome.id}' depends on unknown outcome '${dependency}'.`));
        });
    }
    issues.push(...topologicalOrder((plan?.outcomes || []).map(outcome => ({ id: outcome.id, dependsOn: outcome.dependsOn }))).issues.map(item => ({
        ...item,
        code: item.code === 'PLAN_CYCLE' ? 'OUTCOME_CYCLE' : item.code,
        path: item.path.replace(/^steps/, 'outcomes')
    })));
    steps.forEach(step => {
        step.sourceOutcomeIds.forEach(outcomeId => {
            if (outcomeIds.size > 0 && !outcomeIds.has(outcomeId)) issues.push(issue('UNKNOWN_SOURCE_OUTCOME', `steps.${step.id}.sourceOutcomeIds`, `Step '${step.id}' references unknown outcome '${outcomeId}'.`));
        });
    });

    const graph = topologicalOrder(steps);
    issues.push(...graph.issues);
    return {
        valid: issues.length === 0,
        issues,
        graph: issues.length === 0 ? {
            revision: Number(plan?.execution?.revision || 1),
            order: graph.order,
            steps
        } : null
    };
};

export const planFingerprint = plan => JSON.stringify({
    outcomes: (plan?.outcomes || []).map(outcome => ({
        id: outcome.id,
        title: outcome.title,
        artifactTypes: outcome.artifactTypes,
        affectedResources: outcome.affectedResources,
        risk: outcome.risk,
        dependsOn: outcome.dependsOn
    })),
    approvalRequired: plan?.approvalRequired !== false
});

export const isMaterialPlanChange = (previousPlan, nextPlan) => planFingerprint(previousPlan) !== planFingerprint(nextPlan);
