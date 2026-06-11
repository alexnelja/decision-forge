/**
 * FloatingConnectionLine — custom connection line drawn during edge drags.
 *
 * When the user drags from a node border to create a new edge, the default
 * react-flow connection line starts from the handle anchor (which, with our
 * perimeter handles, can be off-centre or at a fixed side). This component
 * replaces it with a line from the source node's nearest border toward the
 * cursor, matching the floating-edge visual.
 */

import { getBezierPath } from "reactflow";
import type { ConnectionLineComponentProps } from "reactflow";

export function FloatingConnectionLine({
  toX,
  toY,
  fromNode,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  if (!fromNode) return null;

  const w = fromNode.width ?? 100;
  const h = fromNode.height ?? 40;
  const pos = (fromNode as any).positionAbsolute ?? fromNode.position;

  const fromX = pos.x + w / 2;
  const fromY = pos.y + h / 2;

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
      <path
        fill="none"
        stroke="var(--ink-dim)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        d={edgePath}
      />
    </g>
  );
}
