import { TriggerNode } from '../../../BaseNode.js';

export default class EmailReceivedNode extends TriggerNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
