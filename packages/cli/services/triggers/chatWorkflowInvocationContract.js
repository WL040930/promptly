import Ajv from 'ajv';

export const CHAT_WORKFLOW_TRIGGER_KIND = 'agent-message';
export const MAX_CHAT_WORKFLOW_PARAMETERS = 20;

const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const INVOCATION_KEY = /^[a-z][a-z0-9_-]{1,79}$/;
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean']);
const ROOT_SCHEMA_KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'title', 'description']);
const PROPERTY_SCHEMA_KEYS = new Set(['type', 'description', 'enum', 'default', 'minLength', 'maxLength', 'minimum', 'maximum', 'items']);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

const issue = (code, path, message) => ({ code, path, message });

const parseObject = (value, path, issues) => {
    if (value === undefined || value === null || value === '') return {};
    if (isPlainObject(value)) return clone(value);
    if (typeof value !== 'string') {
        issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', path, 'Parameter schema must be a JSON object.'));
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        if (!isPlainObject(parsed)) throw new Error('not an object');
        return parsed;
    } catch {
        issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', path, 'Parameter schema must contain valid JSON object syntax.'));
        return {};
    }
};

const schemaFromFields = parameters => {
    const properties = {};
    const required = [];
    for (const parameter of Array.isArray(parameters) ? parameters.slice(0, MAX_CHAT_WORKFLOW_PARAMETERS) : []) {
        const name = String(parameter?.name || '').trim();
        if (!name) continue;
        properties[name] = {
            type: SCALAR_TYPES.has(parameter?.type) ? parameter.type : 'string',
            ...(String(parameter?.description || '').trim() ? { description: String(parameter.description).trim() } : {})
        };
        if (parameter?.required === true) required.push(name);
    }
    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false
    };
};

const enumMatchesType = (value, type) => (
    (type === 'string' && typeof value === 'string')
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && Number.isInteger(value))
    || (type === 'boolean' && typeof value === 'boolean')
);

const validatePropertySchema = ({ name, schema, path, issues }) => {
    if (!isPlainObject(schema)) {
        issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', path, `Parameter '${name}' must be a JSON object.`));
        return;
    }
    for (const key of Object.keys(schema)) {
        if (!PROPERTY_SCHEMA_KEYS.has(key)) {
            issues.push(issue('CHAT_PARAMETER_SCHEMA_UNSUPPORTED', `${path}.${key}`, `Parameter '${name}' uses unsupported schema keyword '${key}'.`));
        }
    }
    const type = schema.type;
    if (![...SCALAR_TYPES, 'array'].includes(type)) {
        issues.push(issue('CHAT_PARAMETER_TYPE_INVALID', `${path}.type`, `Parameter '${name}' must use string, number, integer, boolean, or array.`));
        return;
    }
    if (type === 'array') {
        if (!isPlainObject(schema.items) || !SCALAR_TYPES.has(schema.items.type)) {
            issues.push(issue('CHAT_PARAMETER_ARRAY_INVALID', `${path}.items`, `Array parameter '${name}' needs scalar item type.`));
        }
    }
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 50) {
            issues.push(issue('CHAT_PARAMETER_ENUM_INVALID', `${path}.enum`, `Parameter '${name}' needs between one and fifty enum values.`));
        } else if (type !== 'array' && schema.enum.some(value => !enumMatchesType(value, type))) {
            issues.push(issue('CHAT_PARAMETER_ENUM_INVALID', `${path}.enum`, `Every enum value for '${name}' must match its type.`));
        }
    }
};

/**
 * Keeps chat-trigger schemas intentionally flat. The AI can fill one clear
 * object, while workflow authors retain full control over names and scalar
 * validation without exposing arbitrary JSON Schema execution.
 */
