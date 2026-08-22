import { isWorkflowExpression } from './workflowExpressions.js';

export const NODE_INPUT_TYPES = Object.freeze([
    'text',
    'textarea',
    'number',
    'boolean',
    'select',
    'resource-select',
    'node-select',
    'cron',
    'webhook-display',
    'secret',
    'object',
    'json',
    'key-value',
    'string-list',
    'data-grid',
    'parameter-list',
    'filter-list'
]);

export const NODE_INPUT_VALUE_SYNTAXES = Object.freeze([
    'workflow-expression',
    'node-template',
    'none'
]);

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const reservedExpressionObject = value => isPlainObject(value)
    && ['$expr', '$binding', '$template'].some(key => Object.hasOwn(value, key));

const valueSyntaxIssue = (input, value) => {
    // Unannotated inputs predate this contract. Keep them compatible until a
    // node schema explicitly opts into one of the three value syntaxes.
    if (!input.valueSyntax) return null;
    const walk = current => {
        if (reservedExpressionObject(current)) {
            if (!isWorkflowExpression(current) || input.valueSyntax !== 'workflow-expression') return true;
            return false;
        }
        if (Array.isArray(current)) return current.some(walk);
        if (isPlainObject(current)) return Object.values(current).some(walk);
        return false;
    };
    if (!walk(value)) return null;
    const syntax = input.valueSyntax;
    return issue(
        'INVALID_VALUE_SYNTAX',
        input.name,
        `${input.label || input.name} contains a workflow expression that is not allowed for value syntax '${syntax}'.`
    );
};

export const isEmptyConfigValue = value => (
    value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
);

const conditionMatches = (condition, config = {}) => {
    if (!condition || typeof condition !== 'object') return true;
    if (Array.isArray(condition.all)) return condition.all.every(item => conditionMatches(item, config));
    if (Array.isArray(condition.any)) return condition.any.some(item => conditionMatches(item, config));

    const current = config[condition.field];
    if (Object.hasOwn(condition, 'equals')) return current === condition.equals;
    if (Object.hasOwn(condition, 'notEquals')) return current !== condition.notEquals;
    if (Array.isArray(condition.in)) return condition.in.includes(current);
    if (Array.isArray(condition.notIn)) return !condition.notIn.includes(current);
    if (condition.truthy === true) return Boolean(current);
    if (condition.empty === true) return isEmptyConfigValue(current);
    return true;
};

export const isNodeInputVisible = (input, config = {}) => (
    !input?.isConnection && conditionMatches(input?.showWhen, config)
);

export const isNodeInputRequired = (input, config = {}) => (
    input?.required === true || Boolean(input?.requiredWhen && conditionMatches(input.requiredWhen, config))
);

export const normalizeNodeInputOptions = (input, config = {}) => {
    let options = Array.isArray(input?.options) ? input.options : [];
    const optionsBy = input?.optionsBy;
    if (optionsBy?.field && isPlainObject(optionsBy.values)) {
        options = optionsBy.values[config[optionsBy.field]] || optionsBy.fallback || [];
    }
    return options.map((option, index) => {
        if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
            return { value: String(option), label: String(option), disabled: false, key: String(option) };
        }
        const value = option?.value ?? '';
        return {
            ...option,
            value,
            label: option?.label ?? option?.name ?? option?.title ?? String(value),
            disabled: option?.disabled === true,
            key: `${String(value)}:${index}`
        };
    });
};

export const getVisibleNodeInputs = (schema = {}, config = {}) => (
    (schema.inputs || []).filter(input => isNodeInputVisible(input, config))
);

export const getNodeDefaultConfig = (schema = {}) => Object.fromEntries(
    (schema.inputs || [])
        .filter(input => !input.isConnection && input.defaultValue !== undefined)
        .map(input => [input.name, input.defaultValue])
);

export const resolveNodeResourceParams = (input, config = {}) => Object.fromEntries(
    Object.entries(input?.resourceParams || {}).map(([key, value]) => [
        key,
        typeof value === 'string' && value.startsWith('$') ? config[value.slice(1)] ?? '' : value
    ])
);

export const resetDependentNodeInputs = (schema = {}, config = {}, changedInputName) => {
    const next = { ...config };
    for (const input of schema.inputs || []) {
        const usesChangedResource = Object.values(input.resourceParams || {})
            .some(value => value === `$${changedInputName}`);
        const usesChangedOptions = input.optionsBy?.field === changedInputName;
        if (input.name !== changedInputName && (usesChangedResource || usesChangedOptions)) {
            delete next[input.name];
        }
    }
    return next;
};

export const normalizeNodeResourceValue = (format, value) => {
    const text = String(value ?? '').trim();
    if (format !== 'google-spreadsheet-id' || !text) return text;
    const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,200})/);
    return urlMatch?.[1] || text;
};

