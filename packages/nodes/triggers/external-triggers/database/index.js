import { BaseNode } from '../../../BaseNode.js';

export default class DatabaseEventNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};
        return {
            success: true,
            outputData: payload.data || {},
            triggerData: payload,
            eventId: payload.eventId || null,
            eventType: payload.eventType || null,
            resource: payload.data?.resource || null,
            recordId: payload.data?.recordId || null,
            before: payload.data?.before || null,
            after: payload.data?.after || null,
            changedFields: payload.data?.changedFields || []
        };
    }
}
