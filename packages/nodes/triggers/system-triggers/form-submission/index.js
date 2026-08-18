import { BaseNode } from '../../../BaseNode.js';

export default class PromptlyFormNode extends BaseNode {
    async execute(context) {
        const payload = context.initialPayload || {};

        return {
            ...context,
            success: true,
            outputData:   payload.fields      || {},
            triggerData:  payload,
            fields:       payload.fields      || {},
            responseId:   payload.responseId  || null,
            submittedAt:  payload.submittedAt || new Date().toISOString(),
        };
    }
}
