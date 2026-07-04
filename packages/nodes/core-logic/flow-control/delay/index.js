import { LogicNode } from '../../../BaseNode.js';

export default class WaitDelayNode extends LogicNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
