import { BaseNode } from '../../../BaseNode.js';

export default class PromptlyFormNode extends BaseNode {
    async execute(context) {
        // Core execution logic goes here
        return { ...context, success: true };
    }
}
