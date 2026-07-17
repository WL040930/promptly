import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure } from '../../shared/logicValues.js';

export const mergeInputs = (context, inputNodeIds = [], mode = 'object') => {
    const inputs = inputNodeIds.map(nodeId => ({ nodeId, value: context[nodeId] }));
    if (mode === 'array') return inputs.map(input => input.value);
    if (mode === 'last') return inputs.at(-1)?.value ?? null;
    return Object.fromEntries(inputs.map(input => [input.nodeId, input.value]));
};

export default class MergeBranchesNode extends BaseNode {
    async execute(context) {
        const mode = this.getResolvedConfig(context).mergeMode || 'object';
        if (!['object', 'array', 'last'].includes(mode)) {
            return nodeFailure('MERGE_FAILED', `Unsupported merge mode "${mode}".`);
        }
        const inputNodeIds = context.__runtime?.incomingNodeIds || [];
        const merged = mergeInputs(context, inputNodeIds, mode);
        return {
            success: true,
            outputData: merged,
            merged,
            inputNodeIds,
            mergedAt: new Date().toISOString()
        };
    }
}
