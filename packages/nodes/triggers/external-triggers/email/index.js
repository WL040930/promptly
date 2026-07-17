import { BaseNode } from '../../../BaseNode.js';

export default class EmailReceivedNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};
        return {
            success: true,
            outputData: payload.data || {},
            triggerData: payload,
            eventId: payload.eventId || null,
            eventType: payload.eventType || null,
            messageId: payload.data?.messageId || null,
            threadId: payload.data?.threadId || null,
            from: payload.data?.from || null,
            to: payload.data?.to || null,
            subject: payload.data?.subject || null,
            text: payload.data?.text || null,
            html: payload.data?.html || null,
            attachments: payload.data?.attachments || []
        };
    }
}
