/**
 * FactorNode — custom react-flow node for § IV Dependency Map (Task 5).
 *
 * Visual pattern: body = drag/move; invisible 8px border ring = connect source.
 * Easy Connect: 4 source handles (Top/Right/Bottom/Left) styled as one perimeter
 * ring + 1 large target handle covering the full node so any drop connects.
 *
 * Data contract (passed via react-flow node.data):
 *   label:           string
 *   role?:           "objective" | "lever" | "uncertainty" | "factor"
 *   renaming?:       boolean   — show inline input instead of label
 *   // visual flag props (set by LayeredView style effect)
 *   isSelected?:     boolean
 *   isCycle?:        boolean
 *   isRoot?:         boolean
 *   isLeaf?:         boolean
 *   dimOpacity?:     number    — 1 (full) | 0.2 (faded) | 0.25 (hover-fade)
 *   isDownstream?:   boolean
 *   isUpstream?:     boolean
 *   // callbacks
 *   onRename:        (id: string, label: string) => void
 *   onCancelRename:  (id: string) => void
 *   onDuplicate:     (id: string) => void
 *   onDelete:        (id: string) => void
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactorNodeData {
  label: string;
  role?: "objective" | "lever" | "uncertainty" | "factor";
  renaming?: boolean;
  // visual flags
  isSelected?: boolean;
  isCycle?: boolean;
  isRoot?: boolean;
  isLeaf?: boolean;
  dimOpacity?: number;
  isDownstream?: boolean;
  isUpstream?: boolean;
  // callbacks
  onRename: (id: string, label: string) => void;
  onCancelRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Role glyphs
// ---------------------------------------------------------------------------

const GLYPH: Partial<Record<string, string>> = {
  objective: "◎",
  lever: "◆",
  uncertainty: "?",
};

// ---------------------------------------------------------------------------
// FactorNode component
// ---------------------------------------------------------------------------

export function FactorNode({ id, data, selected }: NodeProps<FactorNodeData>) {
  const [hovered, setHovered] = useState(false);
  const [draftLabel, setDraftLabel] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when renaming mode activates or label changes
  useEffect(() => {
    setDraftLabel(data.label);
  }, [data.label, data.renaming]);

  // Auto-focus when entering rename mode
  useEffect(() => {
    if (data.renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [data.renaming]);

  // ── Visual state → styles ─────────────────────────────────────────────────
  const {
    isCycle = false,
    isRoot = false,
    isLeaf = false,
    dimOpacity = 1,
    isDownstream = false,
    isUpstream = false,
  } = data;

  const isSelected = data.isSelected ?? selected;

  let borderColor = "var(--paper-rule)";
  let boxShadow = "none";

  if (isCycle) {
    borderColor = "var(--sec-nego)";
    boxShadow = "0 0 0 1.5px var(--sec-nego)";
  } else if (isSelected) {
    borderColor = "var(--sec-depmap)";
    boxShadow = "0 0 0 2px var(--sec-depmap)";
  } else if (isDownstream) {
    borderColor = "var(--sec-depmap)";
    boxShadow = "0 0 0 1px var(--sec-depmap)";
  } else if (isUpstream) {
    borderColor = "var(--ink-dim)";
  } else if (isRoot) {
    borderColor = "var(--sec-mc)";
    boxShadow = "0 0 0 2px var(--sec-mc)";
  } else if (isLeaf) {
    borderColor = "var(--sec-forecast)";
    boxShadow = "0 0 0 2px var(--sec-forecast)";
  }

  const nodeStyle: React.CSSProperties = {
    position: "relative",
    background: "var(--paper-raised)",
    color: "var(--ink)",
    border: `1px solid ${borderColor}`,
    boxShadow,
    borderRadius: "4px",
    fontSize: "13px",
    fontFamily: "var(--font-display, inherit)",
    padding: "6px 12px",
    opacity: dimOpacity,
    transition: "opacity 0.15s ease, box-shadow 0.15s ease",
    cursor: "default",
    userSelect: "none",
    minWidth: "80px",
  };

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const commitRename = useCallback(() => {
    const trimmed = draftLabel.trim();
    data.onRename(id, trimmed);
  }, [id, draftLabel, data]);

  const cancelRename = useCallback(() => {
    setDraftLabel(data.label);
    data.onCancelRename(id);
  }, [id, data]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation(); // prevent react-flow from capturing Delete/Backspace
      if (e.key === "Enter") {
        commitRename();
      } else if (e.key === "Escape") {
        cancelRename();
      }
    },
    [commitRename, cancelRename]
  );

  const glyph = data.role ? GLYPH[data.role] : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={nodeStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Invisible border ring: 4 source handles covering the perimeter ── */}
      {/* These handles are styled transparent; the cursor change to crosshair
          signals "drag from here to connect". react-flow positions them by
          Position enum; we overlay them with absolute CSS to span the full edge. */}
      <Handle
        type="source"
        position={Position.Top}
        id="src-top"
        style={{
          background: "transparent",
          border: "none",
          width: "calc(100% + 16px)",
          height: "8px",
          top: "-8px",
          left: "-8px",
          borderRadius: 0,
          cursor: "crosshair",
          opacity: 0,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="src-right"
        style={{
          background: "transparent",
          border: "none",
          width: "8px",
          height: "calc(100% + 16px)",
          right: "-8px",
          top: "-8px",
          borderRadius: 0,
          cursor: "crosshair",
          opacity: 0,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="src-bottom"
        style={{
          background: "transparent",
          border: "none",
          width: "calc(100% + 16px)",
          height: "8px",
          bottom: "-8px",
          left: "-8px",
          borderRadius: 0,
          cursor: "crosshair",
          opacity: 0,
        }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="src-left"
        style={{
          background: "transparent",
          border: "none",
          width: "8px",
          height: "calc(100% + 16px)",
          left: "-8px",
          top: "-8px",
          borderRadius: 0,
          cursor: "crosshair",
          opacity: 0,
        }}
      />

      {/* ── Target handle: covers the full node body ── */}
      <Handle
        type="target"
        position={Position.Top}
        id="tgt"
        style={{
          background: "transparent",
          border: "none",
          width: "100%",
          height: "100%",
          top: 0,
          left: 0,
          borderRadius: "4px",
          opacity: 0,
          pointerEvents: "none", // body stays drag-move; target set by react-flow internally
        }}
      />

      {/* ── Hover mini-toolbar ─────────────────────────────────────────────── */}
      {hovered && !data.renaming && (
        <div
          className="nodrag"
          style={{
            position: "absolute",
            top: "-28px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "4px",
            background: "var(--paper-raised)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "4px",
            padding: "2px 4px",
            zIndex: 100,
            whiteSpace: "nowrap",
          }}
        >
          <button
            className="nodrag"
            title="Duplicate node"
            onClick={(e) => {
              e.stopPropagation();
              data.onDuplicate(id);
            }}
            style={miniToolbarBtnStyle}
          >
            ⧉
          </button>
          <button
            className="nodrag"
            title="Delete node"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete(id);
            }}
            style={{
              ...miniToolbarBtnStyle,
              color: "var(--sec-nego, #e8582b)",
            }}
          >
            🗑
          </button>
        </div>
      )}

      {/* ── Node body: label or rename input ──────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          pointerEvents: "none", // let the outer div handle drag
        }}
      >
        {glyph && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--ink-dim)",
              flexShrink: 0,
              pointerEvents: "none",
            }}
          >
            {glyph}
          </span>
        )}

        {data.renaming ? (
          <input
            ref={inputRef}
            className="nodrag nopan"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitRename}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--sec-depmap)",
              outline: "none",
              color: "var(--ink)",
              fontSize: "13px",
              fontFamily: "var(--font-display, inherit)",
              width: "100%",
              minWidth: "60px",
              padding: "0",
              pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={{ pointerEvents: "none" }}>{data.label}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared tiny button style for mini-toolbar
// ---------------------------------------------------------------------------

const miniToolbarBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "13px",
  lineHeight: 1,
  padding: "2px",
  color: "var(--ink-dim)",
  borderRadius: "2px",
};
