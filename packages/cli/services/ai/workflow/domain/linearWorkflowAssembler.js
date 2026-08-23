import { SEMANTIC_CONTROL_FLOW_NODE_KEYS } from './editCompiler/contracts.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cloneValue = value => isObject(value) || Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value;

const connectionPorts = (spec, direction) => (spec?.schema?.[direction] || [])
    .filter(port => port?.isConnection && port.name)
    .map(port => port.name);

const defaultConfigFor = spec => Object.fromEntries((spec?.schema?.inputs || [])
    .filter(input => !input?.isConnection && input.defaultValue !== undefined)
    .map(input => [input.name, cloneValue(input.defaultValue)]));

const missingRequiredConfig = (spec, config) => (spec?.schema?.inputs || [])
    .filter(input => input?.required === true && !input.isConnection && (config?.[input.name] === undefined || config?.[input.name] === null || config?.[input.name] === ''))
    .map(input => input.name);

const unavailable = reason => ({ operations: null, reason });

/**
 * Assemble a fresh, unbranched workflow from a validated planner blueprint.
 * The caller only needs to provide the current workflow, selected specs, and
 * an ownership-checked form schema when the blueprint contains a form trigger.
 */
export const assembleLinearWorkflow = ({
    workflow = {},
    plan = {},
    specs = [],
    formSchema = null,
    capabilities = [],
    formWorkflowContracts = null
} = {}) => {
    if ((workflow.nodes || []).length > 0 || (workflow.edges || []).length > 0) {
        return unavailable('The linear assembler only builds a new workflow.');
    }
    const steps = plan.linearSteps;
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > 8) {
        return unavailable('No valid linear workflow blueprint was supplied.');
    }

    const specsByNodeKey = new Map(specs.map(spec => [spec.nodeKey, spec]));
    const selectedNodeKeys = new Set(plan.selectedNodeKeys || []);
    const refs = new Set();
    const resolvedSteps = [];
    for (const [index, step] of steps.entries()) {
        if (!isObject(step) || typeof step.ref !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(step.ref) || refs.has(step.ref)) {
            return unavailable('The linear workflow blueprint contains invalid or duplicate step refs.');
        }
        const spec = specsByNodeKey.get(step.nodeKey);
        if (!spec || !selectedNodeKeys.has(step.nodeKey)) {
            return unavailable('The linear workflow blueprint references a node that was not validated by the plan.');
        }
        refs.add(step.ref);
        resolvedSteps.push({ step, spec, index });
    }

    const triggers = resolvedSteps.filter(item => item.spec.type === 'trigger');
    if (triggers.length !== 1 || resolvedSteps[0].spec.type !== 'trigger' || resolvedSteps.slice(1).some(item => item.spec.type === 'trigger')) {
        return unavailable('A linear workflow requires exactly one trigger as the first step.');
    }
    for (const [index, item] of resolvedSteps.entries()) {
        const outputs = connectionPorts(item.spec, 'outputs');
        const inputs = connectionPorts(item.spec, 'inputs');
        if (inputs.length > 1) {
            return unavailable('The requested workflow needs branching or multiple inputs, so it cannot use the linear assembler.');
        }
        if (item.spec.nodeKey === 'logic:approval' && inputs.length !== 1) {
            return unavailable('An Approval step must expose exactly one connection input.');
        }
        if (index < resolvedSteps.length - 1 && item.spec.nodeKey === 'logic:approval') {
            const next = resolvedSteps[index + 1];
            const nextInputs = connectionPorts(next.spec, 'inputs');
            if (SEMANTIC_CONTROL_FLOW_NODE_KEYS.has(next.spec.nodeKey) || nextInputs.length !== 1) {
                return unavailable('A middle Approval step must be followed by one ordinary action with one connection input.');
            }
        } else if (index < resolvedSteps.length - 1 && outputs.length !== 1) {
            return unavailable('A non-terminal linear step must expose exactly one output route.');
        }
    }

    const responseSheetChanges = (plan.resourceChanges || []).filter(change => change?.type === 'create_google_spreadsheet' && change?.ref);
    const sheetSteps = resolvedSteps.filter(item => item.spec.nodeKey === 'action:googleSheets');
    if (responseSheetChanges.length > 1 || (responseSheetChanges.length === 1 && sheetSteps.length !== 1)) {
        return unavailable('The response spreadsheet destination is ambiguous for the linear assembler.');
    }
    const responseSheet = responseSheetChanges[0] || null;
    const effectiveCapabilities = new Set([...(plan.capabilities || []), ...capabilities]);
    const emailStepCount = resolvedSteps.filter(item => item.spec.nodeKey === 'action:email').length;
    const respondentEmailBinding = formWorkflowContracts?.respondentEmail;
    const shouldBindRespondentEmail = effectiveCapabilities.has('respondent_confirmation')
        && isObject(respondentEmailBinding)
        && (emailStepCount === 1 || effectiveCapabilities.has('owner_approval'));
    const preparedSteps = [];
    for (const { step, spec, index } of resolvedSteps) {
        const config = { ...defaultConfigFor(spec), ...(isObject(step.config) ? cloneValue(step.config) : {}) };
        if (spec.nodeKey === 'trigger:form-submission') {
            if (!formSchema?.id) return unavailable('A form trigger needs a loaded form before the linear workflow can be assembled.');
            config.formId = formSchema.id;
        }
        if (spec.nodeKey === 'action:googleSheets' && responseSheet) {
            const sheetTitle = String(responseSheet.sheetTitle || 'Responses').replace(/'/g, "''");
            config.operation = 'append';
            config.spreadsheetId = { $provision: responseSheet.ref };
            config.range = `'${sheetTitle}'!A1`;
        }
        // The form prerequisite resolver owns the respondent address. Replace
        // only this capability's recipient so a legacy model token cannot
        // reach the worker or the strict workflow-expression compiler.
        if (spec.nodeKey === 'action:email' && shouldBindRespondentEmail) {
            config.to = cloneValue(respondentEmailBinding);
        }
        const missing = missingRequiredConfig(spec, config);
        if (missing.length > 0) {
            return unavailable(`The ${spec.nodeKey} step is missing required configuration: ${missing.join(', ')}.`);
        }
        preparedSteps.push({ step, spec, index, config });
    }

    const operations = [];
    const approvedRouteSteps = new Set();

    for (const { step, spec, index, config } of preparedSteps) {
        if (approvedRouteSteps.has(step.ref)) continue;
        const isTerminalApproval = index === resolvedSteps.length - 1 && spec.nodeKey === 'logic:approval';
        if (isTerminalApproval) {
            const source = preparedSteps[index - 1];
            operations.push({
                op: 'add_terminal_approval',
                from: { nodeRef: source.step.ref, handle: connectionPorts(source.spec, 'outputs')[0] || null },
                approval: {
                    ref: step.ref,
                    title: step.title || spec.title,
                    config
                }
            });
            continue;
        }
        if (spec.nodeKey === 'logic:approval') {
            const source = preparedSteps[index - 1];
            const approved = preparedSteps[index + 1];
            if (!source || !approved) {
                return unavailable('A middle Approval step needs a source and an approved action.');
            }
            approvedRouteSteps.add(approved.step.ref);
            operations.push({
                op: 'add_approval_gate',
                from: { nodeRef: source.step.ref, handle: connectionPorts(source.spec, 'outputs')[0] || null },
                approval: {
                    ref: step.ref,
                    title: step.title || spec.title,
                    config
                },
                whenApproved: {
                    ref: approved.step.ref,
                    nodeKey: approved.spec.nodeKey,
                    title: approved.step.title || approved.spec.title,
                    config: approved.config
                }
            });
            continue;
        }
        operations.push({
            op: 'create_node',
            node: {
                ref: step.ref,
                nodeKey: spec.nodeKey,
                title: step.title || spec.title,
                ...(index > 0 ? { afterNodeRef: preparedSteps[index - 1].step.ref } : {}),
                config
            }
        });
    }

    for (let index = 0; index < resolvedSteps.length - 1; index += 1) {
        const from = preparedSteps[index];
        const to = preparedSteps[index + 1];
        if (to.spec.nodeKey === 'logic:approval' || from.spec.nodeKey === 'logic:approval' || approvedRouteSteps.has(to.step.ref)) continue;
        operations.push({
            op: 'connect',
            from: { nodeRef: from.step.ref, handle: connectionPorts(from.spec, 'outputs')[0] || null },
            to: { nodeRef: to.step.ref, handle: connectionPorts(to.spec, 'inputs')[0] || null }
        });
    }

    return { operations, reason: null };
};
