/**
 * NodeInspector — edit a selected factor's label and note, or delete it.
 *
 * Shows above the StructurePanel in the marginalia column when a node is selected.
 * When node is null, renders a faint "select a factor" hint.
 */

import { useState, useEffect } from "react";
import type { DependencyNode } from "@decision-forge/core";
import { ROLE_OPTIONS, type NodeRole } from "./roles";

interface NodeInspectorProps {
  node: DependencyNode | null;
  onUpdate: (id: string, patch: { label?: string; note?: string; role?: NodeRole }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Optional: called when the user clicks "→ Simulate in § I" (uncertainty nodes only). */
  onPushToMC?: (id: string) => void;
}

export function NodeInspector({ node, onUpdate, onDelete, onClose, onPushToMC }: NodeInspectorProps) {
  // Local draft state so edits don't fire on every keystroke — commit on blur.
  const [labelDraft, setLabelDraft] = useState(node?.label ?? "");
  const [noteDraft, setNoteDraft] = useState(node?.note ?? "");

  // Sync drafts when the selected node changes.
  useEffect(() => {
    setLabelDraft(node?.label ?? "");
    setNoteDraft(node?.note ?? "");
  }, [node?.id, node?.label, node?.note]);

  if (!node) {
    return (
      <p
        className="meta italic"
        style={{ color: "var(--ink-faint)", fontSize: "11px", marginBottom: "16px" }}
      >
        Select a factor to edit.
      </p>
    );
  }

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      // Revert to the saved label — don't allow empty.
      setLabelDraft(node!.label);
      return;
    }
    if (trimmed !== node!.label) {
      onUpdate(node!.id, { label: trimmed });
    }
  }

  function commitNote() {
    if (noteDraft !== (node!.note ?? "")) {
      onUpdate(node!.id, { note: noteDraft });
    }
  }

  const shortId = node.id.slice(0, 8);

  return (
    <div
      style={{
        marginBottom: "20px",
        paddingBottom: "16px",
        borderBottom: "1px solid var(--paper-rule)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span
          className="eyebrow"
          style={{ fontSize: "10px", color: "var(--sec-depmap)" }}
        >
          Factor
        </span>
        <button
          aria-label="Close inspector"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ink-dim)",
            fontSize: "14px",
            lineHeight: 1,
            padding: "0 2px",
          }}
          title="Deselect"
        >
          ×
        </button>
      </div>

      {/* Node id — read-only, monospace */}
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10px",
          color: "var(--ink-faint)",
          marginBottom: "10px",
          letterSpacing: "0.04em",
        }}
        title={node.id}
      >
        {shortId}…
      </div>

      {/* Label input */}
      <div style={{ marginBottom: "8px" }}>
        <label
          htmlFor="ni-label"
          style={{
            display: "block",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--ink-dim)",
            marginBottom: "3px",
          }}
        >
          Label
        </label>
        <input
          id="ni-label"
          aria-label="Label"
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          style={{
            width: "100%",
            background: "var(--paper-raised)",
            color: "var(--ink)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "3px",
            padding: "4px 6px",
            fontSize: "12px",
            fontFamily: "var(--font-display, inherit)",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Note textarea */}
      <div style={{ marginBottom: "12px" }}>
        <label
          htmlFor="ni-note"
          style={{
            display: "block",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--ink-dim)",
            marginBottom: "3px",
          }}
        >
          Note
        </label>
        <textarea
          id="ni-note"
          aria-label="Note"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitNote}
          rows={3}
          placeholder="Optional context…"
          style={{
            width: "100%",
            background: "var(--paper-raised)",
            color: "var(--ink)",
            border: "1px solid var(--paper-rule)",
            borderRadius: "3px",
            padding: "4px 6px",
            fontSize: "11px",
            fontFamily: "var(--font-display, inherit)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Role radio row */}
      <div style={{ marginBottom: "12px" }}>
        <div
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--ink-dim)",
            marginBottom: "5px",
          }}
        >
          Role
        </div>
        <div
          role="radiogroup"
          aria-label="Node role"
          style={{ display: "flex", flexDirection: "column", gap: "4px" }}
        >
          {ROLE_OPTIONS.map((opt) => {
            const checked = (node.role ?? "factor") === opt.value;
            return (
              <label
                key={opt.value}
                title={opt.description}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "6px",
                  cursor: "pointer",
                  fontFamily: "var(--font-display, inherit)",
                }}
              >
                <input
                  type="radio"
                  name={`role-${node.id}`}
                  value={opt.value}
                  checked={checked}
                  aria-label={opt.label}
                  onChange={() => onUpdate(node.id, { role: opt.value })}
                  style={{ accentColor: "var(--sec-depmap, #8b7cf8)", marginTop: "2px", flexShrink: 0 }}
                />
                <span>
                  <span style={{ fontSize: "12px", color: "var(--ink)" }}>{opt.label}</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      color: "var(--ink-faint)",
                      lineHeight: 1.4,
                      marginTop: "1px",
                    }}
                  >
                    {opt.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Stored fields caption */}
      <p
        style={{
          fontSize: "9px",
          color: "var(--ink-faint)",
          marginBottom: "10px",
          lineHeight: 1.4,
        }}
      >
        Stores: id · label · note · role · position
      </p>

      {/* → Simulate in § I — shown only for uncertainty nodes */}
      {node.role === "uncertainty" && onPushToMC && (
        <button
          aria-label="→ Simulate in § I"
          onClick={() => onPushToMC(node.id)}
          style={{
            width: "100%",
            background: "none",
            border: "1px solid var(--sec-mc, #6bbf8e)",
            borderRadius: "3px",
            color: "var(--sec-mc, #6bbf8e)",
            fontSize: "11px",
            padding: "5px 8px",
            cursor: "pointer",
            fontFamily: "var(--font-display, inherit)",
            letterSpacing: "0.04em",
            marginBottom: "6px",
          }}
        >
          → Simulate in § I
        </button>
      )}

      {/* Delete button */}
      <button
        aria-label="Delete factor"
        onClick={() => onDelete(node.id)}
        style={{
          width: "100%",
          background: "none",
          border: "1px solid var(--sec-nego, #e8582b)",
          borderRadius: "3px",
          color: "var(--sec-nego, #e8582b)",
          fontSize: "11px",
          padding: "5px 8px",
          cursor: "pointer",
          fontFamily: "var(--font-display, inherit)",
          letterSpacing: "0.04em",
        }}
      >
        Delete factor
      </button>
    </div>
  );
}
