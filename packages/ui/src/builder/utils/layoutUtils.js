export const calculateAutoLayout = (nodes, edges) => {
    // 1. Build adjacency list and in-degree maps
    const adj = {};
    const inDegree = {};

    nodes.forEach(n => {
      adj[n.id] = [];
      inDegree[n.id] = 0;
    });

    edges.forEach(e => {
      if (adj[e.source] && inDegree[e.target] !== undefined) {
        adj[e.source].push(e.target);
        inDegree[e.target]++;
      }
    });

    // 2. Queue for roots (nodes with in-degree 0)
    let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);

    // Fallback if cycles exist
    if (queue.length === 0 && nodes.length > 0) {
      queue = [nodes[0].id];
    }

    // 3. Assign layers using BFS
    const layers = {};
    const nodeLayerMap = {};
    let currentLayer = 0;

    while (queue.length > 0) {
      const nextQueue = [];
      layers[currentLayer] = [];

      queue.forEach(nodeId => {
        if (nodeLayerMap[nodeId] !== undefined) return;
        nodeLayerMap[nodeId] = currentLayer;
        layers[currentLayer].push(nodeId);

        (adj[nodeId] || []).forEach(neighborId => {
          inDegree[neighborId]--;
          if (inDegree[neighborId] <= 0) {
            nextQueue.push(neighborId);
          }
        });
      });

      if (nextQueue.length === 0 && Object.keys(nodeLayerMap).length < nodes.length) {
        const unvisited = nodes.find(n => nodeLayerMap[n.id] === undefined);
        if (unvisited) {
          nextQueue.push(unvisited.id);
        }
      }

      currentLayer++;
      queue = nextQueue;
    }

    // 4. Calculate layout positions (Horizontal)
    const HORIZONTAL_GAP = 350;
    const VERTICAL_GAP = 200;

    return nodes.map(node => {
      const layer = nodeLayerMap[node.id] || 0;
      const nodesInLayer = layers[layer] || [node.id];
      const indexInLayer = nodesInLayer.indexOf(node.id);

      const colHeight = (nodesInLayer.length - 1) * VERTICAL_GAP;
      const yOffset = indexInLayer * VERTICAL_GAP - (colHeight / 2);

      return {
        ...node,
        position: {
          x: 50 + (layer * HORIZONTAL_GAP),
          y: 200 + yOffset
        }
      };
    });
};
