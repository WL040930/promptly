import { LogicNode } from '../../../BaseNode.js';

export default class MergeBranchesNode extends LogicNode {
    async execute(context) {
        // The execution engine inherently waits for all incoming edges to complete
        // before running this node (due to inDegree tracking).
        // Therefore, we just act as a pass-through marker.
        return { 
            success: true,
            mergedAt: new Date().toISOString()
        };
    }
}
