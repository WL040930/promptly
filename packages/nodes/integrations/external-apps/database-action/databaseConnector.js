import { Form, Workflow, ExecutionLog } from '../../../../cli/models/index.js';

const RESOURCE_DEFINITIONS = Object.freeze({
    forms: {
        model: Form,
        filters: new Set(['id', 'title']),
        writable: new Set(['title', 'description', 'settings', 'fields']),
        orderFields: new Set(['createdAt', 'updatedAt', 'id']),
        defaultOrder: 'updatedAt'
    },
    workflows: {
        model: Workflow,
        filters: new Set(['id', 'name', 'status']),
        writable: new Set(['name', 'status', 'icon', 'iconColor', 'iconBg', 'nodes', 'edges']),
        orderFields: new Set(['createdAt', 'updatedAt', 'id']),
        defaultOrder: 'updatedAt'
    },
    executionLogs: {
        model: ExecutionLog,
        filters: new Set(['id', 'workflowId', 'status', 'trigger']),
        writable: new Set(),
        orderFields: new Set(['time', 'createdAt', 'id']),
        defaultOrder: 'time',
        readOnly: true
    }
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const parseObject = (value, fieldName, fallback = {}) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isPlainObject(parsed)) throw new Error(`${fieldName} must be a JSON object.`);
    return parsed;
};

export const getResourceDefinition = resource => {
    const normalized = String(resource || '').trim();
    const definition = RESOURCE_DEFINITIONS[normalized];
    if (!definition) throw new Error(`Unsupported database resource "${normalized || '<empty>'}".`);
    return { resource: normalized, ...definition };
};

export const buildScopedWhere = ({ definition, userId, filters = {} }) => {
    if (!userId) throw new Error('Database action requires an authenticated user context.');
    const unsupported = Object.keys(filters).filter(key => !definition.filters.has(key));
    if (unsupported.length > 0) throw new Error(`Unsupported filter field(s): ${unsupported.join(', ')}.`);
    return { userId, ...filters };
};

export const sanitizeWritableData = ({ definition, data = {} }) => {
    const keys = Object.keys(data);
    const unsupported = keys.filter(key => !definition.writable.has(key));
    if (unsupported.length > 0) throw new Error(`Field(s) cannot be written for this resource: ${unsupported.join(', ')}.`);
    if (keys.length === 0) throw new Error('Database action requires at least one data field.');
    return Object.fromEntries(keys.map(key => [key, data[key]]));
};

export const parseLimit = value => {
    if (value === undefined || value === null || value === '') return 50;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Database read limit must be an integer between 1 and 100.');
    return limit;
};

export const buildOrder = ({ definition, orderBy, orderDirection }) => {
    const field = orderBy || definition.defaultOrder;
    if (!definition.orderFields.has(field)) throw new Error(`Unsupported order field "${field}".`);
    const direction = String(orderDirection || 'DESC').toUpperCase();
    if (!['ASC', 'DESC'].includes(direction)) throw new Error('Order direction must be ASC or DESC.');
    return [[field, direction]];
};

export const requireRecordFilter = filters => {
    if (!filters.id) throw new Error('Update and delete actions require an exact "id" filter.');
};

export const mergeRecordIdFilter = ({ filters = {}, recordId = '' } = {}) => {
    const normalized = String(recordId || '').trim();
    return normalized ? { ...filters, id: normalized } : filters;
};
