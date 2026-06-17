import { BaseNode } from '../BaseNode.js';

export class TriggerNode extends BaseNode {
    constructor(id, config = {}, position = null) {
        super(id, 'trigger', config, position);
    }

    validate() {
        // Triggers might require webhook URL, schedule string, or connection options
        return true;
    }

    async execute(context) {
        // A trigger starts the workflow, returning initial event payload
        return {
            ...context,
            triggerTime: new Date().toISOString(),
            payload: this.config.payload || {}
        };
    }
}
