const PATH_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

export const WEBHOOK_BODY_SCHEMA_MAX_DEPTH = 4;
export const WEBHOOK_BODY_SCHEMA_MAX_FIELDS = 50;

const ROOT_KEYS = new Set([
    '$schema',
    'type',
    'properties',
    'required',
    'additionalProperties',
    'title',
    'description'
]);

const PROPERTY_KEYS = new Set([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'title',
    'description',
    'enum',
    'items',
    'minimum',
    'maximum',
    'minLength',
    'maxLength'
]);

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean']);
const SUPPORTED_TYPES = new Set([...SCALAR_TYPES, 'object', 'array']);
const FORBIDDEN_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

const issue = (code, path, message, details = {}) => ({ code, path, message, ...details });

const parseSchemaValue = value => {
    if (value === undefined || value === null || value === '') return { value: null };
    if (isObject(value)) return { value: clone(value) };
    if (typeof value !== 'string') return { error: 'Request body contract must be a JSON object.' };
    try {
        const parsed = JSON.parse(value);
        return isObject(parsed)
            ? { value: parsed }
            : { error: 'Request body contract must be a JSON object.' };
    } catch {
        return { error: 'Request body contract must contain valid JSON.' };
    }
};

const normalizeEnum = (schema, path, issues) => {
    if (schema.enum === undefined) return;
    if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 50) {
        issues.push(issue('WEBHOOK_SCHEMA_ENUM_INVALID', `${path}.enum`, 'Enum must contain between one and fifty values.'));
        return;
    }
    const type = schema.type;
    const valid = schema.enum.every(value => (
        (type === 'string' && typeof value === 'string')
        || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
        || (type === 'integer' && Number.isInteger(value))
        || (type === 'boolean' && typeof value === 'boolean')
    ));
    if (!valid) issues.push(issue('WEBHOOK_SCHEMA_ENUM_INVALID', `${path}.enum`, `Every enum value must match type '${type}'.`));
};

