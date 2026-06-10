/**
 * EdgeToolbar — floating toolbar that appears when an edge is selected.
 *
 * Positioned at the edge midpoint (computed from the two endpoint node positions
 * and passed in as `x`, `y` in screen coordinates).
 *
 * Buttons (all keyboard-accessible with title + aria-label):
 *   ⇄  flip          — reverse the direction (from ↔ to)
 *   ±  sign cycle    — none → "+" → "-" → none
 *   ▰  confidence   — toggle known ↔ assumption (solid ↔ dashed)
 *   🗑 delete        — remove the edge
 *
 * Closes on Escape.
 */

import { useEffect, useRef } from "react";
import type { DependencyEdge } from "@decision-forge/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EdgeToolbarProps {
  edgeId: string;
  sign: DependencyEdge["sign"];
  confidence: DependencyEdge["confidence"];
  /** Absolute pixel position for the toolbar anchor (edge midpoint) */
  x: number;
  y: number;
  onFlip: (id: string) => void;
  onCycleSign: (id: string) => void;
  onToggleConfidence: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EdgeToolbar({
  edgeId,
  sign,
  confidence,
  x,
  y,
  onFlip,
  onCycleSign,
  onToggleConfidence,
  onDelete,
  onClose,
}: EdgeToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Sign label — show current state
  const signLabel = sign === "+" ? "+" : sign === "-" ? "−" : "±";
  const signTitle = sign === "+" ? "Sign: + (amplifies) — click to cycle" : sign === "-" ? "Sign: − (dampens) — click to cycle" : "Sign: none — click to cycle (+/−)";

  // Confidence label
  const confLabel = confidence === "assumption" ? "▱" : "▰";
  const confTitle = confidence === "assumption" ? "Confidence: assumption (dashed) — click to toggle" : "Confidence: known (solid) — click to toggle";

  return (
    <div
      ref={toolbarRef}
      data-testid="edge-toolbar"
      style={{
        position: "absolute",
        // Centre the toolbar on the midpoint
        left: x,
        top: y,
        transform: "translate(-50%, -150%)",
        zIndex: 200,
        display: "flex",
        gap: "2px",
        alignItems: "center",
        background: "var(--paper-raised)",
        border: "1px solid var(--paper-rule)",
        borderRadius: "4px",
        padding: "3px 5px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        fontSize: "12px",
        fontFamily: "var(--font-display, inherit)",
        pointerEvents: "all",
      }}
    >
      {/* Flip direction */}
      <EdgeToolbarBtn
        title="Flip direction (⇄)"
        ariaLabel="Flip edge direction"
        onClick={() => onFlip(edgeId)}
      >
        ⇄
      </EdgeToolbarBtn>

      {/* Sign cycle */}
      <EdgeToolbarBtn
        title={signTitle}
        ariaLabel="Cycle edge sign"
        onClick={() => onCycleSign(edgeId)}
      >
        {signLabel}
      </EdgeToolbarBtn>

      {/* Confidence toggle */}
      <EdgeToolbarBtn
        title={confTitle}
        ariaLabel="Toggle edge confidence"
        onClick={() => onToggleConfidence(edgeId)}
      >
        {confLabel}
      </EdgeToolbarBtn>

      <div
        style={{
          width: "1px",
          height: "14px",
          background: "var(--paper-rule)",
          margin: "0 1px",
          flexShrink: 0,
        }}
      />

      {/* Delete */}
      <EdgeToolbarBtn
        title="Delete edge"
        ariaLabel="Delete edge"
        onClick={() => onDelete(edgeId)}
        danger
      >
        🗑
      </EdgeToolbarBtn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal button primitive
// ---------------------------------------------------------------------------

function EdgeToolbarBtn({
  title,
  ariaLabel,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "12px",
        padding: "2px 4px",
        borderRadius: "3px",
        color: danger ? "var(--sec-nego, #e8582b)" : "var(--ink-dim)",
        lineHeight: 1,
        fontFamily: "var(--font-display, inherit)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-rule)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      {children}
    </button>
  );
}
