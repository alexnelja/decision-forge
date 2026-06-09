// packages/core/src/graph/index.ts
import type { GraphInput } from "./types.js";
import { degrees, rootsAndLeaves } from "./degree.js";
import { findCycles } from "./cycles.js";
import { topoLayers } from "./layers.js";
import { communities } from "./communities.js";
import { micmac } from "./micmac.js";

export * from "./types.js";
export * from "./degree.js";
export * from "./cycles.js";
export * from "./layers.js";
export * from "./reach.js";
export * from "./communities.js";
export * from "./micmac.js";

export function analyze(g: GraphInput) {
  const { roots, leaves } = rootsAndLeaves(g);
  return {
    degrees: degrees(g),
    roots, leaves,
    cycles: findCycles(g),
    layers: topoLayers(g),
    communities: communities(g),
    micmac: micmac(g)
  };
}