const normalizeSchemaNode = ({ value, path, depth, counters, issues, root = false }) => {
    if (!isObject(value)) {
        issues.push(issue('WEBHOOK_SCHEMA_NODE_INVALID', path, 'Each schema node must be a JSON object.'));
        return { type: 'object', properties: {}, additionalProperties: true };
    }

    const allowedKeys = root ? ROOT_KEYS : PROPERTY_KEYS;
    Object.keys(value).forEach(key => {
        if (!allowedKeys.has(key)) issues.push(issue('WEBHOOK_SCHEMA_KEY_UNSUPPORTED', `${path}.${key}`, `Unsupported schema keyword '${key}'.`));
    });

    const type = value.type;
    if (typeof type !== 'string' || !SUPPORTED_TYPES.has(type)) {
        issues.push(issue('WEBHOOK_SCHEMA_TYPE_INVALID', `${path}.type`, 'Schema type must be object, string, number, integer, boolean, or array.'));
    }
    const normalizedType = SUPPORTED_TYPES.has(type) ? type : 'object';

    if (value.additionalProperties !== undefined && value.additionalProperties !== true) {
        issues.push(issue('WEBHOOK_SCHEMA_ADDITIONAL_PROPERTIES', `${path}.additionalProperties`, 'Additional properties must be allowed for webhook contracts.'));
    }

    const normalized = {
        type: normalizedType,
        ...(typeof value.title === 'string' && value.title.trim() ? { title: value.title.trim() } : {}),
        ...(typeof value.description === 'string' && value.description.trim() ? { description: value.description.trim() } : {}),
        ...(normalizedType === 'object' ? { additionalProperties: true } : {})
    };

    if (normalizedType === 'object') {
        if (value.enum !== undefined || value.items !== undefined || value.minimum !== undefined || value.maximum !== undefined || value.minLength !== undefined || value.maxLength !== undefined) {
            issues.push(issue('WEBHOOK_SCHEMA_SHAPE_INVALID', path, 'Object schemas may only define properties, required, and descriptions.'));
        }
        if (depth > WEBHOOK_BODY_SCHEMA_MAX_DEPTH) {
            issues.push(issue('WEBHOOK_SCHEMA_DEPTH_EXCEEDED', path, `Nested objects may be at most ${WEBHOOK_BODY_SCHEMA_MAX_DEPTH} levels deep.`));
        }
        const properties = value.properties;
        if (properties !== undefined && !isObject(properties)) {
            issues.push(issue('WEBHOOK_SCHEMA_PROPERTIES_INVALID', `${path}.properties`, 'Object properties must be a JSON object.'));
        }
        const normalizedProperties = {};
        const propertyEntries = isObject(properties) ? Object.entries(properties) : [];
        for (const [name, child] of propertyEntries) {
            counters.fields += 1;
            if (counters.fields > WEBHOOK_BODY_SCHEMA_MAX_FIELDS) {
                issues.push(issue('WEBHOOK_SCHEMA_FIELD_LIMIT', `${path}.properties`, `A webhook contract may declare at most ${WEBHOOK_BODY_SCHEMA_MAX_FIELDS} field paths.`));
                break;
            }
            if (!PATH_SEGMENT_RE.test(name) || FORBIDDEN_PROPERTY_NAMES.has(name)) {
                issues.push(issue('WEBHOOK_SCHEMA_PROPERTY_NAME_INVALID', `${path}.properties.${name}`, 'Field names must use letters, numbers, underscores, or hyphens.'));
                continue;
            }
            normalizedProperties[name] = normalizeSchemaNode({
                value: child,
                path: `${path}.properties.${name}`,
                depth: depth + 1,
                counters,
                issues
            });
        }
        normalized.properties = normalizedProperties;

        const required = value.required === undefined ? [] : value.required;
        if (!Array.isArray(required) || required.some(name => typeof name !== 'string' || !Object.hasOwn(normalizedProperties, name))) {
            issues.push(issue('WEBHOOK_SCHEMA_REQUIRED_INVALID', `${path}.required`, 'Required fields must be names declared in properties.'));
        } else if (required.length > 0) {
            normalized.required = [...new Set(required)].sort();
        }
    } else {
        if (value.properties !== undefined || value.required !== undefined || (value.additionalProperties !== undefined && value.additionalProperties !== true)) {
            issues.push(issue('WEBHOOK_SCHEMA_SHAPE_INVALID', path, `Type '${normalizedType}' cannot define object properties.`));
        }
        if (normalizedType === 'array') {
            if (value.enum !== undefined || value.minimum !== undefined || value.maximum !== undefined || value.minLength !== undefined || value.maxLength !== undefined) {
                issues.push(issue('WEBHOOK_SCHEMA_SHAPE_INVALID', path, 'Array schemas may only define scalar items and descriptions.'));
            }
            if (!isObject(value.items)) {
                issues.push(issue('WEBHOOK_SCHEMA_ARRAY_ITEMS_INVALID', `${path}.items`, 'Arrays must declare scalar item types.'));
            } else if (!SCALAR_TYPES.has(value.items.type)) {
                issues.push(issue('WEBHOOK_SCHEMA_ARRAY_ITEMS_INVALID', `${path}.items`, 'Arrays of objects or arrays are not supported.'));
            } else {
                normalized.items = normalizeSchemaNode({
                    value: value.items,
                    path: `${path}.items`,
                    depth,
                    counters,
                    issues
                });
            }
        } else {
            normalizeEnum(value, path, issues);
            if (value.minimum !== undefined && (typeof value.minimum !== 'number' || !Number.isFinite(value.minimum))) {
                issues.push(issue('WEBHOOK_SCHEMA_BOUND_INVALID', `${path}.minimum`, 'minimum must be a finite number.'));
            } else if (value.minimum !== undefined) normalized.minimum = value.minimum;
            if (value.maximum !== undefined && (typeof value.maximum !== 'number' || !Number.isFinite(value.maximum))) {
                issues.push(issue('WEBHOOK_SCHEMA_BOUND_INVALID', `${path}.maximum`, 'maximum must be a finite number.'));
            } else if (value.maximum !== undefined) normalized.maximum = value.maximum;
            if (value.minLength !== undefined && (!Number.isInteger(value.minLength) || value.minLength < 0)) {
                issues.push(issue('WEBHOOK_SCHEMA_BOUND_INVALID', `${path}.minLength`, 'minLength must be a non-negative integer.'));
            } else if (value.minLength !== undefined) normalized.minLength = value.minLength;
            if (value.maxLength !== undefined && (!Number.isInteger(value.maxLength) || value.maxLength < 0)) {
                issues.push(issue('WEBHOOK_SCHEMA_BOUND_INVALID', `${path}.maxLength`, 'maxLength must be a non-negative integer.'));
            } else if (value.maxLength !== undefined) normalized.maxLength = value.maxLength;
            if (Array.isArray(value.enum) && value.enum.length > 0) normalized.enum = [...value.enum];
        }
    }

    return normalized;
};

const canonicalize = value => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
};

const fingerprintFor = value => JSON.stringify(canonicalize(value));

