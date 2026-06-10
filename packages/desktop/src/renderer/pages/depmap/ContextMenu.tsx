/**
 * ContextMenu — fixed-position right-click menus for § IV Dependency Map.
 *
 * Renders three variants driven by the `type` discriminant:
 *   "node"  — Rename · Duplicate · Role ▸ · Delete
 *   "pane"  — Add node here · Tidy
 *   "edge"  — Flip direction · Sign ▸ · Confidence ▸ · Delete
 *
 * Accessibility: role="menu" / role="menuitem"; focus moves to the first item
 * on open; ArrowUp/ArrowDown cycle through items; Enter activates the focused
 * item; Escape or click-away closes. Position is clamped to the viewport after
 * measuring the rendered menu.
 */

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { DependencyEdge } from "@decision-forge/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeContextMenuProps {
  type: "node";
  x: number;
  y: number;
  nodeId: string;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSetRole: (id: string, role: "objective" | "lever" | "uncertainty" | "factor") => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export interface PaneContextMenuProps {
  type: "pane";
  x: number;
  y: number;
  flowX: number;
  flowY: number;
  onAddNodeAt: (pos: { x: number; y: number }) => void;
  onTidy: () => void;
  onClose: () => void;
}

export interface EdgeContextMenuProps {
  type: "edge";
  x: number;
  y: number;
  edgeId: string;
  sign: DependencyEdge["sign"];
  confidence: DependencyEdge["confidence"];
  onFlipEdge: (id: string) => void;
  onCycleEdgeSign: (id: string) => void;
  onToggleEdgeConfidence: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onClose: () => void;
}

export type ContextMenuProps = NodeContextMenuProps | PaneContextMenuProps | EdgeContextMenuProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContextMenu(props: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.x, y: props.y });

  // Clamp the menu into the viewport once we can measure its rendered size.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: Math.min(props.x, window.innerWidth - rect.width - 8),
      y: Math.min(props.y, window.innerHeight - rect.height - 8),
    });
  }, [props.x, props.y]);

  // Move focus to the first item on open (keyboard accessibility).
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  // Close on click-away or Escape
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [props]);

  // ArrowUp/ArrowDown cycle through items; Enter activates the focused item.
  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]!.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]!.focus();
    } else if (e.key === "Enter") {
      e.preventDefault(); // suppress native button Enter→click (would double-fire)
      (document.activeElement as HTMLElement | null)?.click();
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: 1000,
        background: "var(--paper-raised)",
        border: "1px solid var(--paper-rule)",
        borderRadius: "4px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        minWidth: "160px",
        padding: "4px 0",
        fontSize: "13px",
        fontFamily: "var(--font-display, inherit)",
      }}
    >
      {props.type === "node" && (
        <NodeMenuItems {...props} />
      )}
      {props.type === "pane" && (
        <PaneMenuItems {...props} />
      )}
      {props.type === "edge" && (
        <EdgeMenuItems {...props} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node menu items
// ---------------------------------------------------------------------------

function NodeMenuItems(props: NodeContextMenuProps) {
  const { nodeId, onRename, onDuplicate, onSetRole, onDelete, onClose } = props;

  return (
    <>
      <MenuItem
        label="Rename"
        onClick={() => { onRename(nodeId); onClose(); }}
      />
      <MenuItem
        label="Duplicate"
        onClick={() => { onDuplicate(nodeId); onClose(); }}
      />
      <MenuDivider />
      {/* Role submenu — inline expansion for simplicity */}
      <MenuLabel label="Role" />
      <MenuItem
        label="Factor (default)"
        onClick={() => { onSetRole(nodeId, "factor"); onClose(); }}
        indent
      />
      <MenuItem
        label="◎ Objective"
        onClick={() => { onSetRole(nodeId, "objective"); onClose(); }}
        indent
      />
      <MenuItem
        label="◆ Lever"
        onClick={() => { onSetRole(nodeId, "lever"); onClose(); }}
        indent
      />
      <MenuItem
        label="? Uncertainty"
        onClick={() => { onSetRole(nodeId, "uncertainty"); onClose(); }}
        indent
      />
      <MenuDivider />
      <MenuItem
        label="Delete"
        onClick={() => { onDelete(nodeId); onClose(); }}
        danger
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane menu items
// ---------------------------------------------------------------------------

function PaneMenuItems(props: PaneContextMenuProps) {
  const { flowX, flowY, onAddNodeAt, onTidy, onClose } = props;

  return (
    <>
      <MenuItem
        label="Add node here"
        onClick={() => { onAddNodeAt({ x: flowX, y: flowY }); onClose(); }}
      />
      <MenuItem
        label="Tidy"
        onClick={() => { onTidy(); onClose(); }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Edge menu items (Task 6 extension point)
// ---------------------------------------------------------------------------

function EdgeMenuItems(props: EdgeContextMenuProps) {
  const { edgeId, sign, confidence, onFlipEdge, onCycleEdgeSign, onToggleEdgeConfidence, onDeleteEdge, onClose } = props;

  // Sign display labels
  const signLabel = sign === "+" ? "+ amplifies" : sign === "-" ? "− dampens" : "none";
  const nextSignLabel = sign === "+" ? "→ −" : sign === "-" ? "→ none" : "→ +";
  const confLabel = confidence === "assumption" ? "assumption (dashed)" : "known (solid)";

  return (
    <>
      <MenuItem
        label="Flip direction"
        onClick={() => { onFlipEdge(edgeId); onClose(); }}
      />
      <MenuDivider />
      <MenuLabel label="Sign" />
      <MenuItem
        label={`Current: ${signLabel} ${nextSignLabel}`}
        onClick={() => { onCycleEdgeSign(edgeId); onClose(); }}
        indent
      />
      <MenuDivider />
      <MenuLabel label="Confidence" />
      <MenuItem
        label={`Current: ${confLabel}`}
        onClick={() => { onToggleEdgeConfidence(edgeId); onClose(); }}
        indent
      />
      <MenuDivider />
      <MenuItem
        label="Delete"
        onClick={() => { onDeleteEdge(edgeId); onClose(); }}
        danger
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared menu primitives
// ---------------------------------------------------------------------------

function MenuItem({
  label,
  onClick,
  indent = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  indent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: `5px ${indent ? "24px" : "12px"}`,
        fontSize: "13px",
        fontFamily: "var(--font-display, inherit)",
        color: danger ? "var(--sec-nego, #e8582b)" : "var(--ink)",
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-rule)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return (
    <div
      style={{
        height: "1px",
        background: "var(--paper-rule)",
        margin: "4px 0",
      }}
    />
  );
}

function MenuLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--ink-faint)",
        padding: "3px 12px 1px",
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}
