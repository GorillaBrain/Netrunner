import React from 'react';
import { getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import { useNetworkStore } from '../store/useNetworkStore.js';

export default function NetworkCableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) {
  const activeTool = useNetworkStore((s) => s.activeTool);
  const deleteLink = useNetworkStore((s) => s.deleteLink);
  const toggleLinkStatus = useNetworkStore((s) => s.toggleLinkStatus);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
  });

  const isActiveLink = Boolean(data?.isActiveHop);
  const isDown = Boolean(data?.isDown);
  const isDashed = Boolean(data?.isDashed);

  const strokeColor = isDown
    ? '#ef4444'
    : isActiveLink
    ? '#3b82f6'
    : '#333947';

  const dotColor = isDown ? '#ef4444' : '#22c55e';

  // Compute slightly inset points along start/end for the green port LED dots
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const startDotX = sourceX + ux * 14;
  const startDotY = sourceY + uy * 14;
  const endDotX = targetX - ux * 14;
  const endDotY = targetY - uy * 14;

  const handleEdgeClick = (e) => {
    e.stopPropagation();
    if (activeTool === 'delete') {
      deleteLink(id);
    } else {
      toggleLinkStatus(id);
    }
  };

  return (
    <>
      {/* Outer glow when a packet traverses this link */}
      {isActiveLink && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(59, 130, 246, 0.35)"
          strokeWidth={8}
          className="nr-edge-glow"
        />
      )}

      {/* Main cable path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isActiveLink ? 2.6 : 1.7}
        strokeDasharray={isDashed || isDown ? '5 5' : undefined}
        className="nr-edge-path"
        onClick={handleEdgeClick}
        style={{ cursor: 'pointer' }}
      />

      {/* Animated traveling light pulse along active link */}
      {isActiveLink && (
        <circle r="4.5" fill="#93c5fd" filter="drop-shadow(0 0 6px #60a5fa)">
          <animateMotion dur="0.85s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* Source & Target Port Status LED Dots */}
      <circle
        cx={startDotX}
        cy={startDotY}
        r={3.8}
        fill={dotColor}
        stroke="#0d0f14"
        strokeWidth={1.2}
      />
      <circle
        cx={endDotX}
        cy={endDotY}
        r={3.8}
        fill={dotColor}
        stroke="#0d0f14"
        strokeWidth={1.2}
      />

      {/* Optional subtle port badge when active or down */}
      {(isActiveLink || isDown) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`nr-edge-pill ${isDown ? 'is-down' : 'is-active'}`}
            onClick={handleEdgeClick}
            title="Click to toggle link UP/DOWN (or delete when Delete tool is active)"
          >
            {isDown
              ? 'LINK DOWN'
              : `${data?.sourcePort || 'eth0'} ⇄ ${data?.targetPort || 'eth0'}`}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
