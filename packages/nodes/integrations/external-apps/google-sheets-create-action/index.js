import { BaseNode } from '../../../BaseNode.js';
import googleSpreadsheetService from '../../../../cli/services/nodes/googleSpreadsheetService.js';

const headerRow = value => {
    const row = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : value;
    return (Array.isArray(row) ? row : []).map(item => String(item || '').trim()).filter(Boolean);
};

export default class GoogleSheetsCreateActionNode extends BaseNode {
    async execute(context) {
        try {
            const config = this.getResolvedConfig(context);
            const result = await googleSpreadsheetService.createAndInitialize({
                userId: context.metadata?.userId,
                title: config.title,
                sheetTitle: config.sheetTitle || 'Responses',
                headers: headerRow(config.headers),
                // This makes retries/resumes idempotent while still producing a
                // distinct spreadsheet for each automation run.
                provisioningKey: `workflow-run:${context.metadata?.workflowId || 'workflow'}:${context.metadata?.runId || 'run'}:${this.id}`
            });
            return {
                success: true,
                outputData: { spreadsheetId: result.id, ...result },
                spreadsheetId: result.id,
                range: result.range,
                webViewLink: result.webViewLink
            };
        } catch (error) {
            return { success: false, errorCode: error.code || 'GOOGLE_SHEETS_CREATE_FAILED', error: error.message || 'Google Sheets could not be created.' };
        }
    }
}
