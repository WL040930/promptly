import { getVisibleNodeInputs, validateNodeConfig } from '../../../../shared/nodeConfigContract.js';

export const buildNodeInspectorModel = (schema = {}, config = {}) => {
    const inputs = getVisibleNodeInputs(schema, config);
    const sections = [];
    for (const input of inputs) {
        const key = input.group || 'Setup';
        let section = sections.find(item => item.key === key && item.advanced === Boolean(input.advanced));
        if (!section) {
            section = { key, title: key, advanced: Boolean(input.advanced), inputs: [] };
            sections.push(section);
        }
        section.inputs.push(input);
    }
    const validation = validateNodeConfig({ schema, config, mode: 'draft' });
    const issuesByField = Object.fromEntries(validation.issues.map(item => [item.field, item]));
    return { inputs, sections, validation, issuesByField };
};

