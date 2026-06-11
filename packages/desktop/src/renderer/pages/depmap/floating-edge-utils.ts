/**
 * floating-edge-utils.ts — geometry helpers for floating edges.
 *
 * Implements the "Floating Edges" pattern from the react-flow v11 official
 * example: instead of routing bezier edges between fixed perimeter handles,
 * we compute the intersection of the source→target line with each node's
 * rectangle border at render time, producing short straight-ish paths between
 * nearest faces (e.g. bottom→top for a vertical chain).
 *
 * Adapted from: https://reactflow.dev/examples/edges/floating-edges
 */

import { Position } from "reactflow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeLike {
  positionAbsolute: { x: number; y: number };
  width: number | null | undefined;
  height: number | null | undefined;
}

export interface EdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

// ---------------------------------------------------------------------------
// getNodeCenter — centre of a node in absolute flow coordinates
// ---------------------------------------------------------------------------

function getNodeCenter(node: NodeLike): { x: number; y: number } {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  return {
    x: node.positionAbsolute.x + w / 2,
    y: node.positionAbsolute.y + h / 2,
  };
}

// ---------------------------------------------------------------------------
// getNodeIntersection — find where the line between two node centres
// intersects the BORDER of the source node's bounding rectangle.
//
// Algorithm (from the official floating edges example):
//   1. Compute direction vector from source centre to target centre.
//   2. Parameterise the line and find t for each of the 4 border planes.
//   3. Return the intersection point that lies on an actual border segment.
// ---------------------------------------------------------------------------

export function getNodeIntersection(
  intersectionNode: NodeLike,
  targetNode: NodeLike,
): { x: number; y: number } {
  const w = (intersectionNode.width ?? 0) / 2;
  const h = (intersectionNode.height ?? 0) / 2;

  const x2 = intersectionNode.positionAbsolute.x + w;
  const y2 = intersectionNode.positionAbsolute.y + h;

  const { x: x1, y: y1 } = getNodeCenter(targetNode);

  // direction from source centre to target centre
  const dx = x1 - x2;
  const dy = y1 - y2;

  // Handle degenerate case (same position)
  if (dx === 0 && dy === 0) {
    return { x: x2 + w, y: y2 }; // default to right border
  }

  // Compute t for each of the 4 border planes and find valid intersections
  const slope = dy / dx;

  // Candidate intersections with the 4 borders
  const x: number[] = [];
  const y: number[] = [];

  // Right border: ix = x2+w, iy = y2 + slope*(x2+w - x2)
  const ixR = x2 + w;
  const iyR = y2 + slope * w;
  if (Math.abs(iyR - y2) <= h) {
    x.push(ixR);
    y.push(iyR);
  }

  // Left border: ix = x2-w, iy = y2 + slope*(x2-w - x2)
  const ixL = x2 - w;
  const iyL = y2 + slope * (-w);
  if (Math.abs(iyL - y2) <= h) {
    x.push(ixL);
    y.push(iyL);
  }

  // Bottom border: iy = y2+h, ix = x2 + (y2+h - y2)/slope
  if (slope !== 0) {
    const iyB = y2 + h;
    const ixB = x2 + h / slope;
    if (Math.abs(ixB - x2) <= w) {
      x.push(ixB);
      y.push(iyB);
    }

    // Top border: iy = y2-h, ix = x2 + (y2-h - y2)/slope
    const iyT = y2 - h;
    const ixT = x2 + (-h) / slope;
    if (Math.abs(ixT - x2) <= w) {
      x.push(ixT);
      y.push(iyT);
    }
  } else {
    // Horizontal line: top and bottom borders not hit, left/right already handled
    // Also handle purely horizontal — add explicit top/bottom if slope is 0
    const iyB = y2 + h;
    const ixB = x2;
    if (Math.abs(ixB - x2) <= w) {
      x.push(ixB);
      y.push(iyB);
    }
    const iyT = y2 - h;
    const ixT = x2;
    if (Math.abs(ixT - x2) <= w) {
      x.push(ixT);
      y.push(iyT);
    }
  }

  // Pick the candidate that is CLOSEST to the target centre
  // (the one on the side facing the target)
  let bestX = x2 + w;
  let bestY = y2;
  let bestDist = Infinity;
  for (let i = 0; i < x.length; i++) {
    const dist = Math.hypot(x[i]! - x1, y[i]! - y1);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = x[i]!;
      bestY = y[i]!;
    }
  }

  return { x: bestX, y: bestY };
}

// ---------------------------------------------------------------------------
// getEdgePosition — map an intersection point to a Position enum value.
// Compares the point to the node's 4 border midpoints; returns the closest.
// ---------------------------------------------------------------------------

export function getEdgePosition(
  node: NodeLike,
  intersectionPoint: { x: number; y: number },
): Position {
  const nx = node.positionAbsolute.x;
  const ny = node.positionAbsolute.y;
  const nw = node.width ?? 0;
  const nh = node.height ?? 0;

  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  // Distance to each border midpoint
  const positions: [Position, number][] = [
    [Position.Left,   Math.hypot(px - nx,          py - (ny + nh / 2))],
    [Position.Right,  Math.hypot(px - (nx + nw),   py - (ny + nh / 2))],
    [Position.Top,    Math.hypot(px - (nx + nw / 2), py - ny)],
    [Position.Bottom, Math.hypot(px - (nx + nw / 2), py - (ny + nh))],
  ];

  // Sort by distance, return closest
  positions.sort((a, b) => a[1] - b[1]);
  return positions[0]![0];
}

// ---------------------------------------------------------------------------
// getEdgeParams — compute both endpoint positions and their Position hints.
// Call with live node objects from the react-flow store.
// ---------------------------------------------------------------------------

export function getEdgeParams(
  source: NodeLike,
  target: NodeLike,
): EdgeParams {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
  const targetPos = getEdgePosition(target, targetIntersectionPoint);

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  };
}
