const PROTECTED_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const valueType = value => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
};

export const nodeFailure = (errorCode, error, details = {}) => ({
    success: false,
    errorCode,
    error,
    ...details
});

export const parseFiniteNumber = (value, fieldName) => {
    if (value === '' || value === null || value === undefined) {
        throw new Error(`${fieldName} must be a number.`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${fieldName} must be a finite number.`);
    return parsed;
};

export const parseInteger = (value, fieldName, { min = -Infinity, max = Infinity } = {}) => {
    const parsed = parseFiniteNumber(value, fieldName);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${fieldName} must be an integer between ${min} and ${max}.`);
    }
    return parsed;
};

const pathParts = path => {
    if (typeof path !== 'string' || !path.trim()) throw new Error('A non-empty object path is required.');
    const parts = path.split('.').map(part => part.trim());
    if (parts.some(part => !part || PROTECTED_PATH_KEYS.has(part))) {
        throw new Error('Object path contains an invalid segment.');
    }
    return parts;
};

export const getNestedValue = (value, path) => {
    const parts = pathParts(path);
    return parts.reduce((current, part) => current == null ? undefined : current[part], value);
};

export const setNestedValue = (value, path, nextValue) => {
    const parts = pathParts(path);
    const result = value && typeof value === 'object'
        ? structuredClone(value)
        : {};
    let cursor = result;
    parts.forEach((part, index) => {
        if (index === parts.length - 1) {
            cursor[part] = nextValue;
            return;
        }
        if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
        cursor = cursor[part];
    });
    return result;
};

export const parseJsonValue = (value, fieldName) => {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch {
        throw new Error(`${fieldName} must contain valid JSON.`);
    }
};

export const parseAssignment = assignment => {
    const text = String(assignment ?? '');
    const separator = text.indexOf('=');
    if (separator <= 0) throw new Error('Set operation requires a path=value operand.');
    const path = text.slice(0, separator).trim();
    const rawValue = text.slice(separator + 1).trim();
    let value = rawValue;
    if (rawValue !== '') {
        try { value = JSON.parse(rawValue); } catch { /* Keep plain text values as strings. */ }
    }
    return { path, value };
};

export const formatDate = (input, pattern = 'YYYY-MM-DD', timezone = 'UTC') => {
    const date = input ? new Date(input) : new Date();
    if (Number.isNaN(date.getTime())) throw new Error('Date input is invalid.');

    let parts;
    try {
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).map(part => [part.type, part.value]));
    } catch {
        throw new Error(`Timezone "${timezone}" is invalid.`);
    }

    return String(pattern)
        .replaceAll('YYYY', parts.year)
        .replaceAll('MM', parts.month)
        .replaceAll('DD', parts.day)
        .replaceAll('HH', parts.hour)
        .replaceAll('mm', parts.minute)
        .replaceAll('ss', parts.second);
};

export const addCalendarDays = (input, days) => {
    const date = input ? new Date(input) : new Date();
    if (Number.isNaN(date.getTime())) throw new Error('Date input is invalid.');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
};

export const isEmptyValue = value => (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
);

