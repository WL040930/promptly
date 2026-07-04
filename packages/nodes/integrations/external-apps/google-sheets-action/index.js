import { ActionNode } from '../../../BaseNode.js';

export default class GoogleSheetsActionNode extends ActionNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
