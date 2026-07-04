import { BaseNode } from '../BaseNode.js';

export class AINode extends BaseNode {
    constructor(id, subType, config = {}, position = null) {
        super(id, 'ai', subType, config, position);
    }

    validate() {
        return !!this.config.prompt;
    }

    async execute(context) {
        let prompt = this.config.prompt || '';
        
        // Template substitution from context (e.g. {{initialPayload.message}})
        prompt = prompt.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let val = context;
            for (const key of keys) {
                if (val && typeof val === 'object') {
                    val = val[key];
                } else {
                    return match;
                }
            }
            return val !== undefined ? String(val) : match;
        });

        const { executeNodePrompt } = await import('../../cli/services/ai/aiService.js');
        const systemInstruction = this.config.systemInstruction || 'You are a helpful AI assistant.';
        const result = await executeNodePrompt(prompt, systemInstruction);

        return {
            ...context,
            aiOutput: result
        };
    }
}