const parseStructuredValue = value => {
    if (typeof value !== 'string') return { value };
    try {
        return { value: JSON.parse(value) };
    } catch (error) {
        return { error };
    }
};

const issue = (code, field, message, severity = 'error') => ({
    code,
    field,
    path: `config.${field}`,
    message,
    severity
});

const validateStructuredInput = (input, value) => {
    const parsed = parseStructuredValue(value);
    if (parsed.error) return issue('INVALID_JSON', input.name, `${input.label || input.name} must contain valid JSON.`);
    const structured = parsed.value;
    if (['object', 'key-value'].includes(input.type) && !isPlainObject(structured)) {
        return issue('INVALID_OBJECT', input.name, `${input.label || input.name} must be an object.`);
    }
    if (input.type === 'string-list' && (!Array.isArray(structured) || structured.some(item => (
        typeof item !== 'string'
        && !(input.valueSyntax === 'workflow-expression' && isWorkflowExpression(item))
    )))) {
        return issue('INVALID_STRING_LIST', input.name, `${input.label || input.name} must be a list of text values.`);
    }
    if (input.type === 'data-grid' && (!Array.isArray(structured) || structured.some(row => !Array.isArray(row)))) {
        return issue('INVALID_DATA_GRID', input.name, `${input.label || input.name} must contain rows and columns.`);
    }
    if (input.type === 'parameter-list' && !Array.isArray(structured)) {
        return issue('INVALID_PARAMETER_LIST', input.name, `${input.label || input.name} must be a list of parameters.`);
    }
    if (input.type === 'filter-list' && !Array.isArray(structured)) {
        return issue('INVALID_FILTER_LIST', input.name, `${input.label || input.name} must be a list of filters.`);
    }
    return null;
};

export const validateNodeConfig = ({ schema = {}, config = {}, mode = 'draft' } = {}) => {
    const issues = [];
    const visibleInputs = getVisibleNodeInputs(schema, config);
    for (const input of visibleInputs) {
        const value = config[input.name] !== undefined ? config[input.name] : input.defaultValue;
        const required = isNodeInputRequired(input, config);
        if (required && isEmptyConfigValue(value)) {
            issues.push(issue(
                'MISSING_REQUIRED_CONFIG',
                input.name,
                `${input.label || input.name} is required.`,
                mode === 'draft' ? 'warning' : 'error'
            ));
            continue;
        }
        if (isEmptyConfigValue(value)) continue;

        const syntaxIssue = valueSyntaxIssue(input, value);
        if (syntaxIssue) issues.push(syntaxIssue);

        if (input.type === 'number') {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) {
                issues.push(issue('INVALID_NUMBER', input.name, `${input.label || input.name} must be a number.`));
                continue;
            }
            if (Number.isFinite(input.min) && numeric < input.min) {
                issues.push(issue('NUMBER_TOO_SMALL', input.name, `${input.label || input.name} must be at least ${input.min}.`));
            }
            if (Number.isFinite(input.max) && numeric > input.max) {
                issues.push(issue('NUMBER_TOO_LARGE', input.name, `${input.label || input.name} must be at most ${input.max}.`));
            }
        }

        if (input.type === 'select') {
            const options = normalizeNodeInputOptions(input, config).filter(option => !option.disabled);
            if (options.length > 0 && !options.some(option => String(option.value) === String(value))) {
                issues.push(issue('INVALID_OPTION', input.name, `${input.label || input.name} has an unsupported value.`));
            }
        }

        if (['object', 'json', 'key-value', 'string-list', 'data-grid', 'parameter-list', 'filter-list'].includes(input.type)) {
            const structuredIssue = validateStructuredInput(input, value);
            if (structuredIssue) issues.push(structuredIssue);
        }

        if (input.pattern && typeof value === 'string') {
            try {
                if (!new RegExp(input.pattern).test(value)) {
                    issues.push(issue('PATTERN_MISMATCH', input.name, input.validationMessage || `${input.label || input.name} has an invalid format.`));
                }
            } catch {
                issues.push(issue('INVALID_SCHEMA_PATTERN', input.name, `${input.label || input.name} has an invalid validation rule.`));
            }
        }

        if (Number.isFinite(input.minLength) && String(value).length < input.minLength) {
            issues.push(issue('VALUE_TOO_SHORT', input.name, `${input.label || input.name} is too short.`));
        }
        if (Number.isFinite(input.maxLength) && String(value).length > input.maxLength) {
            issues.push(issue('VALUE_TOO_LONG', input.name, `${input.label || input.name} is too long.`));
        }
    }

    return {
        valid: !issues.some(item => item.severity === 'error'),
        ready: issues.length === 0,
        issues
    };
};
