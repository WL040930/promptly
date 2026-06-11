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
import WorkflowNode from './WorkflowNode';

const nodeTypes = {
  trigger: WorkflowNode,
  ai: WorkflowNode,
  action: WorkflowNode,
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
      position: n.position || { x: 250, y: i * 150 + 50 },
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

  // Sync active node visual state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isActive: node.id === activeNodeId,
        },
      }))
    );
  }, [activeNodeId, setNodes]);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } }, eds)), [setEdges]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    if (reactFlowInstance && draggedNode) {
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setDragPosition(position);
    }
  }, [reactFlowInstance, draggedNode]);

  const onDragLeave = useCallback(() => {
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
          className: 'opacity-50 pointer-events-none drop-shadow-2xl z-50 ring-2 ring-blue-500 rounded-xl'
        }
      ];
    }
    return nodes;
  }, [nodes, draggedNode, dragPosition]);

  return (
    <div className="flex-1 relative bg-[#f8fafc] overflow-hidden border border-slate-200 rounded-2xl shadow-inner min-h-[400px]" ref={reactFlowWrapper}>
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
