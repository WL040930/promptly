import { BaseNode } from '../BaseNode.js';

export class LogicNode extends BaseNode {
    constructor(id, subType, config = {}, position = null) {
        super(id, 'logic', subType, config, position);
    }

    validate() {
        return true;
    }

    async execute(context) {
        // Logic nodes evaluate conditions and return edge selection details
        return {
            ...context,
            logicStatus: 'evaluated'
        };
    }
}
