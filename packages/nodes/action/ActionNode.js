import { BaseNode } from '../BaseNode.js';

export class ActionNode extends BaseNode {
    constructor(id, subType, config = {}, position = null) {
        super(id, 'action', subType, config, position);
    }

    validate() {
        return true;
    }

    async execute(context) {
        return {
            ...context,
            actionStatus: 'success',
            executedAt: new Date().toISOString()
        };
    }
}
