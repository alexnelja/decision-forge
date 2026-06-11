/**
 * FloatingEdge — custom react-flow edge that computes endpoint positions
 * dynamically from node border intersections (the "Floating Edges" pattern
 * from the react-flow v11 official example).
 *
 * Instead of routing bezier paths between fixed perimeter handles (which
 * produces loops and wrong-side landings when the geometry doesn't match
 * handle orientation), FloatingEdge:
 *   1. Reads live node positions + dimensions from the react-flow store.
 *   2. Computes the intersection of the source→target line with each node's
 *      rectangle border (getEdgeParams from floating-edge-utils.ts).
 *   3. Draws a bezier path between those border points with correct Position
 *      hints for the curvature direction.
 *
 * All existing styling (stroke/dash/width/opacity from edgeVisual) is
 * preserved by threading through the edge's style and markerEnd props.
 * EdgeToolbar, context menu, and selectability continue to work because
 * BaseEdge renders the interaction-width invisible hit-area path.
 */

import { useCallback } from "react";
import { useStore, getBezierPath, BaseEdge } from "reactflow";
import type { EdgeProps, ReactFlowState } from "reactflow";
import { getEdgeParams } from "./floating-edge-utils";

// ---------------------------------------------------------------------------
// FloatingEdge component
// ---------------------------------------------------------------------------

export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
  // Selector functions must be stable (not defined inline) to avoid
  // re-renders on every store change.  Use separate selectors per node.
  const sourceNode = useStore(
    useCallback(
      (s: ReactFlowState) => s.nodeInternals.get(source),
      [source]
    )
  );
  const targetNode = useStore(
    useCallback(
      (s: ReactFlowState) => s.nodeInternals.get(target),
      [target]
    )
  );

  if (!sourceNode || !targetNode) return null;

  // Provide fallback dimensions if react-flow hasn't measured yet.
  const src = {
    positionAbsolute: sourceNode.positionAbsolute ?? sourceNode.position,
    width: sourceNode.width ?? 100,
    height: sourceNode.height ?? 40,
  };
  const tgt = {
    positionAbsolute: targetNode.positionAbsolute ?? targetNode.position,
    width: targetNode.width ?? 100,
    height: targetNode.height ?? 40,
  };

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(src, tgt);

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth ?? 20}
    />
  );
}
