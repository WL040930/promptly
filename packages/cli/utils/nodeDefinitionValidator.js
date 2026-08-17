import { NODE_INPUT_TYPES, NODE_INPUT_VALUE_SYNTAXES } from '../../shared/nodeConfigContract.js';

const REQUIRED_ARRAYS = ['inputs', 'outputs'];
const validInputTypes = new Set(NODE_INPUT_TYPES);
const validValueSyntaxes = new Set(NODE_INPUT_VALUE_SYNTAXES);

const referencedConditionFields = condition => {
    if (!condition || typeof condition !== 'object') return [];
    return [
        ...(condition.field ? [condition.field] : []),
        ...(condition.all || []).flatMap(referencedConditionFields),
        ...(condition.any || []).flatMap(referencedConditionFields)
    ];
};

export const validateNodeDefinition = (definition) => {
    const issues = [];
    const metadata = definition?.metadata || {};
    const schema = definition?.configSchema || {};

    for (const field of ['type', 'subType', 'title']) {
        if (typeof metadata[field] !== 'string' || !metadata[field].trim()) {
            issues.push({ code: 'MISSING_METADATA', path: `metadata.${field}`, message: `${field} is required.` });
        }
    }

    for (const field of REQUIRED_ARRAYS) {
        if (!Array.isArray(schema[field])) {
            issues.push({ code: 'INVALID_SCHEMA', path: field, message: `${field} must be an array.` });
        }
    }

    for (const field of REQUIRED_ARRAYS) {
        const names = new Set();
        for (const [index, item] of (schema[field] || []).entries()) {
            if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim()) {
                issues.push({ code: 'INVALID_SCHEMA_FIELD', path: `${field}[${index}]`, message: 'Each schema field requires a name.' });
                continue;
            }
            if (names.has(item.name)) {
                issues.push({ code: 'DUPLICATE_SCHEMA_FIELD', path: `${field}[${index}].name`, message: `Duplicate ${field} name "${item.name}".` });
            }
            names.add(item.name);
        }
    }

    const inputNames = new Set((schema.inputs || []).map(input => input?.name).filter(Boolean));
    for (const [index, input] of (schema.inputs || []).entries()) {
        if (input?.isConnection) continue;
        if (!validInputTypes.has(input?.type)) {
            issues.push({ code: 'INVALID_INPUT_TYPE', path: `inputs[${index}].type`, message: `Unsupported input type "${input?.type}".` });
        }
        if (input?.valueSyntax !== undefined && !validValueSyntaxes.has(input.valueSyntax)) {
            issues.push({ code: 'INVALID_VALUE_SYNTAX', path: `inputs[${index}].valueSyntax`, message: `Unsupported value syntax "${input.valueSyntax}".` });
        }
        if (input?.type === 'resource-select' && (typeof input.resource !== 'string' || !input.resource.trim())) {
            issues.push({ code: 'MISSING_INPUT_RESOURCE', path: `inputs[${index}].resource`, message: 'Resource-select inputs require a resource provider.' });
        }
        if (input?.type === 'select' && !Array.isArray(input.options) && !input.optionsBy) {
            issues.push({ code: 'MISSING_INPUT_OPTIONS', path: `inputs[${index}].options`, message: 'Select inputs require options or optionsBy.' });
        }
        for (const [conditionName, condition] of [['showWhen', input?.showWhen], ['requiredWhen', input?.requiredWhen]]) {
            for (const fieldName of referencedConditionFields(condition)) {
                if (!inputNames.has(fieldName)) {
                    issues.push({
                        code: 'UNKNOWN_CONDITION_FIELD',
                        path: `inputs[${index}].${conditionName}.field`,
                        message: `Conditional field "${fieldName}" does not exist in this node schema.`
                    });
                }
            }
        }
        if (input?.optionsBy?.field && !inputNames.has(input.optionsBy.field)) {
            issues.push({ code: 'UNKNOWN_OPTIONS_FIELD', path: `inputs[${index}].optionsBy.field`, message: `Dynamic option field "${input.optionsBy.field}" does not exist in this node schema.` });
        }
    }

    if (!definition?.NodeClass || typeof definition.NodeClass.prototype?.execute !== 'function') {
        issues.push({ code: 'MISSING_IMPLEMENTATION', path: 'NodeClass', message: 'Node implementation must provide execute(context).' });
    }

    return issues;
};
