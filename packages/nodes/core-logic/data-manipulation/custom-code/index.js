import { BaseNode } from '../../../BaseNode.js';
import { runCustomCode } from '../../../../cli/services/codeRunner/customCodeRunner.js';

export default class CustomNodeJSNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const upstreamNodeId = context.__runtime?.incomingNodeIds?.at(-1);
        const upstreamResult = upstreamNodeId ? context[upstreamNodeId] : null;
        const input = upstreamResult && typeof upstreamResult === 'object' && Object.hasOwn(upstreamResult, 'outputData')
            ? upstreamResult.outputData
            : upstreamResult || context?.initialPayload || {};
        const result = await runCustomCode({
            code: config.code,
            input,
            variables: context?.metadata?.variables || {},
            metadata: {
                workflowId: context?.metadata?.workflowId,
                runId: context?.metadata?.runId
            },
            timeoutMs: config.timeoutMs
        });
        return { success: true, outputData: result.output, logs: result.logs };
    }
}
