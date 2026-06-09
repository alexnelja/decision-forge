import { useMemo } from "react";
import type { DependencyMap } from "@decision-forge/core";
import { reachDownstream, reachUpstream } from "@decision-forge/core";
import { useAnalysis } from "./useAnalysis";

interface StructurePanelProps {
  map: DependencyMap;
  selectedId: string | null;
}

/** Clamp a value to [0, dim] for SVG scatter positioning. */
function normalize(val: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(val / max, 1);
}

const SVG_SIZE = 120;
const SVG_PAD = 14;
const PLOT_SIZE = SVG_SIZE - SVG_PAD * 2;

export function StructurePanel({ map, selectedId }: StructurePanelProps) {
  const analysis = useAnalysis(map);
  const { cycles, roots, leaves, micmac, graphInput } = analysis;

  const nodeCount = map.nodes.length;
  const edgeCount = map.edges.length;
  const cycleCount = cycles.length;

  // Downstream/upstream counts for the selected node.
  const { downstreamCount, upstreamCount } = useMemo(() => {
    if (!selectedId) return { downstreamCount: null, upstreamCount: null };
    const ds = reachDownstream(graphInput, selectedId);
    const us = reachUpstream(graphInput, selectedId);
    return { downstreamCount: ds.size, upstreamCount: us.size };
  }, [graphInput, selectedId]);

  // MICMAC scatter: compute max influence/dependence for normalisation.
  const micmacPoints = useMemo(() => {
    const vals = [...micmac.values()];
    const maxInf = Math.max(1, ...vals.map((v) => v.influence));
    const maxDep = Math.max(1, ...vals.map((v) => v.dependence));
    return vals.map((v) => ({
      id: v.id,
      // x = influence (out-degree), y = dependence (in-degree)
      // Plot: x grows right, y grows down → invert y so high dep = top
      cx: SVG_PAD + normalize(v.influence, maxInf) * PLOT_SIZE,
      cy: SVG_PAD + (1 - normalize(v.dependence, maxDep)) * PLOT_SIZE,
      quadrant: v.quadrant,
    }));
  }, [micmac]);

  function dotColor(quadrant: string): string {
    switch (quadrant) {
      case "driver": return "var(--sec-mc)";       // citron — high influence, low dep
      case "dependent": return "var(--sec-forecast)"; // sage — low influence, high dep
      case "linkage": return "var(--sec-depmap)";     // iris — both high
      default: return "var(--ink-faint)";             // autonomous — both low
    }
  }

  const midX = SVG_PAD + PLOT_SIZE / 2;
  const midY = SVG_PAD + PLOT_SIZE / 2;

  return (
    <div className="space-y-5 text-[13px]">
      {/* ── Counts ──────────────────────────────── */}
      <div className="space-y-2">
        <div className="eyebrow" style={{ fontSize: "10px" }}>Structure</div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <span className="text-ink-dim">Factors</span>
          <span className="text-ink font-mono">{nodeCount}</span>

          <span className="text-ink-dim">Connections</span>
          <span className="text-ink font-mono">{edgeCount}</span>

          <span className="text-ink-dim">Cycles</span>
          <span
            className="font-mono"
            style={{ color: cycleCount > 0 ? "var(--sec-nego)" : "var(--ink)" }}
          >
            {cycleCount > 0 ? `⚠ ${cycleCount}` : "0"}
          </span>

          <span className="text-ink-dim">Drivers</span>
          <span className="text-ink font-mono">{roots.length}</span>

          <span className="text-ink-dim">Outcomes</span>
          <span className="text-ink font-mono">{leaves.length}</span>
        </div>
      </div>

      {/* ── MICMAC mini-scatter ──────────────────── */}
      {nodeCount > 0 && (
        <div className="space-y-1">
          <div
            className="text-ink-dim"
            style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Influence / Dependence
          </div>

          <svg
            width={SVG_SIZE}
            height={SVG_SIZE}
            role="img"
            aria-label="MICMAC influence-dependence scatter"
            style={{ display: "block", overflow: "visible" }}
          >
            {/* Faint quadrant dividers */}
            <line
              x1={midX} y1={SVG_PAD}
              x2={midX} y2={SVG_PAD + PLOT_SIZE}
              stroke="var(--paper-rule)" strokeWidth={1}
            />
            <line
              x1={SVG_PAD} y1={midY}
              x2={SVG_PAD + PLOT_SIZE} y2={midY}
              stroke="var(--paper-rule)" strokeWidth={1}
            />

            {/* Axis labels (faint) */}
            <text
              x={SVG_PAD} y={SVG_PAD - 3}
              fontSize={8} fill="var(--ink-faint)" textAnchor="start"
            >high dep</text>
            <text
              x={SVG_PAD + PLOT_SIZE} y={SVG_PAD + PLOT_SIZE + 10}
              fontSize={8} fill="var(--ink-faint)" textAnchor="end"
            >high inf</text>

            {/* Dots */}
            {micmacPoints.map((p) => (
              <circle
                key={p.id}
                cx={p.cx}
                cy={p.cy}
                r={3.5}
                fill={dotColor(p.quadrant)}
                opacity={0.85}
              />
            ))}
          </svg>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: "10px" }}>
            <span style={{ color: "var(--sec-mc)" }}>● driver</span>
            <span style={{ color: "var(--sec-forecast)" }}>● outcome</span>
            <span style={{ color: "var(--sec-depmap)" }}>● linkage</span>
          </div>
        </div>
      )}

      {/* ── Selection readout ────────────────────── */}
      {selectedId !== null && downstreamCount !== null && upstreamCount !== null && (
        <div
          className="border-t pt-3 space-y-0.5"
          style={{ borderColor: "var(--paper-rule)" }}
        >
          <div
            className="text-ink-dim"
            style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            Selected factor
          </div>
          <div className="text-ink" style={{ lineHeight: 1.5 }}>
            Affects{" "}
            <strong className="text-ink">{downstreamCount}</strong>{" "}
            downstream · depends on{" "}
            <strong className="text-ink">{upstreamCount}</strong>
          </div>
        </div>
      )}

      {/* Empty state */}
      {nodeCount === 0 && (
        <p className="meta italic" style={{ color: "var(--ink-dim)" }}>
          Add factors to see structure.
        </p>
      )}
    </div>
  );
}
