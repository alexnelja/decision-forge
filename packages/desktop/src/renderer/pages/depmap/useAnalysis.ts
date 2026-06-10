import { useMemo } from "react";
import {
  analyze,
  findCycles,
  reachDownstream,
  decisionReadout,
  classifyLoops,
} from "@decision-forge/core";
import type { DependencyMap, Readout, ClassifiedLoop } from "@decision-forge/core";

export type Analysis = ReturnType<typeof analyze> & {
  cycleNodeIds: Set<string>;
  cycleEdgeIds: Set<string>;
  /** Thin graph shape for reachability helpers (avoids rebuilding in callers). */
  graphInput: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> };
  /** Decision Readout (act first / resolve next / plan around + guidance). */
  readout: Readout;
  /** Classified loops (reinforcing / balancing) for badge overlay. */
  classifiedLoops: ClassifiedLoop[];
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
    // Cost: this runs two BFS passes per candidate cycle edge — negligible at
    // this module's ~10–60 node scale. If it ever needs to scale, derive
    // co-SCC membership from the SCC component-id maps instead of re-BFS'ing.
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

    // Signed graph for classifyLoops + decisionReadout (preserves sign).
    const signedGraphInput = {
      nodes: map.nodes,
      edges: map.edges.map((e) => ({ from: e.from, to: e.to, sign: e.sign })),
    };

    const classifiedLoopsResult = classifyLoops(signedGraphInput);
    const readout = decisionReadout(map);

    return { ...result, cycleNodeIds, cycleEdgeIds, graphInput, readout, classifiedLoops: classifiedLoopsResult };
  }, [map]);
}
