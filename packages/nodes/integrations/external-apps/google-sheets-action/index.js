import { BaseNode } from '../../../BaseNode.js';
import { getGoogleClientForUser } from '../../../../cli/services/triggers/googleTriggerClient.js';
import {
    buildSheetsUrl,
    parseBoolean,
    validateRange,
    validateSpreadsheetId,
    validateValues
} from './googleSheetsConnector.js';

const OPERATIONS = new Set(['read', 'append', 'update', 'clear']);
const INPUT_OPTIONS = new Set(['RAW', 'USER_ENTERED']);
const RENDER_OPTIONS = new Set(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA']);

const buildRequest = ({ client, spreadsheetId, range, operation, config }) => {
    const valueInputOption = String(config.valueInputOption || 'USER_ENTERED').toUpperCase();
    if (!INPUT_OPTIONS.has(valueInputOption)) throw new Error('Value input option must be RAW or USER_ENTERED.');
    const includeValuesInResponse = parseBoolean(config.includeValuesInResponse, false);

    if (operation === 'read') {
        const valueRenderOption = String(config.valueRenderOption || 'UNFORMATTED_VALUE').toUpperCase();
        if (!RENDER_OPTIONS.has(valueRenderOption)) throw new Error('Value render option is invalid.');
        return {
            url: buildSheetsUrl({ spreadsheetId, range, operation, query: { majorDimension: 'ROWS', valueRenderOption } }),
            method: 'GET'
        };
    }

    if (operation === 'clear') {
        return { url: buildSheetsUrl({ spreadsheetId, range, operation }), method: 'POST', data: {} };
    }

    const values = validateValues(config.values);
    const data = { range, majorDimension: 'ROWS', values };
    if (operation === 'append') {
        return {
            url: buildSheetsUrl({
                spreadsheetId,
                range,
                operation,
                query: {
                    valueInputOption,
                    insertDataOption: 'INSERT_ROWS',
                    includeValuesInResponse: String(includeValuesInResponse)
                }
            }),
            method: 'POST',
            data
        };
    }
    return {
        url: buildSheetsUrl({ spreadsheetId, range, operation, query: { valueInputOption, includeValuesInResponse: String(includeValuesInResponse) } }),
        method: 'PUT',
        data
    };
};

export default class GoogleSheetsActionNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        try {
            const operation = String(config.operation || 'read').toLowerCase();
            if (!OPERATIONS.has(operation)) throw new Error(`Unsupported Google Sheets operation "${operation}".`);
            const spreadsheetId = validateSpreadsheetId(config.spreadsheetId);
            const range = validateRange(config.range);
            const { client } = await getGoogleClientForUser(context.metadata?.userId);
            const request = buildRequest({ client, spreadsheetId, range, operation, config });
            const response = await client.request(request);
            const responseData = response.data || {};
            return {
                success: true,
                outputData: { operation, spreadsheetId, range, response: responseData },
                response: responseData,
                operation,
                spreadsheetId,
                range
            };
        } catch (error) {
            return { success: false, errorCode: 'GOOGLE_SHEETS_ACTION_FAILED', error: error.message };
        }
    }
}
