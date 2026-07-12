import NodeRegistry from '../cli/utils/NodeRegistry.js';

export class NodeFactory {
    static createNode(nodeData) {
        const { id, type, subType, title, description, schema, config, position } = nodeData;
        
        const NodeClass = NodeRegistry.getClass(type, subType);
        
        if (NodeClass) {
            const node = new NodeClass(id, type, subType, config, position);
            node.title = title;
            node.description = description;
            node.schema = schema;
            return node;
        } else {
            console.warn(`[NodeFactory] Unknown node type/subType: ${type}:${subType}. Falling back to a generic base node if applicable.`);
            throw new Error(`Unknown node type/subType: ${type}:${subType}`);
        }
    }
}
