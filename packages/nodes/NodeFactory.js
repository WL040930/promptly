import NodeRegistry from '../cli/utils/NodeRegistry.js';

export class NodeFactory {
    static createNode(nodeData) {
        const { id, type, subType, config, position } = nodeData;
        
        const NodeClass = NodeRegistry.getClass(type, subType);
        
        if (NodeClass) {
            return new NodeClass(id, subType, config, position);
        } else {
            console.warn(`[NodeFactory] Unknown node type/subType: ${type}:${subType}. Falling back to a generic base node if applicable.`);
            throw new Error(`Unknown node type/subType: ${type}:${subType}`);
        }
    }
}
