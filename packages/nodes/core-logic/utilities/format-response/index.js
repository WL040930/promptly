import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseJsonValue, valueType } from '../../shared/logicValues.js';

const parseHeaders = value => {
    if (value === undefined || value === null || value === '') return {};
    const headers = parseJsonValue(value, 'Response headers');
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
        throw new Error('Response headers must be a JSON object.');
    }
    return Object.fromEntries(Object.entries(headers).map(([name, headerValue]) => {
        if (!name.trim() || /[\r\n]/.test(name) || /[\r\n]/.test(String(headerValue))) {
            throw new Error('Response headers cannot contain line breaks.');
        }
        return [name, String(headerValue)];
    }));
};

const buildResponse = config => {
    const mode = config.mode || 'template';
    if (!['template', 'json'].includes(mode)) throw new Error(`Unsupported response mode "${mode}".`);

    const statusCode = Number(config.statusCode ?? 200);
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
        throw new Error('Response status code must be an integer between 100 and 599.');
    }

    const headers = parseHeaders(config.headers);
    let output;
    let contentType;
    if (mode === 'json') {
        output = parseJsonValue(config.jsonTemplate ?? '', 'JSON template');
        contentType = 'application/json';
    } else {
        output = String(config.template ?? '');
        contentType = 'text/plain; charset=utf-8';
    }

    if (!Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = contentType;
    }
    return {
        body: output,
        output,
        outputType: valueType(output),
        statusCode,
        headers,
        contentType
    };
};

export default class FormatResponseNode extends BaseNode {
    async execute(context) {
        try {
            const result = buildResponse(this.getResolvedConfig(context));
            return { success: true, outputData: result, ...result };
        } catch (error) {
            return nodeFailure('RESPONSE_FORMAT_FAILED', error.message, { outputData: null, output: null, outputType: 'null' });
        }
    }
}

export { buildResponse };
