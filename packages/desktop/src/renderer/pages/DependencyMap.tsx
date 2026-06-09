import { useState } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap } from "@decision-forge/core";

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
  return (
    <ModuleFrame
      section="§ IV"
      kicker="Consequence"
      title="Dependency Map"
      accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
      marginalia={<div className="eyebrow">Structure</div>}
    >
      <div className="text-ink-dim">Canvas goes here ({map.nodes.length} factors)</div>
    </ModuleFrame>
  );
}
