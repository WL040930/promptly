import { BaseNode } from '../BaseNode.js';

export class AINode extends BaseNode {
    constructor(id, subType, config = {}, position = null) {
        super(id, 'ai', subType, config, position);
    }

    validate() {
        return !!this.config.prompt;
    }

    async execute(context) {
        const prompt = this.config.prompt || '';
        return {
            ...context,
            aiOutput: `Executed prompt: "${prompt}" successfully.`
        };
    }
}
