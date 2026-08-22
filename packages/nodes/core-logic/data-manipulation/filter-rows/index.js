import { BaseNode } from '../../../BaseNode.js';

const OPERATORS = new Set(['equals', 'notEquals', 'contains', 'startsWith', 'greater', 'less', 'isEmpty', 'isNotEmpty']);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const parseRows = value => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
};

const tableRows = rows => {
    if (!Array.isArray(rows) || rows.length === 0) return { rows: [], columns: [] };
    if (!Array.isArray(rows[0])) {
        if (rows.every(isPlainObject)) {
            const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
            return { rows, columns };
        }
        throw new Error('Rows must be objects or a table with a header row.');
    }
    const headers = rows[0].map((header, index) => String(header ?? '').trim() || `Column ${index + 1}`);
    return {
        columns: headers,
        rows: rows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
    };
};

const sourceRows = source => {
    const value = parseRows(source);
    if (Array.isArray(value)) return tableRows(value);
    if (!isPlainObject(value)) throw new Error('Connect a list of rows or a Google Sheets read result.');
    if (Array.isArray(value.rows)) return tableRows(value.rows);
    if (Array.isArray(value.values)) return tableRows(value.values);
    if (Array.isArray(value.response?.values)) return tableRows(value.response.values);
    if (Array.isArray(value.outputData)) return sourceRows(value.outputData);
    throw new Error('No rows were found in the connected data.');
};

const normalizedText = (value, caseSensitive) => {
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    return caseSensitive ? text : text.toLocaleLowerCase();
};

const rowValue = (row, column) => {
    const exact = Object.hasOwn(row, column) ? column : Object.keys(row).find(key => key.toLocaleLowerCase() === String(column).toLocaleLowerCase());
    return exact === undefined ? undefined : row[exact];
};

const isEmpty = value => value === undefined
    || value === null
    || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0);

const numeric = (value, label) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric for this comparison.`);
    return parsed;
};

const rowMatches = ({ row, filter, caseSensitive }) => {
    const actual = rowValue(row, filter.column);
    const operator = filter.operator;
    if (operator === 'isEmpty') return isEmpty(actual);
    if (operator === 'isNotEmpty') return !isEmpty(actual);
    if (actual === undefined) return false;

    const expected = filter.value;
    if (operator === 'greater') return numeric(actual, `Column '${filter.column}'`) > numeric(expected, `Filter value for '${filter.column}'`);
    if (operator === 'less') return numeric(actual, `Column '${filter.column}'`) < numeric(expected, `Filter value for '${filter.column}'`);
    const left = normalizedText(actual, caseSensitive);
    const right = normalizedText(expected, caseSensitive);
    if (operator === 'equals') return left === right;
    if (operator === 'notEquals') return left !== right;
    if (operator === 'contains') return left.includes(right);
    if (operator === 'startsWith') return left.startsWith(right);
    return false;
};

export const normalizeFilters = value => {
    const filters = parseRows(value);
    if (!Array.isArray(filters) || filters.length === 0) throw new Error('Add at least one row filter.');
    if (filters.length > 20) throw new Error('A row filter step can contain at most 20 filters.');
    return filters.map((filter, index) => {
        const column = String(filter?.column || '').trim();
        const operator = String(filter?.operator || 'equals');
        if (!column) throw new Error(`Filter ${index + 1} needs a column name.`);
        if (!OPERATORS.has(operator)) throw new Error(`Filter ${index + 1} has an unsupported operator.`);
        if (!['isEmpty', 'isNotEmpty'].includes(operator) && (filter?.value === undefined || filter?.value === null || filter.value === '')) {
            throw new Error(`Filter ${index + 1} needs a comparison value.`);
        }
        return { column, operator, ...(filter?.value !== undefined ? { value: filter.value } : {}) };
    });
};

export const filterRows = ({ rows, filters, caseSensitive = false }) => {
    const source = sourceRows(rows);
    const normalizedFilters = normalizeFilters(filters);
    const matches = source.rows.filter(row => normalizedFilters.every(filter => rowMatches({ row, filter, caseSensitive })));
    return { rows: matches, totalCount: source.rows.length, matchedCount: matches.length, columns: source.columns, filters: normalizedFilters };
};

export default class FilterRowsNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        try {
            const connectedRows = this.getRuntimeInput(context, 'inputData');
            const rows = config.rows !== undefined && config.rows !== null && config.rows !== '' ? config.rows : connectedRows;
            const result = filterRows({ rows, filters: config.filters, caseSensitive: config.caseSensitive === true });
            return {
                success: true,
                outputData: result.rows,
                ...result
            };
        } catch (error) {
            return {
                success: false,
                errorCode: 'FILTER_ROWS_FAILED',
                error: error.message,
                outputData: [],
                rows: [],
                totalCount: 0,
                matchedCount: 0
            };
        }
    }
}
