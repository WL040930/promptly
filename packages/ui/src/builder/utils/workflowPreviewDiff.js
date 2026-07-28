import { isWorkflowExpression } from '../../../../shared/workflowExpressions.js';

const MAX_VALUE_LENGTH = 220;
const MAX_PARAMETER_CHANGES = 12;

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const labelForPath = path => path
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

const valueText = value => {
    if (value === undefined || value === null || value === '') return 'Not set';
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    const compact = String(raw).replace(/\s+/g, ' ').trim();
    return compact.length > MAX_VALUE_LENGTH ? `${compact.slice(0, MAX_VALUE_LENGTH)}…` : compact;
};

const flattenConfig = (value, path = '', depth = 0, output = new Map()) => {
    if (isObject(value) && !isWorkflowExpression(value) && depth < 2) {
        Object.entries(value).forEach(([key, child]) => flattenConfig(child, path ? `${path}.${key}` : key, depth + 1, output));
        return output;
    }
    if (path) output.set(path, value);
    return output;
};

const parameterChangesFor = (before = {}, after = {}) => {
    const beforeValues = flattenConfig(before.config || {});
    const afterValues = flattenConfig(after.config || {});
    const paths = new Set([...beforeValues.keys(), ...afterValues.keys()]);
    const changes = [];

    if (before.title !== after.title) {
        changes.push({ key: 'title', label: 'Node name', before: valueText(before.title), after: valueText(after.title), beforeRaw: before.title, afterRaw: after.title });
    }

    paths.forEach(path => {
        const previous = beforeValues.get(path);
        const next = afterValues.get(path);
        if (!sameValue(previous, next)) {
            changes.push({ key: `config.${path}`, label: labelForPath(path), before: valueText(previous), after: valueText(next), beforeRaw: previous, afterRaw: next });
        }
    });

    return changes;
};

const parameterSnapshotFor = (node = {}) => [...flattenConfig(node.config || {}).entries()]
    .map(([path, value]) => ({
        key: `config.${path}`,
        label: labelForPath(path),
        value: valueText(value),
        rawValue: value
    }));

const sameWorkflowNode = (before, after) => before.title === after.title
    && before.type === after.type
    && before.subType === after.subType
    && sameValue(before.config || {}, after.config || {});

/** Builds a presentational workflow diff without treating canvas movement as a change. */
export const buildWorkflowPreviewDiffNodes = ({ currentNodes = [], proposedNodes = [] } = {}) => {
    const currentById = new Map(currentNodes.map(node => [node.id, node]));
    const proposedById = new Map(proposedNodes.map(node => [node.id, node]));
    const nodes = [];

    proposedNodes.forEach(node => {
        const current = currentById.get(node.id);
        if (!current) {
            const parameters = parameterSnapshotFor(node);
            nodes.push({
                ...node,
                _diffStatus: 'added',
                _parameterChanges: [],
                _parameterSnapshot: parameters.slice(0, MAX_PARAMETER_CHANGES),
                _hiddenParameters: Math.max(0, parameters.length - MAX_PARAMETER_CHANGES)
            });
            return;
        }
        const changes = parameterChangesFor(current, node);
        nodes.push({ ...node, _diffStatus: sameWorkflowNode(current, node) ? 'unchanged' : 'updated', _parameterChanges: changes.slice(0, MAX_PARAMETER_CHANGES), _hiddenParameterChanges: Math.max(0, changes.length - MAX_PARAMETER_CHANGES) });
    });

    currentNodes.forEach(node => {
        if (!proposedById.has(node.id)) {
            const parameters = parameterSnapshotFor(node);
            nodes.push({
                ...node,
                _diffStatus: 'removed',
                _parameterChanges: [],
                _parameterSnapshot: parameters.slice(0, MAX_PARAMETER_CHANGES),
                _hiddenParameters: Math.max(0, parameters.length - MAX_PARAMETER_CHANGES)
            });
        }
    });

    return nodes;
};
