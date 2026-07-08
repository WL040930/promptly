import { BaseNode } from '../../../BaseNode.js';

export default class CatchErrorNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { errorSource = '', fallbackValue = '' } = config;

        // Check if any upstream node returned success: false
        // Look for a failed node in the context
        let errorMessage = null;
        let failedNodeId = null;

        const nodeIdsToCheck = errorSource
            ? [errorSource]
            : Object.keys(context).filter(k => k !== 'initialPayload');

        for (const nodeId of nodeIdsToCheck) {
            const nodeResult = context[nodeId];
            if (nodeResult && nodeResult.success === false) {
                errorMessage = nodeResult.error || 'Unknown error';
                failedNodeId = nodeId;
                break;
            }
        }

        const hasError = Boolean(errorMessage);

        // Route via targetHandle so the execution engine can branch correctly
        const targetHandle = hasError ? 'errorPath' : 'successPath';

        return {
            success: true, // this node itself succeeded
            hasError,
            errorMessage,
            failedNodeId,
            fallbackValue: hasError ? fallbackValue : null,
            targetHandle,
        };
    }
}
