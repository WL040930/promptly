import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TriggerNode from '../../nodes/TriggerNode';
import AINode from '../../nodes/AINode';
import ActionNode from '../../nodes/ActionNode';

const nodeTypes = {
  trigger: TriggerNode,
  ai: AINode,
  action: ActionNode,
};

const WorkflowCanvasInner = ({ initialNodes, activeNodeId, onNodeClick, onNodesChangeCallback, onEdgesChangeCallback, onAddNode, draggedNode }) => {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);

  // Translate simple internal nodes array into React Flow nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Initialize nodes and edges from props only on mount or when workflow completely changes
  useEffect(() => {
    const rfNodes = initialNodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 250, y: i * 280 + 50 },
      data: {
        title: n.title,
        description: n.description,
        isActive: n.id === activeNodeId,
        onClick: () => onNodeClick(n.id)
      }
    }));
    
    // Automatically connect nodes sequentially for initial layout
    const rfEdges = [];
    for (let i = 0; i < initialNodes.length - 1; i++) {
      rfEdges.push({
        id: `e-${initialNodes[i].id}-${initialNodes[i+1].id}`,
        source: initialNodes[i].id,
        target: initialNodes[i+1].id,
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      });
    }

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [initialNodes.map(n => n.id).join(',')]); // Only re-run if node identities change

  // Sync active node visual state, title, and description from props
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const matchingInitialNode = initialNodes.find((n) => n.id === node.id);
        if (!matchingInitialNode) return node;
        return {
          ...node,
          data: {
            ...node.data,
            title: matchingInitialNode.title,
            description: matchingInitialNode.description,
            isActive: node.id === activeNodeId,
          },
        };
      })
    );
  }, [initialNodes, activeNodeId, setNodes]);

  const triggerAutoLayout = useCallback(() => {
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

    // 4. Calculate layout positions
    const HORIZONTAL_GAP = 380;
    const VERTICAL_GAP = 280;

    const laidOutNodes = nodes.map(node => {
      const layer = nodeLayerMap[node.id] || 0;
      const nodesInLayer = layers[layer] || [node.id];
      const indexInLayer = nodesInLayer.indexOf(node.id);
      
      const rowWidth = (nodesInLayer.length - 1) * HORIZONTAL_GAP;
      const xOffset = indexInLayer * HORIZONTAL_GAP - (rowWidth / 2);
      
      return {
        ...node,
        position: {
          x: 250 + xOffset,
          y: 50 + (layer * VERTICAL_GAP)
        }
      };
    });

    // 5. Update React Flow state
    setNodes(laidOutNodes);

    // 6. Notify parent component to persist layout updates in localStorage
    const changes = laidOutNodes.map(node => ({
      id: node.id,
      type: 'position',
      position: node.position
    }));
    onNodesChangeCallback?.(changes);
  }, [nodes, edges, setNodes, onNodesChangeCallback]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } }, eds)), [setEdges]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    if (reactFlowInstance && draggedNode) {
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // Center the node (288px width, ~110px height) under the cursor
      position.x -= 144;
      position.y -= 55;
      setDragPosition(position);
    }
  }, [reactFlowInstance, draggedNode]);

  const onDragLeave = useCallback((event) => {
    if (reactFlowWrapper.current) {
      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const x = event.clientX;
      const y = event.clientY;
      // If cursor is still within the canvas boundaries, do not clear the preview
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return;
      }
    }
    setDragPosition(null);
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragPosition(null);

      const type = event.dataTransfer.getData('application/reactflow-type');
      const dataStr = event.dataTransfer.getData('application/reactflow-data');

      // Check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // Center the node (288px width, ~110px height) under the cursor
      position.x -= 144;
      position.y -= 55;

      const parsedData = JSON.parse(dataStr);
      onAddNode(parsedData, position);
    },
    [reactFlowInstance, onAddNode],
  );

  const displayNodes = React.useMemo(() => {
    if (draggedNode && dragPosition) {
      return [
        ...nodes,
        {
          id: 'preview-drag-node',
          type: draggedNode.type,
          position: dragPosition,
          data: { ...draggedNode, isActive: false },
          className: 'opacity-60 pointer-events-none drop-shadow-2xl z-50 ring-2 ring-blue-500/50 rounded-2xl'
        }
      ];
    }
    return nodes;
  }, [nodes, draggedNode, dragPosition]);

  return (
    <div className="flex-1 relative bg-[#f8fafc] overflow-hidden border border-slate-200 rounded-2xl shadow-inner min-h-[400px]" ref={reactFlowWrapper}>
      {/* Floating Auto Layout Button Overlay */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={triggerAutoLayout}
          className="bg-white/90 backdrop-blur border border-slate-200 shadow-md hover:shadow-lg rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/20 flex items-center gap-1.5 transition-all select-none hover:-translate-y-0.5 duration-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="stroke-current">
            <path d="M21 16V8a2 2 0 0 0-2-2h-5M3 8v8a2 2 0 0 0 2 2h5"></path>
            <polyline points="10 12 14 12 14 6"></polyline>
            <polyline points="14 12 10 12 10 18"></polyline>
          </svg>
          Auto Layout
        </button>
      </div>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={(changes) => {
            // Ignore changes on the preview node
            const filteredChanges = changes.filter(c => c.id !== 'preview-drag-node');
            if (filteredChanges.length > 0) {
              onNodesChange(filteredChanges);
              onNodesChangeCallback?.(filteredChanges);
            }
        }}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-50"
      >
        <Controls />
        <MiniMap zoomable pannable nodeClassName={(n) => {
            if (n.type === 'trigger') return 'bg-indigo-500';
            if (n.type === 'ai') return 'bg-purple-500';
            return 'bg-blue-500';
        }} />
        <Background color="#cbd5e1" gap={24} size={2} />
      </ReactFlow>
    </div>
  );
};

const WorkflowCanvas = (props) => (
  <ReactFlowProvider>
    <WorkflowCanvasInner {...props} />
  </ReactFlowProvider>
);

export default WorkflowCanvas;
