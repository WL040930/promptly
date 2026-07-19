import { getBezierPath } from '@xyflow/react';

export default function CustomConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
}) {
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <g>
      <defs>
        <filter id="connection-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#818cf8" floodOpacity="0.6" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke="#818cf8"
        strokeWidth={6}
        strokeOpacity={0.3}
        strokeLinecap="round"
        style={{ filter: 'blur(4px)' }}
      />
      {/* Main line */}
      <path
        d={edgePath}
        fill="none"
        stroke="#818cf8"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="6 3"
        style={{ animation: 'dash 0.5s linear infinite' }}
      />
      {/* Cursor dot */}
      <circle
        cx={toX}
        cy={toY}
        r={5}
        fill="#818cf8"
        stroke="white"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.8))' }}
      />
    </g>
  );
}
