import { BaseNode } from '../../../BaseNode.js';
import { isEmptyValue, nodeFailure, parseFiniteNumber } from '../../shared/logicValues.js';

const asList = value => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(item => item.trim());
    return [value];
};

const evaluateCondition = ({ valueA, operator, valueB }) => {
    switch (operator) {
        case 'equals': return valueA === valueB;
        case 'not_equals': return valueA !== valueB;
        case '==': return valueA == valueB;
        case '!=': return valueA != valueB;
        case 'greater_than': return parseFiniteNumber(valueA, 'Value A') > parseFiniteNumber(valueB, 'Value B');
        case 'greater_than_or_equal': return parseFiniteNumber(valueA, 'Value A') >= parseFiniteNumber(valueB, 'Value B');
        case 'less_than': return parseFiniteNumber(valueA, 'Value A') < parseFiniteNumber(valueB, 'Value B');
        case 'less_than_or_equal': return parseFiniteNumber(valueA, 'Value A') <= parseFiniteNumber(valueB, 'Value B');
        case 'contains': return Array.isArray(valueA) ? valueA.includes(valueB) : String(valueA ?? '').includes(String(valueB ?? ''));
        case 'starts_with': return String(valueA ?? '').startsWith(String(valueB ?? ''));
        case 'ends_with': return String(valueA ?? '').endsWith(String(valueB ?? ''));
        case 'in': return asList(valueB).includes(valueA);
        case 'not_in': return !asList(valueB).includes(valueA);
        case 'exists': return valueA !== undefined && valueA !== null;
        case 'empty': return isEmptyValue(valueA);
        case 'truthy': return Boolean(valueA);
        case 'falsy': return !valueA;
        default: throw new Error(`Unsupported condition operator "${operator}".`);
    }
};

export default class ConditionIfElseNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const valueA = config.valueA !== '' && config.valueA !== undefined ? config.valueA : config.input1;
        const valueB = config.valueB !== '' && config.valueB !== undefined ? config.valueB : config.input2;

        try {
            const result = evaluateCondition({ valueA, valueB, operator: config.operator || 'equals' });
            return {
                success: true,
                outputData: result,
                result,
                targetHandle: result ? 'true' : 'false'
            };
        } catch (error) {
            return nodeFailure('CONDITION_FAILED', error.message, { targetHandle: 'false' });
        }
    }
}

export { evaluateCondition };
