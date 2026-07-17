import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseFiniteNumber, parseJsonValue } from '../../shared/logicValues.js';

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set(['__proto__', 'prototype', 'constructor', 'metadata', 'initialPayload']);

const parseVariable = (config) => {
    const variableName = String(config.variableName || '').trim();
    if (!VALID_NAME.test(variableName) || RESERVED_NAMES.has(variableName)) {
        throw new Error('Variable name must start with a letter or underscore and cannot be reserved.');
    }

    const valueType = config.valueType || 'string';
    const rawValue = config.variableValue ?? '';
    let value;
    switch (valueType) {
        case 'number': value = parseFiniteNumber(rawValue, 'Variable value'); break;
        case 'boolean': {
            if (rawValue === true || rawValue === false) value = rawValue;
            else if (rawValue === 'true' || rawValue === 'false') value = rawValue === 'true';
            else throw new Error('Boolean variable value must be true or false.');
            break;
        }
        case 'json': value = parseJsonValue(rawValue, 'Variable value'); break;
        case 'auto': {
            if (typeof rawValue !== 'string') value = rawValue;
            else if (rawValue.trim() === '') value = '';
            else {
                try { value = JSON.parse(rawValue); }
                catch { value = rawValue; }
            }
            break;
        }
        case 'string': value = String(rawValue); break;
        default: throw new Error(`Unsupported variable type "${valueType}".`);
    }

    return { variableName, value, valueType };
};

export default class SetVariableNode extends BaseNode {
    async execute(context) {
        try {
            const { variableName, value, valueType } = parseVariable(this.getResolvedConfig(context));
            return {
                success: true,
                outputData: { variableName, value },
                variableName,
                value,
                valueType,
                variables: { [variableName]: value }
            };
        } catch (error) {
            return nodeFailure('VARIABLE_FAILED', error.message, { outputData: null });
        }
    }
}

export { parseVariable };
