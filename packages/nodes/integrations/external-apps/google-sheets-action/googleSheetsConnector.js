const MAX_RANGE_LENGTH = 500;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 100;

export const parseJsonValue = (value, fieldName, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        throw new Error(`${fieldName} must contain valid JSON.`);
    }
};

export const validateSpreadsheetId = value => {
    const spreadsheetId = String(value || '').trim();
    if (!/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId)) {
        throw new Error('Spreadsheet ID is invalid. Use the ID from the Google Sheets URL.');
    }
    return spreadsheetId;
};

export const validateRange = value => {
    const range = String(value || '').trim();
    if (!range || range.length > MAX_RANGE_LENGTH || /[\r\n]/.test(range)) {
        throw new Error(`Sheet range is required and must be at most ${MAX_RANGE_LENGTH} characters.`);
    }
    return range;
};

export const validateValues = value => {
    const parsed = parseJsonValue(value, 'Values', null);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Values must be a non-empty JSON array.');
    const rows = Array.isArray(parsed[0]) ? parsed : [parsed];
    if (rows.length > MAX_ROWS) throw new Error(`Values cannot exceed ${MAX_ROWS} rows.`);
    if (rows.some(row => !Array.isArray(row) || row.length > MAX_COLUMNS)) {
        throw new Error(`Values must be rows with no more than ${MAX_COLUMNS} columns.`);
    }
    return rows;
};

export const buildSheetsUrl = ({ spreadsheetId, range, operation, query = {} }) => {
    const encodedRange = encodeURIComponent(range).replace(/%2F/g, '/');
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
    const url = operation === 'append' ? `${base}:append` : operation === 'clear' ? `${base}:clear` : base;
    const params = new URLSearchParams(query);
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
};

export const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error('Boolean configuration must be true or false.');
};

