const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * Clone a workflow node for insertion into the current workflow.
 * React Flow's transient selection/drag state is intentionally not carried
 * into the persisted node definition.
 */
export const cloneWorkflowNodeForPaste = (node, { id, title, position } = {}) => {
    if (!node || typeof node !== 'object' || !node.id) return null;

    const copy = clone(node);
    delete copy.selected;
    delete copy.dragging;

    return {
        ...copy,
        id: id || `${node.id}-copy`,
        title: title || node.title,
        position: {
            ...(node.position || { x: 0, y: 0 }),
            ...(position || {})
        }
    };
};
