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
export const assembleLinearWorkflow = ({ workflow = {}, plan = {}, specs = [], formSchema = null } = {}) => {
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
        if (outputs.length > 1 || inputs.length > 1) {
            return unavailable('The requested workflow needs branching or multiple inputs, so it cannot use the linear assembler.');
        }
        if (index < resolvedSteps.length - 1 && outputs.length !== 1) {
            return unavailable('A non-terminal linear step must expose exactly one output route.');
        }
    }

    const responseSheetChanges = (plan.resourceChanges || []).filter(change => change?.type === 'create_google_spreadsheet' && change?.ref);
    const sheetSteps = resolvedSteps.filter(item => item.spec.nodeKey === 'action:googleSheets');
    if (responseSheetChanges.length > 1 || (responseSheetChanges.length === 1 && sheetSteps.length !== 1)) {
        return unavailable('The response spreadsheet destination is ambiguous for the linear assembler.');
    }
    const responseSheet = responseSheetChanges[0] || null;
    const operations = [];

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
        const missing = missingRequiredConfig(spec, config);
        if (missing.length > 0) {
            return unavailable(`The ${spec.nodeKey} step is missing required configuration: ${missing.join(', ')}.`);
        }
        operations.push({
            op: 'create_node',
            node: {
                ref: step.ref,
                nodeKey: spec.nodeKey,
                title: step.title || spec.title,
                ...(index > 0 ? { afterNodeRef: resolvedSteps[index - 1].step.ref } : {}),
                config
            }
        });
    }

    for (let index = 0; index < resolvedSteps.length - 1; index += 1) {
        const from = resolvedSteps[index];
        const to = resolvedSteps[index + 1];
        operations.push({
            op: 'connect',
            from: { nodeRef: from.step.ref, handle: connectionPorts(from.spec, 'outputs')[0] || null },
            to: { nodeRef: to.step.ref, handle: connectionPorts(to.spec, 'inputs')[0] || null }
        });
    }

    return { operations, reason: null };
};
