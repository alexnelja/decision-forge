import { useState } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap } from "@decision-forge/core";
import { CapturePanel } from "./depmap/CapturePanel";

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

  function handleAddNode(label: string) {
    const now = new Date().toISOString();
    setMap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, { id: crypto.randomUUID(), label }],
      updatedAt: now
    }));
  }

  return (
    <ModuleFrame
      section="§ IV"
      kicker="Consequence"
      title="Dependency Map"
      accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
      marginalia={
        <CapturePanel
          map={map}
          onAddNode={handleAddNode}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      }
    >
      <div className="text-ink-dim">Canvas goes here ({map.nodes.length} factors)</div>
    </ModuleFrame>
  );
}
