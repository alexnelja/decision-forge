/**
 * ReadoutPanel — renders `decisionReadout(map)` in the marginalia above StructurePanel.
 *
 * Header: "DECISION READOUT" in the established eyebrow style.
 * Three labelled sections: ACT FIRST / RESOLVE NEXT / PLAN AROUND.
 * Rows are <button>s (keyboard accessible, aria-labels).
 *
 * When guidance is present (roles missing):
 *   - Shows the guidance copy.
 *   - Still shows PLAN AROUND if loops are present.
 *   - Hides ACT FIRST / RESOLVE NEXT (both empty in that state).
 * When a section is empty and no guidance, the section is omitted.
 */

import type { DependencyMap, Readout } from "@decision-forge/core";

export interface ReadoutPanelProps {
  map: DependencyMap;
  readout: Readout;
  onSelect: (nodeId: string) => void;
}

// Glyphs for the panel sections and loop types.
const GLYPH_REINFORCING = "⟳";
const GLYPH_BALANCING   = "⇋";

/** Build a human-readable label for a loop entry using node labels from the map. */
function loopLabel(map: DependencyMap, loop: Extract<Readout["planAround"][number], { kind: "loop" }>): string {
  const nodeLabels = loop.nodes
    .map((id) => map.nodes.find((n) => n.id === id)?.label ?? id)
    .join(" · ");
  const glyph = loop.class === "balancing" ? GLYPH_BALANCING : GLYPH_REINFORCING;
  const valenceStr = loop.valence ? ` (${loop.valence})` : "";
  return `${glyph} ${loop.class}${valenceStr} — ${nodeLabels}`;
}

/** Resolve a node label from the map. */
function nodeLabel(map: DependencyMap, nodeId: string): string {
  return map.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
}

export function ReadoutPanel({ map, readout, onSelect }: ReadoutPanelProps) {
  const { actFirst, resolveNext, planAround, guidance } = readout;
  const hasActFirst    = actFirst.length > 0;
  const hasResolveNext = resolveNext.length > 0;
  const hasPlanAround  = planAround.length > 0;

  return (
    <div
      style={{
        marginBottom: "20px",
        paddingBottom: "16px",
        borderBottom: "1px solid var(--paper-rule)",
      }}
    >
      {/* Panel header */}
      <div
        className="eyebrow"
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--sec-depmap)",
          marginBottom: "10px",
        }}
      >
        Decision Readout
      </div>

      {/* Guidance copy — shown when roles are missing */}
      {guidance && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--ink-dim)",
            lineHeight: 1.5,
            marginBottom: hasPlanAround ? "10px" : "0",
            fontStyle: "italic",
          }}
        >
          {guidance}
        </p>
      )}

      {/* ACT FIRST section */}
      {hasActFirst && (
        <Section label="Act First" glyph="◆">
          {actFirst.map((entry) => (
            <RowButton
              key={entry.nodeId}
              label={nodeLabel(map, entry.nodeId)}
              reason={entry.reason}
              ariaLabel={nodeLabel(map, entry.nodeId)}
              onClick={() => onSelect(entry.nodeId)}
            />
          ))}
        </Section>
      )}

      {/* RESOLVE NEXT section */}
      {hasResolveNext && (
        <Section label="Resolve Next" glyph="?">
          {resolveNext.map((entry) => (
            <RowButton
              key={entry.nodeId}
              label={nodeLabel(map, entry.nodeId)}
              reason={entry.reason}
              ariaLabel={nodeLabel(map, entry.nodeId)}
              onClick={() => onSelect(entry.nodeId)}
            />
          ))}
        </Section>
      )}

      {/* PLAN AROUND section */}
      {hasPlanAround && (
        <Section label="Plan Around" glyph={GLYPH_REINFORCING}>
          {planAround.map((item, idx) => {
            if (item.kind === "loop") {
              const label = loopLabel(map, item);
              return (
                <RowButton
                  key={`loop-${idx}`}
                  label={label}
                  ariaLabel={label}
                  onClick={() => onSelect(item.nodes[0]!)}
                />
              );
            } else {
              const label = nodeLabel(map, item.nodeId);
              return (
                <RowButton
                  key={`ext-${item.nodeId}`}
                  label={label}
                  reason={item.reason}
                  ariaLabel={label}
                  onClick={() => onSelect(item.nodeId)}
                />
              );
            }
          })}
        </Section>
      )}

      {/* Empty state — no guidance, no content */}
      {!guidance && !hasActFirst && !hasResolveNext && !hasPlanAround && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--ink-faint)",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          Add connections to see the readout.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function Section({
  label,
  glyph,
  children,
}: {
  label: string;
  glyph: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div
        style={{
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          color: "var(--ink-dim)",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <span aria-hidden="true">{glyph}</span>
        <span>{label}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {children}
      </div>
    </div>
  );
}

function RowButton({
  label,
  reason,
  ariaLabel,
  onClick,
}: {
  label: string;
  reason?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px 6px",
        borderRadius: "3px",
        fontFamily: "var(--font-display, inherit)",
        color: "var(--ink)",
        fontSize: "12px",
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-rule)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      {reason && (
        <span
          style={{
            display: "block",
            fontSize: "10px",
            color: "var(--ink-dim)",
            marginTop: "1px",
          }}
        >
          {reason}
        </span>
      )}
    </button>
  );
}
