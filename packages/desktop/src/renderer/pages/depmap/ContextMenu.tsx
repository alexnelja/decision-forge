/**
 * ContextMenu — fixed-position right-click menus for § IV Dependency Map.
 *
 * Renders two variants driven by the `type` discriminant:
 *   "node"  — Rename · Duplicate · Role ▸ · Delete
 *   "pane"  — Add node here · Tidy
 *
 * Closes on click-away (document pointerdown) or Escape.
 *
 * Extension point for Task 6: when `type === "edge"`, add edge-editing items.
 */

import { useEffect, useRef } from "react";

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

export type ContextMenuProps = NodeContextMenuProps | PaneContextMenuProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContextMenu(props: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: props.y,
        left: props.x,
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
      {/* Extension point: add `props.type === "edge"` branch here in Task 6 */}
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