export const normalizeWebhookBodySchema = value => {
    const parsed = parseSchemaValue(value);
    if (parsed.error) return { configured: true, schema: null, fields: [], fingerprint: null, issues: [issue('WEBHOOK_SCHEMA_JSON_INVALID', 'bodySchema', parsed.error)] };
    if (parsed.value === null || Object.keys(parsed.value).length === 0) return { configured: false, schema: null, fields: [], fingerprint: null, issues: [] };

    const issues = [];
    const counters = { fields: 0 };
    const schema = normalizeSchemaNode({ value: parsed.value, path: 'bodySchema', depth: 0, counters, issues, root: true });
    return {
        configured: true,
        schema,
        fields: issues.length === 0 ? webhookBodyFields(schema) : [],
        fingerprint: issues.length === 0 ? fingerprintFor(schema) : null,
        issues
    };
};

export const validateWebhookBodySchema = value => normalizeWebhookBodySchema(value);

const fieldType = schema => schema?.type === 'integer' ? 'number' : schema?.type || 'any';

const collectFields = (schema, parentPath, parentLabel, requiredNames, output) => {
    const properties = schema?.properties || {};
    for (const [name, child] of Object.entries(properties)) {
        const path = [...parentPath, name];
        const label = child.title || name;
        const descriptor = {
            path,
            pathString: path.join('.'),
            name,
            label,
            type: fieldType(child),
            schemaType: child.type,
            required: requiredNames.has(name),
            description: child.description || `Field from ${parentLabel}`,
            enum: Array.isArray(child.enum) ? [...child.enum] : undefined,
            isArray: child.type === 'array'
        };
        output.push(descriptor);
        if (child.type === 'object') collectFields(child, path, label, new Set(child.required || []), output);
    }
};

export const webhookBodyFields = schema => {
    const output = [];
    collectFields(schema, ['body'], 'Request Body', new Set(schema?.required || []), output);
    return output;
};

export const webhookBodyOutputSchema = bodySchemaValue => {
    const normalized = bodySchemaValue?.schema && Object.hasOwn(bodySchemaValue, 'configured')
        ? bodySchemaValue
        : normalizeWebhookBodySchema(bodySchemaValue);
    return normalized.configured && normalized.schema
        ? { type: 'object', properties: normalized.schema.properties || {}, description: 'Typed request body fields from the webhook contract.' }
        : null;
};

export const webhookBodyPathIssue = ({ schema: schemaValue, path = [], requireSchema = false } = {}) => {
    const normalized = schemaValue?.schema && Object.hasOwn(schemaValue, 'configured')
        ? schemaValue
        : normalizeWebhookBodySchema(schemaValue);
    if (!Array.isArray(path) || path[0] !== 'body' || path.length <= 1) return null;
    if (!normalized.configured) {
        return requireSchema
            ? issue('WEBHOOK_BODY_SCHEMA_REQUIRED', 'path', 'A webhook body contract is required before referencing a body field.')
            : null;
    }
    if (normalized.issues.length > 0) return issue('WEBHOOK_SCHEMA_INVALID', 'bodySchema', 'The webhook body contract is invalid.');
    let current = normalized.schema;
    for (const segment of path.slice(1)) {
        if (current?.type !== 'object' || !Object.hasOwn(current.properties || {}, segment)) {
            return issue('WEBHOOK_BODY_FIELD_UNKNOWN', 'path', `The webhook body contract does not declare '${path.join('.')}'.`, { pathValue: path });
        }
        current = current.properties[segment];
    }
    return null;
};

export const webhookExampleFromSchema = bodySchemaValue => {
    const normalized = bodySchemaValue?.schema && Object.hasOwn(bodySchemaValue, 'configured')
        ? bodySchemaValue
        : normalizeWebhookBodySchema(bodySchemaValue);
    if (!normalized.configured || !normalized.schema || normalized.issues.length > 0) return {};

    const exampleNode = schema => {
        if (!schema || typeof schema !== 'object') return null;
        if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
        if (schema.type === 'object') {
            const properties = schema.properties || {};
            const required = Array.isArray(schema.required) ? schema.required : [];
            return Object.fromEntries(required
                .filter(name => Object.hasOwn(properties, name))
                .map(name => [name, exampleNode(properties[name])]));
        }
        if (schema.type === 'array') return [];
        if (schema.type === 'boolean') return false;
        if (schema.type === 'number' || schema.type === 'integer') return 0;
        return 'example';
    };

    return exampleNode(normalized.schema);
};

export const webhookBodyContractFingerprint = value => normalizeWebhookBodySchema(value).fingerprint;
