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
import { ROLE_OPTIONS, roleGlyph } from "./roles";

export interface ReadoutPanelProps {
  map: DependencyMap;
  readout: Readout;
  onSelect: (nodeId: string) => void;
  /** Optional: called when the user clicks "→ Simulate" on a Resolve-next row. */
  onPushToMC?: (nodeId: string) => void;
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

export function ReadoutPanel({ map, readout, onSelect, onPushToMC }: ReadoutPanelProps) {
  const { actFirst, resolveNext, planAround, guidance } = readout;
  const hasActFirst    = actFirst.length > 0;
  const hasResolveNext = resolveNext.length > 0;
  const hasPlanAround  = planAround.length > 0;

  // Blank canvas already shows its own "Double-click to add your first factor"
  // hint — guidance ("Mark your objective…") would be premature noise here.
  if (map.nodes.length === 0) return null;

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

      {/* Guidance copy + role legend — shown when roles are missing */}
      {guidance && (
        <>
          <p
            style={{
              fontSize: "11px",
              color: "var(--ink-dim)",
              lineHeight: 1.5,
              marginBottom: "8px",
              fontStyle: "italic",
            }}
          >
            {guidance}
          </p>
          {/* Compact legend: one line per role with glyph + description.
              Only shown here (the learning moment); disappears once roles exist
              and guidance clears. */}
          <div
            style={{
              marginBottom: hasPlanAround ? "10px" : "0",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            {ROLE_OPTIONS.filter((o) => o.glyph).map((opt) => (
              <div
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "5px",
                  fontSize: "10px",
                  color: "var(--ink-faint)",
                  lineHeight: 1.4,
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0, width: "12px", textAlign: "center" }}>
                  {opt.glyph}
                </span>
                <span>{opt.description}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ACT FIRST section */}
      {hasActFirst && (
        <Section label="Act First" glyph={roleGlyph("lever")!}>
          {actFirst.map((entry) => {
            const label = nodeLabel(map, entry.nodeId);
            return (
              <RowButton
                key={entry.nodeId}
                label={label}
                reason={entry.reason}
                onClick={() => onSelect(entry.nodeId)}
              />
            );
          })}
        </Section>
      )}

      {/* RESOLVE NEXT section */}
      {hasResolveNext && (
        <Section label="Resolve Next" glyph={roleGlyph("uncertainty")!}>
          {resolveNext.map((entry) => {
            const label = nodeLabel(map, entry.nodeId);
            return (
              <RowButton
                key={entry.nodeId}
                label={label}
                reason={entry.reason}
                onClick={() => onSelect(entry.nodeId)}
                onPushToMC={onPushToMC ? () => onPushToMC(entry.nodeId) : undefined}
                simulateAriaLabel={`Simulate ${label} in Monte Carlo`}
              />
            );
          })}
        </Section>
      )}

      {/* PLAN AROUND section */}
      {hasPlanAround && (
        <Section label="Plan Around" glyph={GLYPH_REINFORCING}>
          {planAround.map((item, idx) => {
            if (item.kind === "loop") {
              // Spoken-friendly aria-label: no glyphs, e.g.
              // "reinforcing loop: Price, Volume".
              const spokenNodes = item.nodes
                .map((id) => nodeLabel(map, id))
                .join(", ");
              return (
                <RowButton
                  key={`loop-${idx}`}
                  label={loopLabel(map, item)}
                  ariaLabel={`${item.valence ?? item.class} loop: ${spokenNodes}`}
                  onClick={() => onSelect(item.nodes[0]!)}
                />
              );
            } else {
              return (
                <RowButton
                  key={`ext-${item.nodeId}`}
                  label={nodeLabel(map, item.nodeId)}
                  reason={item.reason}
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
  onPushToMC,
  simulateAriaLabel,
}: {
  label: string;
  reason?: string;
  /**
   * Only pass when the visible text is NOT spoken-friendly (e.g. loop rows
   * with glyphs). Plain rows rely on the button's text content as their
   * accessible name.
   */
  ariaLabel?: string;
  onClick: () => void;
  /** Present on Resolve-next rows: fires the MC push for this entry. */
  onPushToMC?: () => void;
  simulateAriaLabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <button
        aria-label={ariaLabel}
        onClick={onClick}
        className="readout-row focus-ring"
        style={{
          display: "block",
          flex: 1,
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
      {onPushToMC && (
        <button
          aria-label={simulateAriaLabel}
          onClick={onPushToMC}
          className="focus-ring"
          title="Simulate in Monte Carlo (§ I)"
          style={{
            flexShrink: 0,
            background: "none",
            border: "1px solid var(--sec-mc, #6bbf8e)",
            borderRadius: "3px",
            color: "var(--sec-mc, #6bbf8e)",
            fontSize: "10px",
            padding: "2px 5px",
            cursor: "pointer",
            fontFamily: "var(--font-display, inherit)",
            whiteSpace: "nowrap",
          }}
        >
          → §I
        </button>
      )}
    </div>
  );
}
