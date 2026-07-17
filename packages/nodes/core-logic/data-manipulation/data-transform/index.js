import { BaseNode } from '../../../BaseNode.js';
import {
    addCalendarDays,
    formatDate,
    getNestedValue,
    nodeFailure,
    parseAssignment,
    parseFiniteNumber,
    parseInteger,
    parseJsonValue,
    setNestedValue,
    valueType
} from '../../shared/logicValues.js';

const textValue = value => String(value ?? '');

const parseReplaceOperand = operand => {
    if (operand && typeof operand === 'object') {
        return { find: textValue(operand.find), replacement: textValue(operand.replacement) };
    }
    const text = textValue(operand);
    const separator = text.indexOf('|');
    if (separator < 0) throw new Error('Replace requires an operand in find|replacement format.');
    return { find: text.slice(0, separator), replacement: text.slice(separator + 1) };
};

const executeTransform = (config) => {
    const operation = config.operation || 'uppercase';
    const inputValue = config.value !== undefined ? config.value : (config.input1 ?? '');
    const operand = config.operand ?? '';
    let result;

    switch (operation) {
        case 'uppercase': result = textValue(inputValue).toUpperCase(); break;
        case 'lowercase': result = textValue(inputValue).toLowerCase(); break;
        case 'titlecase': result = textValue(inputValue).replace(/\b\w/g, letter => letter.toUpperCase()).replace(/\B\w/g, letter => letter.toLowerCase()); break;
        case 'trim': result = textValue(inputValue).trim(); break;
        case 'replace': {
            const { find, replacement } = parseReplaceOperand(operand);
            if (!find) throw new Error('Replace requires a non-empty search value.');
            result = textValue(inputValue).replaceAll(find, replacement);
            break;
        }
        case 'split': {
            const separator = textValue(operand || ',');
            if (!separator) throw new Error('Split requires a non-empty separator.');
            result = textValue(inputValue).split(separator);
            break;
        }
        case 'slice': {
            const [rawStart, rawEnd] = textValue(operand).split(':');
            const start = rawStart === '' ? 0 : parseInteger(rawStart, 'Slice start');
            const end = rawEnd === undefined || rawEnd === '' ? undefined : parseInteger(rawEnd, 'Slice end');
            result = textValue(inputValue).slice(start, end);
            break;
        }
        case 'add': result = parseFiniteNumber(inputValue, 'Input value') + parseFiniteNumber(operand || 0, 'Operand'); break;
        case 'subtract': result = parseFiniteNumber(inputValue, 'Input value') - parseFiniteNumber(operand || 0, 'Operand'); break;
        case 'multiply': result = parseFiniteNumber(inputValue, 'Input value') * parseFiniteNumber(operand || 1, 'Operand'); break;
        case 'divide': {
            const divisor = parseFiniteNumber(operand, 'Operand');
            if (divisor === 0) throw new Error('Division by zero.');
            result = parseFiniteNumber(inputValue, 'Input value') / divisor;
            break;
        }
        case 'round': result = Math.round(parseFiniteNumber(inputValue, 'Input value')); break;
        case 'floor': result = Math.floor(parseFiniteNumber(inputValue, 'Input value')); break;
        case 'ceil': result = Math.ceil(parseFiniteNumber(inputValue, 'Input value')); break;
        case 'abs': result = Math.abs(parseFiniteNumber(inputValue, 'Input value')); break;
        case 'toFixed': {
            const decimals = parseInteger(config.decimals ?? 2, 'Decimal places', { min: 0, max: 20 });
            result = parseFiniteNumber(inputValue, 'Input value').toFixed(decimals);
            break;
        }
        case 'now': result = new Date().toISOString(); break;
        case 'formatDate': result = formatDate(inputValue, operand || 'YYYY-MM-DD', config.timezone || 'UTC'); break;
        case 'addDays': result = addCalendarDays(inputValue, parseFiniteNumber(operand || 0, 'Days')); break;
        case 'subtractDays': result = addCalendarDays(inputValue, -parseFiniteNumber(operand || 0, 'Days')); break;
        case 'parse': result = parseJsonValue(inputValue, 'Input value'); break;
        case 'stringify': result = JSON.stringify(inputValue, null, 2); break;
        case 'get': result = getNestedValue(inputValue, operand); break;
        case 'set': {
            const { path, value } = parseAssignment(operand);
            result = setNestedValue(parseJsonValue(inputValue, 'Input value'), path, value);
            break;
        }
        case 'keys': {
            const parsed = parseJsonValue(inputValue, 'Input value');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Keys requires a JSON object.');
            result = Object.keys(parsed);
            break;
        }
        default: throw new Error(`Unsupported transform operation "${operation}".`);
    }

    return {
        success: true,
        outputData: result,
        result,
        outputType: valueType(result),
        inputValue
    };
};

export default class DataTransformNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        try {
            return executeTransform(config);
        } catch (error) {
            return nodeFailure('TRANSFORM_FAILED', error.message, {
                outputData: null,
                result: null,
                outputType: 'null',
                inputValue: config.value ?? config.input1 ?? null
            });
        }
    }
}

export { executeTransform };
