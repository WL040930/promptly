import { BaseNode } from '../BaseNode.js';

export class AINode extends BaseNode {
    constructor(id, config = {}, position = null) {
        super(id, 'ai', config, position);
    }

    validate() {
        // AI nodes require prompt configuration
        return !!this.config.prompt;
    }

    async execute(context) {
        // Placeholder for AI execution calling LLM API
        const prompt = this.config.prompt || '';
        return {
            ...context,
            aiOutput: `Executed prompt: "${prompt}" successfully.`
        };
    }
}
