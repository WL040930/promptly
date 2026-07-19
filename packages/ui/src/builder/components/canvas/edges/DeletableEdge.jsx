import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';

export default function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) {
  const { setEdges } = useReactFlow();
  const [isLineHovered, setIsLineHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeClick = (evt, id) => {
    evt.stopPropagation();
    setEdges((edges) => edges.filter((e) => e.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Invisible wider interaction path for detecting hover near the connection line */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsLineHovered(true)}
        onMouseLeave={() => setIsLineHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan group"
        >
          <button
            className={`w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:border-red-500 hover:bg-red-500 hover:shadow-md hover:shadow-red-500/20 shadow-sm cursor-pointer transition-all duration-150 active:scale-90 ${
              isLineHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
            }`}
            onClick={(event) => onEdgeClick(event, id)}
            title="Delete connection"
          >
            <span className="text-[16px] font-semibold leading-none select-none" style={{ display: 'block', transform: 'translateY(-1px)' }}>
              ×
            </span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
