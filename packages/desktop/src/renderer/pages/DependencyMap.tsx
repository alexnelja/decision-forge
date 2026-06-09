import { useState } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap, DependencyEdge } from "@decision-forge/core";
import { CapturePanel } from "./depmap/CapturePanel";
import { LayeredView } from "./depmap/LayeredView";
import { StructurePanel } from "./depmap/StructurePanel";
import { useAnalysis } from "./depmap/useAnalysis";

const EMPTY: DMap = {
  id: crypto.randomUUID(),
  name: "Untitled map",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [],
  edges: []
};

export default function DependencyMap() {
  const [map, setMap] = useState<DMap>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Compute analysis ONCE here and pass down to both LayeredView and StructurePanel.
  const analysis = useAnalysis(map);

  function handleAddNode(label: string) {
    const now = new Date().toISOString();
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: crypto.randomUUID(), label }],
      updatedAt: now
    }));
  }

  function handleAddEdge(from: string, to: string) {
    // Guard: no self-loops
    if (from === to) return;
    setMap((prev) => {
      // Guard: no duplicate edges (same from+to) — checked against latest state
      if (prev.edges.some((e) => e.from === from && e.to === to)) return prev;
      const newEdge: DependencyEdge = {
        id: crypto.randomUUID(),
        from,
        to,
      };
      return {
        ...prev,
        edges: [...prev.edges, newEdge],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  return (
    <ModuleFrame
      section="§ IV"
      kicker="Consequence"
      title="Dependency Map"
      accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
      marginalia={
        <StructurePanel map={map} selectedId={selectedId} />
      }
    >
      {/* Two-column grid: capture panel (fixed narrow) | layered canvas (fills) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: "24px",
          height: "540px",
        }}
      >
        {/* Left: capture panel */}
        <div
          style={{
            borderRight: "1px solid var(--paper-rule)",
            paddingRight: "20px",
            overflowY: "auto",
          }}
        >
          <CapturePanel
            map={map}
            onAddNode={handleAddNode}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right: layered DAG canvas */}
        <div style={{ position: "relative" }}>
          <LayeredView
            map={map}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddEdge={handleAddEdge}
            analysis={analysis}
          />
        </div>
      </div>
    </ModuleFrame>
  );
}
