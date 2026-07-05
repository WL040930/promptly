import { deepResolve } from '../cli/utils/contextParser.js';

export class BaseNode {
    constructor(id, type, subType, config = {}, position = null) {
        this.id = id;
        this.type = type;
        this.subType = subType;
        this.config = config;
        this.position = position;
    }

    validate() {
        return true;
    }

    // Resolves the current config against the execution context
    getResolvedConfig(contextData) {
        return deepResolve(this.config, contextData);
    }

    async execute(context) {
        throw new Error("Execute method not implemented");
    }
}

export class TriggerNode extends BaseNode {}
export class ActionNode extends BaseNode {}
export class LogicNode extends BaseNode {}
export class AINode extends BaseNode {}
