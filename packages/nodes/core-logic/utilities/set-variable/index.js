import { BaseNode } from '../../../BaseNode.js';

export default class SetVariableNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { variableName = 'myVariable', variableValue = '', valueType = 'auto' } = config;

        let parsedValue = variableValue;

        try {
            switch (valueType) {
                case 'number':
                    parsedValue = Number(variableValue);
                    break;
                case 'boolean':
                    parsedValue = String(variableValue).toLowerCase() === 'true';
                    break;
                case 'json':
                    parsedValue = typeof variableValue === 'object'
                        ? variableValue
                        : JSON.parse(String(variableValue));
                    break;
                case 'auto':
                    // Try to auto-detect: number → boolean → JSON → string
                    if (!isNaN(variableValue) && variableValue !== '') {
                        parsedValue = Number(variableValue);
                    } else if (variableValue === 'true' || variableValue === 'false') {
                        parsedValue = variableValue === 'true';
                    } else {
                        try { parsedValue = JSON.parse(String(variableValue)); } catch { /* keep as string */ }
                    }
                    break;
                case 'string':
                default:
                    parsedValue = String(variableValue);
            }
        } catch {
            parsedValue = variableValue; // fall back to raw value
        }

        return {
            success: true,
            variableName,
            value: parsedValue,
            // Also expose as a named key for ergonomic {{nodeId.variableName}} access
            [variableName]: parsedValue,
        };
    }
}
