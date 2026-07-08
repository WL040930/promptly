import { BaseNode } from '../../../BaseNode.js';

function toTitleCase(str) {
    return String(str).replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const result = { ...obj };
    let cursor = result;
    for (let i = 0; i < keys.length - 1; i++) {
        cursor[keys[i]] = { ...cursor[keys[i]] };
        cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
    return result;
}

export default class DataTransformNode extends BaseNode {
    async execute(context) {
        const config     = this.getResolvedConfig(context);
        const { operation = 'uppercase', operand = '', decimals = 2 } = config;
        const inputValue = config.value ?? '';

        let result;

        try {
            switch (operation) {
                // ── Text ────────────────────────────────────────────────────────────
                case 'uppercase':   result = String(inputValue).toUpperCase(); break;
                case 'lowercase':   result = String(inputValue).toLowerCase(); break;
                case 'titlecase':   result = toTitleCase(inputValue); break;
                case 'trim':        result = String(inputValue).trim(); break;
                case 'replace': {
                    const [find, replace] = String(operand).split('|');
                    result = String(inputValue).replaceAll(find ?? '', replace ?? '');
                    break;
                }
                case 'split':       result = String(inputValue).split(operand || ','); break;
                case 'slice': {
                    const [start, end] = String(operand).split(':').map(Number);
                    result = String(inputValue).slice(start || 0, end || undefined);
                    break;
                }

                // ── Number ──────────────────────────────────────────────────────────
                case 'add':         result = Number(inputValue) + Number(operand || 0); break;
                case 'subtract':    result = Number(inputValue) - Number(operand || 0); break;
                case 'multiply':    result = Number(inputValue) * Number(operand || 1); break;
                case 'divide': {
                    const divisor = Number(operand);
                    if (divisor === 0) throw new Error('Division by zero');
                    result = Number(inputValue) / divisor;
                    break;
                }
                case 'round':       result = Math.round(Number(inputValue)); break;
                case 'floor':       result = Math.floor(Number(inputValue)); break;
                case 'ceil':        result = Math.ceil(Number(inputValue)); break;
                case 'abs':         result = Math.abs(Number(inputValue)); break;
                case 'toFixed':     result = Number(inputValue).toFixed(Number(decimals) || 2); break;

                // ── Date ────────────────────────────────────────────────────────────
                case 'now':         result = new Date().toISOString(); break;
                case 'formatDate': {
                    const d = inputValue ? new Date(inputValue) : new Date();
                    // Simple format pattern: YYYY-MM-DD HH:mm:ss
                    const fmt = String(operand || 'YYYY-MM-DD');
                    result = fmt
                        .replace('YYYY', d.getFullYear())
                        .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
                        .replace('DD', String(d.getDate()).padStart(2, '0'))
                        .replace('HH', String(d.getHours()).padStart(2, '0'))
                        .replace('mm', String(d.getMinutes()).padStart(2, '0'))
                        .replace('ss', String(d.getSeconds()).padStart(2, '0'));
                    break;
                }
                case 'addDays': {
                    const d = inputValue ? new Date(inputValue) : new Date();
                    d.setDate(d.getDate() + Number(operand || 0));
                    result = d.toISOString();
                    break;
                }
                case 'subtractDays': {
                    const d = inputValue ? new Date(inputValue) : new Date();
                    d.setDate(d.getDate() - Number(operand || 0));
                    result = d.toISOString();
                    break;
                }

                // ── JSON ────────────────────────────────────────────────────────────
                case 'parse':       result = JSON.parse(String(inputValue)); break;
                case 'stringify':   result = JSON.stringify(inputValue, null, 2); break;
                case 'get':         result = getNestedValue(inputValue, String(operand)); break;
                case 'set': {
                    const [path, value] = String(operand).split('=');
                    result = setNestedValue(
                        typeof inputValue === 'object' ? inputValue : JSON.parse(String(inputValue)),
                        path.trim(),
                        value?.trim()
                    );
                    break;
                }
                case 'keys':
                    result = Object.keys(typeof inputValue === 'object' ? inputValue : JSON.parse(String(inputValue)));
                    break;

                default:
                    result = inputValue;
            }
        } catch (err) {
            return {
                success: false,
                error: err.message,
                result: null,
                outputType: 'null',
                inputValue,
            };
        }

        return {
            success: true,
            result,
            outputType: Array.isArray(result) ? 'array' : typeof result,
            inputValue,
        };
    }
}
