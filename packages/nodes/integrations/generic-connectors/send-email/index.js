import { BaseNode } from '../../../BaseNode.js';

export default class SendEmailNode extends BaseNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