export const validateChatParameterSchema = value => {
    const issues = [];
    const raw = parseObject(value, 'parameterSchema', issues);
    const schema = Object.keys(raw).length === 0 ? schemaFromFields([]) : raw;

    for (const key of Object.keys(schema)) {
        if (!ROOT_SCHEMA_KEYS.has(key)) {
            issues.push(issue('CHAT_PARAMETER_SCHEMA_UNSUPPORTED', `parameterSchema.${key}`, `Unsupported root schema keyword '${key}'.`));
        }
    }
    if (schema.type !== 'object') issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', 'parameterSchema.type', 'Parameter schema must have type "object".'));
    if (!isPlainObject(schema.properties)) issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', 'parameterSchema.properties', 'Parameter schema needs a properties object.'));

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const names = Object.keys(properties);
    if (names.length > MAX_CHAT_WORKFLOW_PARAMETERS) {
        issues.push(issue('CHAT_PARAMETER_LIMIT_EXCEEDED', 'parameterSchema.properties', `A chat workflow can define at most ${MAX_CHAT_WORKFLOW_PARAMETERS} parameters.`));
    }
    for (const name of names) {
        if (!PARAMETER_NAME.test(name)) {
            issues.push(issue('CHAT_PARAMETER_NAME_INVALID', `parameterSchema.properties.${name}`, `Parameter '${name}' must start with a letter and use only letters, numbers, and underscores.`));
        }
        validatePropertySchema({ name, schema: properties[name], path: `parameterSchema.properties.${name}`, issues });
    }
    const required = schema.required === undefined ? [] : schema.required;
    if (!Array.isArray(required) || required.some(name => typeof name !== 'string' || !Object.hasOwn(properties, name))) {
        issues.push(issue('CHAT_PARAMETER_REQUIRED_INVALID', 'parameterSchema.required', 'Required parameters must be names from properties.'));
    }
    if (schema.additionalProperties !== false) {
        issues.push(issue('CHAT_PARAMETER_ADDITIONAL_PROPERTIES', 'parameterSchema.additionalProperties', 'Chat parameters must set additionalProperties to false.'));
    }

    const normalized = {
        type: 'object',
        properties: clone(properties),
        ...(Array.isArray(required) && required.length > 0 ? { required: [...new Set(required)] } : {}),
        additionalProperties: false
    };
    if (issues.length === 0) {
        try {
            new Ajv({ allErrors: true, strict: false }).compile(normalized);
        } catch (error) {
            issues.push(issue('CHAT_PARAMETER_SCHEMA_INVALID', 'parameterSchema', error.message));
        }
    }
    return { valid: issues.length === 0, schema: normalized, issues };
};

export const chatParameterSchemaFromConfig = config => {
    const hasAdvancedSchema = isPlainObject(config?.parameterSchema)
        ? Object.keys(config.parameterSchema).length > 0
        : typeof config?.parameterSchema === 'string' && config.parameterSchema.trim().length > 0 && config.parameterSchema.trim() !== '{}';
    return validateChatParameterSchema(hasAdvancedSchema
        ? config.parameterSchema
        : schemaFromFields(config?.parameters));
};

export const chatWorkflowInvocationFromConfig = config => {
    if (config?.chatEnabled !== true) return { enabled: false, valid: true, issues: [] };
    const issues = [];
    const invocationKey = String(config?.invocationKey || '').trim().toLowerCase();
    const description = String(config?.description || '').trim();
    if (!INVOCATION_KEY.test(invocationKey)) {
        issues.push(issue('CHAT_INVOCATION_KEY_INVALID', 'invocationKey', 'Invocation key must start with a lowercase letter and use lowercase letters, numbers, hyphens, or underscores.'));
    }
    if (!description || description.length > 1_000) {
        issues.push(issue('CHAT_INVOCATION_DESCRIPTION_INVALID', 'description', 'Describe when this workflow should run in 1 to 1,000 characters.'));
    }
    const parameterResult = chatParameterSchemaFromConfig(config || {});
    issues.push(...parameterResult.issues);
    return {
        enabled: true,
        valid: issues.length === 0,
        issues,
        invocationKey,
        description,
        parameterSchema: parameterResult.schema
    };
};

const unwrapChoice = value => Array.isArray(value) && value.length === 1 ? value[0] : value;

/** Coerce browser clarification values, then validate the exact live schema. */
export const validateChatInvocationParameters = ({ schema, parameters = {} } = {}) => {
    const properties = isPlainObject(schema?.properties) ? schema.properties : {};
    const candidate = isPlainObject(parameters)
        ? Object.fromEntries(Object.entries(parameters)
            .filter(([key]) => Object.hasOwn(properties, key))
            .map(([key, value]) => [key, unwrapChoice(value)]))
        : {};
    let validate;
    try {
        validate = new Ajv({ allErrors: true, strict: false, coerceTypes: true, useDefaults: true }).compile(schema || schemaFromFields([]));
    } catch (error) {
        return { valid: false, parameters: candidate, issues: [issue('CHAT_PARAMETER_SCHEMA_INVALID', 'parameterSchema', error.message)] };
    }
    const valid = validate(candidate);
    return {
        valid,
        parameters: candidate,
        issues: valid ? [] : (validate.errors || []).map(error => issue(
            'CHAT_PARAMETER_VALUE_INVALID',
            error.instancePath || error.params?.missingProperty || '',
            error.message || 'Parameter value is invalid.'
        ))
    };
};

export const clarificationInputsForChatParameters = ({ schema, requiredIds = [] } = {}) => {
    const required = new Set([...(schema?.required || []), ...requiredIds]);
    return Object.entries(schema?.properties || {}).map(([name, property]) => {
        const enumValues = Array.isArray(property?.enum) ? property.enum : null;
        return {
            id: name,
            type: enumValues ? 'single_choice' : 'text',
            label: property?.description || name,
            ...(enumValues ? { options: enumValues.map(String) } : {
                placeholder: property?.type === 'boolean'
                    ? 'true or false'
                    : property?.type === 'number' || property?.type === 'integer'
                        ? 'Enter a number'
                        : `Enter ${name}`
            }),
            required: required.has(name)
        };
    });
};

export const chatWorkflowInvocationInternals = {
    schemaFromFields,
    PARAMETER_NAME,
    INVOCATION_KEY
};
