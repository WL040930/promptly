import { BaseNode } from '../../../BaseNode.js';

export default class LoopIteratorNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        let items = config.inputArray;

        // Ensure we actually have an array. If it's a string representation, try to parse it.
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                // Not valid JSON, wrap it in an array
                items = [items];
            }
        }

        if (!Array.isArray(items)) {
            items = items ? [items] : [];
        }

        return { 
            success: true, 
            count: items.length,
            items: items
        };
    }
}
