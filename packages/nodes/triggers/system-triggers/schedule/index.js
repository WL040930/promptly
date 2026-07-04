import { TriggerNode } from '../../../BaseNode.js';

export default class ScheduleCronNode extends TriggerNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
