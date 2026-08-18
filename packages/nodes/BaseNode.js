import { deepResolve, findUnresolvedVariables } from '../cli/utils/contextParser.js';

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
        const resolved = deepResolve(this.config, contextData);
        const unresolved = findUnresolvedVariables(resolved);
        if (unresolved.length > 0) {
            const error = new Error(`Workflow value could not be resolved: ${unresolved[0].token} at ${unresolved[0].path}.`);
            error.code = 'WORKFLOW_VARIABLE_UNRESOLVED';
            error.unresolvedVariables = unresolved;
            throw error;
        }
        return resolved;
    }

    getRuntimeInput(contextData, inputName = 'inputData') {
        return contextData?.__runtime?.inputs?.[this.id]?.[inputName];
    }

    async execute(context) {
        throw new Error("Execute method not implemented");
    }
}
