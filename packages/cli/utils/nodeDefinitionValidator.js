const REQUIRED_ARRAYS = ['inputs', 'outputs'];

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

    if (!definition?.NodeClass || typeof definition.NodeClass.prototype?.execute !== 'function') {
        issues.push({ code: 'MISSING_IMPLEMENTATION', path: 'NodeClass', message: 'Node implementation must provide execute(context).' });
    }

    return issues;
};

