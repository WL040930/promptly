import { BaseNode } from '../../../BaseNode.js';

export default class SheetsEventNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};
        return {
            success: true,
            outputData: payload.data || {},
            triggerData: payload,
            eventId: payload.eventId || null,
            eventType: payload.eventType || null,
            spreadsheetId: payload.data?.spreadsheetId || null,
            range: payload.data?.range || null,
            rowNumber: payload.data?.rowNumber || null,
            values: payload.data?.values || [],
            fingerprint: payload.data?.fingerprint || null
        };
    }
}
