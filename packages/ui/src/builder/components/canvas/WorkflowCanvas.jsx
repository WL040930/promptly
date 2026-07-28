import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
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
import DynamicNode from '../../../nodes/DynamicNode';
import DeletableEdge from './edges/DeletableEdge';
import CustomConnectionLine from './edges/CustomConnectionLine';
import { calculateAutoLayout } from '../../utils/layoutUtils.js';

const edgeTypes = {
  deletable: DeletableEdge,
};

const nodeTypes = {
  trigger: DynamicNode,
  ai: DynamicNode,
  action: DynamicNode,
  logic: DynamicNode,
};

const WorkflowCanvasInner = ({ initialNodes, initialEdges = [], activeNodeId, onNodeClick, onNodesChangeCallback, onEdgesChangeCallback, onAddNode, onPasteNode, onEdgeDelete, draggedNode }) => {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  // Click-to-connect state
  const [pendingConnection, setPendingConnection] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const pendingConnectionRef = useRef(null);
  const makeEdgeRef = useRef(null);
  const onHandleClickRef = useRef(null);
  const onEdgeDeleteRef = useRef(onEdgeDelete);

  // Translate simple internal nodes array into React Flow nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const copiedNodeRef = useRef(null);
  const pasteOffsetRef = useRef(40);
  const [hasCopiedNode, setHasCopiedNode] = useState(false);
  const initialNodeById = useMemo(
    () => new Map(initialNodes.map(node => [node.id, node])),
    [initialNodes]
  );

  useEffect(() => {
    onEdgeDeleteRef.current = onEdgeDelete;
  }, [onEdgeDelete]);

  const selectedSourceNode = useCallback(() => {
    const selectedNode = nodes.find(node => node.selected) || nodes.find(node => node.id === activeNodeId);
    if (!selectedNode) return null;
    return initialNodeById.get(selectedNode.id) || selectedNode;
  }, [nodes, initialNodeById, activeNodeId]);

  const copySelectedNode = useCallback(() => {
    const sourceNode = selectedSourceNode();
    if (!sourceNode) return;
    copiedNodeRef.current = sourceNode;
    pasteOffsetRef.current = 40;
    setHasCopiedNode(true);
  }, [selectedSourceNode]);

  const pasteCopiedNode = useCallback(() => {
    if (!copiedNodeRef.current || typeof onPasteNode !== 'function') return;
    onPasteNode(copiedNodeRef.current, pasteOffsetRef.current);
    pasteOffsetRef.current += 40;
  }, [onPasteNode]);

  // Initialize nodes and edges from props only on mount or when workflow completely changes
  useEffect(() => {
    const rfNodes = initialNodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: i * 350 + 50, y: 150 },
      data: {
        subType: n.subType,
        title: n.title,
        description: n.description,
        schema: n.schema,
        icon: n.icon,
        bgColor: n.bgColor,
        color: n.color,
        iconColor: n.iconColor,
        isActive: n.id === activeNodeId,
        onClick: () => onNodeClick(n.id),
        onHandleClick: (e, handleId, handleType) => onHandleClickRef.current?.(e, n.id, handleId, handleType),
        onDelete: () => {
          if (onNodesChangeCallback) {
            onNodesChangeCallback([{ type: 'remove', id: n.id }]);
          }
        }
      }
    }));

    // Use initialEdges if provided, otherwise empty
    let rfEdges = initialEdges.map(e => ({
      ...e,
      type: 'deletable',
      animated: true,
      style: { stroke: '#818cf8', strokeWidth: 2, filter: 'drop-shadow(0px 4px 6px rgba(99, 102, 241, 0.3))' },
      data: {
        ...e.data,
        onDelete: () => onEdgeDeleteRef.current?.(e.id)
      }
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [
    initialNodes,
    initialEdges
  ]);

  // Sync active node visual state, title, and description from props
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const matchingInitialNode = initialNodeById.get(node.id);
        if (!matchingInitialNode) return node;
        return {
          ...node,
          data: {
            ...node.data,
            title: matchingInitialNode.title,
            description: matchingInitialNode.description,
            schema: matchingInitialNode.schema,
            icon: matchingInitialNode.icon,
            bgColor: matchingInitialNode.bgColor,
            color: matchingInitialNode.color,
            iconColor: matchingInitialNode.iconColor,
            isActive: node.id === activeNodeId,
          },
        };
      })
    );
  }, [initialNodeById, activeNodeId, setNodes]);

  const triggerAutoLayout = useCallback(() => {
    const laidOutNodes = calculateAutoLayout(nodes, edges);

    // 5. Update React Flow state
    setNodes(laidOutNodes);

    // 6. Notify the parent so the layout is persisted with the workflow draft.
    const changes = laidOutNodes.map(node => ({
      id: node.id,
      type: 'position',
      position: node.position
    }));
    onNodesChangeCallback?.(changes);
  }, [nodes, edges, setNodes, onNodesChangeCallback]);

  const makeEdge = useCallback((params) => {
    const newEdge = { ...params, id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'deletable', animated: true, style: { stroke: '#818cf8', strokeWidth: 2, filter: 'drop-shadow(0px 4px 6px rgba(99, 102, 241, 0.3))' } };
    setEdges((eds) => {
      const updatedEdges = addEdge(newEdge, eds);
      onEdgesChangeCallback?.(updatedEdges);
      return updatedEdges;
    });
  }, [setEdges, onEdgesChangeCallback]);

  // Keep refs stable so node data callbacks don't change
  useEffect(() => { makeEdgeRef.current = makeEdge; }, [makeEdge]);

  const onConnect = useCallback((params) => makeEdge(params), [makeEdge]);

  // Click-to-connect: called when a handle is clicked
  const onHandleClick = useCallback((e, nodeId, handleId, handleType) => {
    e.stopPropagation();
    const current = pendingConnectionRef.current;
    if (!current) {
      // Start a new connection from a source handle
      if (handleType === 'source') {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const next = { nodeId, handleId, handleType: 'source', screenX: cx, screenY: cy };
        pendingConnectionRef.current = next;
        setPendingConnection(next);
        setCursorPos({ x: cx, y: cy });
      }
    } else {
      // Complete the connection if clicking a target handle on a different node
      if (handleType === 'target' && current.nodeId !== nodeId) {
        makeEdgeRef.current?.({
          source: current.nodeId,
          sourceHandle: current.handleId || null,
          target: nodeId,
          targetHandle: handleId || null,
        });
      }
      pendingConnectionRef.current = null;
      setPendingConnection(null);
    }
  }, []);

  // Keep onHandleClick ref stable
  useEffect(() => { onHandleClickRef.current = onHandleClick; }, [onHandleClick]);

  // Cancel pending connection on canvas click or Escape key
  const onPaneClick = useCallback(() => {
    pendingConnectionRef.current = null;
    setPendingConnection(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const isEditable = target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.tagName === 'SELECT'
        || target?.isContentEditable;
      if (isEditable) return;

      if (e.key === 'Escape') {
        pendingConnectionRef.current = null;
        setPendingConnection(null);
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'c' && selectedSourceNode()) {
        e.preventDefault();
        copySelectedNode();
      } else if (key === 'v' && hasCopiedNode) {
        e.preventDefault();
        pasteCopiedNode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelectedNode, hasCopiedNode, pasteCopiedNode, pasteOffsetRef, selectedSourceNode]);

  // Track cursor position for the ghost line
  useEffect(() => {
    if (!pendingConnection) return;
    const onMouseMove = (e) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [pendingConnection]);

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
          className: 'opacity-60 pointer-events-none drop-shadow-2xl z-50 ring-2 ring-indigo-500/50 rounded-2xl'
        }
      ];
    }
    return nodes;
  }, [nodes, draggedNode, dragPosition]);

  return (
    <div className="flex-1 w-full h-full relative bg-[#f8fafc] overflow-hidden border border-slate-200 rounded-2xl shadow-inner min-h-[400px]" ref={reactFlowWrapper}>
      {/* Ghost line overlay for click-to-connect */}
      {pendingConnection && (
        <svg
          className="pointer-events-none fixed inset-0 z-[9999]"
          style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}
        >
          <defs>
            <filter id="click-connect-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feFlood floodColor="#818cf8" floodOpacity="0.7" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Glow blur behind */}
          <line
            x1={pendingConnection.screenX}
            y1={pendingConnection.screenY}
            x2={cursorPos.x}
            y2={cursorPos.y}
            stroke="#818cf8"
            strokeWidth={8}
            strokeOpacity={0.25}
            strokeLinecap="round"
            style={{ filter: 'blur(5px)' }}
          />
          {/* Main dashed line */}
          <line
            x1={pendingConnection.screenX}
            y1={pendingConnection.screenY}
            x2={cursorPos.x}
            y2={cursorPos.y}
            stroke="#818cf8"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray="6 4"
          />
          {/* Source dot */}
          <circle cx={pendingConnection.screenX} cy={pendingConnection.screenY} r={5} fill="#818cf8" stroke="white" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 4px rgba(129,140,248,0.9))' }} />
          {/* Cursor dot */}
          <circle cx={cursorPos.x} cy={cursorPos.y} r={5} fill="#818cf8" stroke="white" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 6px rgba(129,140,248,0.9))' }} />
        </svg>
      )}

      {/* Floating Auto Layout Button Overlay */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-md backdrop-blur">
          <button
            type="button"
            onClick={copySelectedNode}
            disabled={!selectedSourceNode()}
            className="rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-700 transition-all hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="Copy selected node (Ctrl/Cmd+C)"
          >
            Copy node
          </button>
          <button
            type="button"
            onClick={pasteCopiedNode}
            disabled={!hasCopiedNode}
            className="rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-700 transition-all hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="Paste copied node (Ctrl/Cmd+V)"
          >
            Paste node
          </button>
          <button
            type="button"
            onClick={triggerAutoLayout}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-700 transition-all hover:bg-indigo-50 hover:text-indigo-600"
            title="Auto layout workflow"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="stroke-current">
              <path d="M21 16V8a2 2 0 0 0-2-2h-5M3 8v8a2 2 0 0 0 2 2h5"></path>
              <polyline points="10 12 14 12 14 6"></polyline>
              <polyline points="14 12 10 12 10 18"></polyline>
            </svg>
            Auto Layout
          </button>
        </div>
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
        onEdgesChange={(changes) => {
          onEdgesChange(changes);

          // Notify parent if edges were removed
          const removed = changes.filter(c => c.type === 'remove');
          if (removed.length > 0) {
            // We use a timeout to let setEdges apply first, then callback with current edges
            setTimeout(() => {
              setEdges(currentEdges => {
                onEdgesChangeCallback?.(currentEdges);
                return currentEdges;
              });
            }, 0);
          }
        }}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={CustomConnectionLine}
        onPaneClick={onPaneClick}
        fitView
        className="bg-slate-50"
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap zoomable pannable nodeClassName={(n) => {
          if (n.type === 'trigger') return 'bg-indigo-500';
          if (n.type === 'ai') return 'bg-indigo-500';
          return 'bg-indigo-500';
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
