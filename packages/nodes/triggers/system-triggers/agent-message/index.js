import { BaseNode } from '../../../BaseNode.js';

export default class AIAgentMessageNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};

        return {
            ...context,
            success: true,
            triggerData: payload,
            message:     payload.message   || '',
            sessionId:   payload.sessionId || null,
        };
    }
}
