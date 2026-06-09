import { useMemo } from "react";
import { analyze, findCycles, reachDownstream, reachUpstream } from "@decision-forge/core";
import type { DependencyMap } from "@decision-forge/core";

export type Analysis = ReturnType<typeof analyze> & {
  cycleNodeIds: Set<string>;
  cycleEdgeIds: Set<string>;
  /** Thin graph shape for reachability helpers (avoids rebuilding in callers). */
  graphInput: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> };
};

export function useAnalysis(map: DependencyMap): Analysis {
  return useMemo(() => {
    const graphInput = {
      nodes: map.nodes,
      edges: map.edges.map((e) => ({ from: e.from, to: e.to })),
    };

    const result = analyze(graphInput);

    // Build cycle node + edge sets from the SCC-based findCycles output.
    const cycles = findCycles(graphInput);
    const cycleNodeIds = new Set<string>();
    for (const cycle of cycles) {
      for (const id of cycle) cycleNodeIds.add(id);
    }

    // An edge is a "cycle edge" if both its endpoints are cycle nodes
    // AND they participate in the same strongly-connected component.
    // We identify co-SCC membership by checking that each endpoint is
    // reachable from the other (both downstream and upstream).
    const cycleEdgeIds = new Set<string>();
    for (const edge of map.edges) {
      if (cycleNodeIds.has(edge.from) && cycleNodeIds.has(edge.to)) {
        // Both in *some* cycle; confirm they share an SCC via mutual reachability.
        const downFromSource = reachDownstream(graphInput, edge.from);
        if (downFromSource.has(edge.to)) {
          // edge.to is downstream of edge.from — check edge.from is also reachable from edge.to
          const downFromTarget = reachDownstream(graphInput, edge.to);
          if (downFromTarget.has(edge.from)) {
            cycleEdgeIds.add(edge.id);
          }
        }
      }
    }

    return { ...result, cycleNodeIds, cycleEdgeIds, graphInput };
  }, [map]);
}

/** Helper: get downstream IDs for the selected node (returns empty set when no selection). */
export function getDownstream(
  graphInput: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> },
  selectedId: string | null
): Set<string> {
  if (!selectedId) return new Set();
  return reachDownstream(graphInput, selectedId);
}

/** Helper: get upstream IDs for the selected node. */
export function getUpstream(
  graphInput: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> },
  selectedId: string | null
): Set<string> {
  if (!selectedId) return new Set();
  return reachUpstream(graphInput, selectedId);
}
