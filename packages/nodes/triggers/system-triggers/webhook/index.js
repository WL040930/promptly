import { BaseNode } from '../../../BaseNode.js';

export default class WebhookCatchHookNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};
        
        return { 
            ...context, 
            success: true,
            triggerData: payload,
            body: payload.body || {},
            headers: payload.headers || {},
            method: payload.method || 'GET',
            timestamp: payload.timestamp || new Date().toISOString()
        };
    }
}
