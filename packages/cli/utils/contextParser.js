/**
 * Utility to parse and resolve variables in node configurations against the execution context.
 */

/**
 * Resolves a dot-notation path against the context object.
 * @param {string} path - The dot notation path (e.g., 'node_1.result.email')
 * @param {Object} contextData - The context containing execution results.
 * @returns {any} The resolved value, or undefined.
 */
function getValueFromContext(path, contextData) {
    if (!path) return undefined;
    const properties = path.split('.');
    let value = contextData;
    for (const prop of properties) {
        if (value === undefined || value === null) {
            return undefined;
        }
        value = value[prop];
    }
    return value;
}

/**
 * Resolves variables within a string.
 * @param {string} text - The text containing variables like {{node1.data}}
 * @param {Object} contextData - The context data
 * @returns {any} The interpolated string, or the raw object if it's an exact single match.
 */
export function resolveVariables(text, contextData) {
    if (typeof text !== 'string') return text;

    // Check if the string is EXACTLY one variable, e.g. "{{My Form (2).data}}"
    // This allows us to return the raw type (object, array, number) instead of coercing to string.
    const exactMatchRegex = /^\{\{([^{}]+)\}\}$/;
    const exactMatch = text.match(exactMatchRegex);
    
    if (exactMatch) {
        const path = exactMatch[1];
        const val = getValueFromContext(path, contextData);
        return val !== undefined ? val : text;
    }

    // Otherwise, do string replacement for all {{...}} occurrences in the string
    return text.replace(/\{\{([^{}]+)\}\}/g, (match, path) => {
        const val = getValueFromContext(path, contextData);
        
        if (val === undefined) {
            return match; // Leave un-resolved variables as-is
        }
        
        if (typeof val === 'object') {
            return JSON.stringify(val); // Serialize objects if embedded in a larger string
        }
        
        return String(val);
    });
}

/**
 * Recursively resolves variables deeply within an object or array.
 * @param {any} config - The configuration object to resolve
 * @param {Object} contextData - The context data
 * @returns {any} A new object with resolved variables
 */
export function deepResolve(config, contextData) {
    if (config === null || config === undefined) {
        return config;
    }

    if (typeof config === 'string') {
        return resolveVariables(config, contextData);
    }

    if (Array.isArray(config)) {
        return config.map(item => deepResolve(item, contextData));
    }

    if (typeof config === 'object') {
        const resolvedObject = {};
        for (const [key, value] of Object.entries(config)) {
            resolvedObject[key] = deepResolve(value, contextData);
        }
        return resolvedObject;
    }

    return config; // numbers, booleans, etc.
}

/** Returns unresolved template references with their configuration paths. */
export function findUnresolvedVariables(value, path = 'config', results = []) {
    if (typeof value === 'string') {
        for (const match of value.matchAll(/\{\{([^{}]+)\}\}/g)) {
            results.push({ path, token: match[0], reference: match[1].trim() });
        }
        return results;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => findUnresolvedVariables(item, `${path}[${index}]`, results));
        return results;
    }
    if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => findUnresolvedVariables(item, `${path}.${key}`, results));
    }
    return results;
}
