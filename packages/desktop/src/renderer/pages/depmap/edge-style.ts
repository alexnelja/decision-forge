/**
 * edge-style.ts — pure helper for computing react-flow edge visual properties.
 *
 * Single source of truth for sign/confidence/cycle visual encoding.
 * Used by LayeredView (2D) and will be reused by ConstellationView (3D, Task 8).
 *
 * Visual encoding (spec §1.3):
 *   sign "+"       → green stroke  (var(--plus))
 *   sign "-"       → red stroke    (var(--minus))
 *   sign absent    → neutral dim   (var(--ink-dim))
 *   confidence "assumption" → dashed stroke (strokeDasharray "6 4")
 *   isCycle        → wider stroke  (2.5px) — hue stays free for polarity sign
 *   dimmed         → reduced opacity (0.1, matches existing node dim pattern)
 */

import type { DependencyEdge } from "@decision-forge/core";

// ---------------------------------------------------------------------------
// Raw hex values for consumers that cannot resolve CSS custom properties —
// three.js materials in Task 8's ConstellationView take real colours, not
// `var(--plus)` strings. Keep in sync with the tokens in index.css
// (--plus aliases --sec-forecast, --minus aliases --sec-nego).
// ---------------------------------------------------------------------------

export const PLUS_HEX = "#6fa88a";
export const MINUS_HEX = "#e8582b";
export const NEUTRAL_HEX = "#8a8278"; // --ink-dim

// ---------------------------------------------------------------------------
// Human-readable labels — single source for EdgeToolbar + ContextMenu copy.
// ---------------------------------------------------------------------------

/** "+ amplifies" | "− dampens" | "none" */
export function describeSign(sign: DependencyEdge["sign"]): string {
  return sign === "+" ? "+ amplifies" : sign === "-" ? "− dampens" : "none";
}

/** "assumption (dashed)" | "known (solid)" — absent confidence ≡ known */
export function describeConfidence(
  confidence: DependencyEdge["confidence"]
): string {
  return confidence === "assumption" ? "assumption (dashed)" : "known (solid)";
}

export interface EdgeVisualResult {
  /** CSS colour string — matches the sign polarity or neutral */
  stroke: string;
  /** Dash pattern — only present for assumption confidence */
  strokeDasharray?: string;
  /** Stroke width — wider for cycle edges */
  strokeWidth: number;
  /** Opacity — 0.1 when dimmed, 1 otherwise */
  opacity: number;
}

export interface EdgeVisualOpts {
  /** True when the edge is part of a detected feedback cycle */
  isCycle: boolean;
  /** True when the edge should be visually de-emphasised (selection/hover context) */
  dimmed: boolean;
}

/**
 * Compute the react-flow edge style properties for a given edge + display state.
 * Pure function — no side effects, no React dependencies.
 */
export function edgeVisual(
  edge: Pick<DependencyEdge, "sign" | "confidence">,
  opts: EdgeVisualOpts
): EdgeVisualResult {
  // Stroke colour: determined by sign polarity; cycle does NOT change hue.
  let stroke: string;
  if (edge.sign === "+") {
    stroke = "var(--plus)";
  } else if (edge.sign === "-") {
    stroke = "var(--minus)";
  } else {
    stroke = "var(--ink-dim)";
  }

  // Dash pattern: only for assumption confidence.
  const strokeDasharray =
    edge.confidence === "assumption" ? "6 4" : undefined;

  // Width: cycle edges are wider (2.5px) to encode cycle membership via geometry
  // rather than hue — this leaves hue free for sign polarity.
  const strokeWidth = opts.isCycle ? 2.5 : 1.5;

  // Opacity: dimmed edges recede (matches the 0.1 from the existing style effect).
  const opacity = opts.dimmed ? 0.1 : 1;

  return { stroke, strokeDasharray, strokeWidth, opacity };
}
