import { BaseNode } from '../../../BaseNode.js';

export default class ScheduleCronNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};
        const config = this.getResolvedConfig(context);
        
        return { 
            ...context, 
            success: true,
            triggerData: payload,
            timestamp: payload.timestamp || new Date().toISOString(),
            cronExpression: config.cronExpression || '0 9 * * *'
        };
    }
}
