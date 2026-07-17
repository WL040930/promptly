import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure } from '../../shared/logicValues.js';

export const findCatchableError = (context, errorSource = '') => {
    const errors = Array.isArray(context.metadata?.errors) ? context.metadata.errors : [];
    const candidates = errors.filter(error => !error.handled && (!errorSource || error.nodeId === errorSource));
    return candidates[candidates.length - 1] || null;
};

export default class CatchErrorNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        try {
            const failure = findCatchableError(context, config.errorSource || '');
            const hasError = Boolean(failure);
            return {
                success: true,
                outputData: {
                    hasError,
                    errorMessage: failure?.error || null,
                    failedNodeId: failure?.nodeId || null,
                    fallbackValue: hasError ? (config.fallbackValue ?? null) : null
                },
                hasError,
                errorMessage: failure?.error || null,
                failedNodeId: failure?.nodeId || null,
                fallbackValue: hasError ? (config.fallbackValue ?? null) : null,
                handledError: hasError,
                targetHandle: hasError ? 'errorPath' : 'successPath'
            };
        } catch (error) {
            return nodeFailure('CATCH_ERROR_FAILED', error.message, { targetHandle: 'successPath' });
        }
    }
}
