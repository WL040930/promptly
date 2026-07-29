const HORIZONTAL_GAP = 350;
const VERTICAL_GAP = 200;
const NODE_WIDTH = 300;
const NODE_HEIGHT = 160;

export const isNodeLayoutPinned = node => node?.layoutPinned !== false;

const calculateFullLayout = (nodes, edges) => {
    const adjacency = new Map(nodes.map(node => [node.id, []]));
    const inDegree = new Map(nodes.map(node => [node.id, 0]));
    for (const edge of edges) {
        if (!adjacency.has(edge.source) || !inDegree.has(edge.target)) continue;
        adjacency.get(edge.source).push(edge.target);
        inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    }

    let queue = nodes.filter(node => inDegree.get(node.id) === 0).map(node => node.id);
    if (!queue.length && nodes.length) queue = [nodes[0].id];
    const layers = new Map();
    const nodeLayer = new Map();
    let layer = 0;
    while (queue.length) {
        const nextQueue = [];
        const ids = [];
        for (const id of queue) {
            if (nodeLayer.has(id)) continue;
            nodeLayer.set(id, layer);
            ids.push(id);
            for (const target of adjacency.get(id) || []) {
                inDegree.set(target, inDegree.get(target) - 1);
                if (inDegree.get(target) <= 0) nextQueue.push(target);
            }
        }
        layers.set(layer, ids);
        if (!nextQueue.length && nodeLayer.size < nodes.length) {
            const unvisited = nodes.find(node => !nodeLayer.has(node.id));
            if (unvisited) nextQueue.push(unvisited.id);
        }
        queue = nextQueue;
        layer += 1;
    }

    return nodes.map(node => {
        const index = nodeLayer.get(node.id) || 0;
        const nodesInLayer = layers.get(index) || [node.id];
        const row = nodesInLayer.indexOf(node.id);
        return {
            ...node,
            position: {
                x: 50 + index * HORIZONTAL_GAP,
                y: 200 + row * VERTICAL_GAP - ((nodesInLayer.length - 1) * VERTICAL_GAP) / 2
            }
        };
    });
};

const overlaps = (candidate, positioned) => positioned.some(node => {
    const position = node.position || { x: 0, y: 0 };
    return Math.abs(candidate.x - position.x) < NODE_WIDTH && Math.abs(candidate.y - position.y) < NODE_HEIGHT;
});

const nearestOpenPosition = (preferred, positioned) => {
    const yOffsets = [0];
    for (let step = 1; step <= 12; step += 1) yOffsets.push(step * VERTICAL_GAP, -step * VERTICAL_GAP);
    const xOffsets = [0];
    for (let step = 1; step <= 8; step += 1) xOffsets.push(step * HORIZONTAL_GAP, -step * HORIZONTAL_GAP);
    for (const xOffset of xOffsets) {
        for (const yOffset of yOffsets) {
            const candidate = { x: preferred.x + xOffset, y: preferred.y + yOffset };
            if (!overlaps(candidate, positioned)) return candidate;
        }
    }
    return { x: preferred.x + 9 * HORIZONTAL_GAP, y: preferred.y };
};

/**
 * Deterministically place a workflow graph. In respect-pins mode, missing
 * layoutPinned metadata is treated as pinned so older user layouts stay safe.
 */
export const layoutWorkflow = ({ nodes = [], edges = [], mode = 'respect-pins' } = {}) => {
    const idealNodes = calculateFullLayout(nodes, edges);
    if (mode === 'all') return idealNodes;

    const idealById = new Map(idealNodes.map(node => [node.id, node.position]));
    const pinned = nodes.filter(isNodeLayoutPinned).map(node => ({ ...node, position: { ...(node.position || idealById.get(node.id)) } }));
    const positioned = [...pinned];
    const resultById = new Map(pinned.map(node => [node.id, node]));

    const unpinned = nodes
        .filter(node => !isNodeLayoutPinned(node))
        .sort((left, right) => {
            const a = idealById.get(left.id);
            const b = idealById.get(right.id);
            return a.x - b.x || a.y - b.y || left.id.localeCompare(right.id);
        });
    for (const node of unpinned) {
        const placed = { ...node, position: nearestOpenPosition(idealById.get(node.id), positioned) };
        positioned.push(placed);
        resultById.set(node.id, placed);
    }
    return nodes.map(node => resultById.get(node.id));
};
