import { BaseNode } from '../../../BaseNode.js';

export default class FormatResponseNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { mode = 'template', template = '', jsonTemplate = '', statusCode = 200 } = config;

        let output;
        let outputType;

        if (mode === 'json') {
            try {
                // jsonTemplate is already resolved by getResolvedConfig (variables replaced)
                output = typeof jsonTemplate === 'object'
                    ? jsonTemplate
                    : JSON.parse(String(jsonTemplate));
                outputType = 'object';
            } catch (err) {
                return {
                    success: false,
                    error: `Invalid JSON template: ${err.message}`,
                    output: null,
                    outputType: 'null',
                };
            }
        } else {
            // Template mode — variables already resolved by getResolvedConfig
            output = String(template);
            outputType = 'string';
        }

        return {
            success: true,
            output,
            outputType,
            statusCode,
        };
    }
}
