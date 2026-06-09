// packages/core/src/graph/loops.ts
import type { GraphInput } from "./types.js";
import { findCycles } from "./cycles.js";

export interface SignedGraphInput extends GraphInput {
  edges: ReadonlyArray<{ from: string; to: string; sign?: "+" | "-" }>;
}
export type LoopClass = "reinforcing" | "balancing";
export interface ClassifiedLoop { nodes: string[]; class: LoopClass }

/**
 * Classify each cyclic group (SCC > 1). Parity rule over the SCC's INTERNAL
 * edges: odd # of "−" → balancing, even (incl. 0) → reinforcing. Unsigned
 * edges count as "+". Simplification: an SCC may contain several simple
 * loops; we classify the component as a whole — fine at 10–60 node scale.
 */
export function classifyLoops(g: SignedGraphInput): ClassifiedLoop[] {
  return findCycles(g).map((nodes) => {
    const inScc = new Set(nodes);
    const minuses = g.edges.filter(
      (e) => inScc.has(e.from) && inScc.has(e.to) && e.sign === "-"
    ).length;
    return { nodes, class: minuses % 2 === 1 ? "balancing" : "reinforcing" };
  });
}

/**
 * Valence of a loop relative to the objective: sign-product along a BFS
 * shortest path from any loop node to the objective. "+" → virtuous,
 * "−" → vicious. Undefined when there is no objective or no path.
 */
export function loopValence(
  loopNodes: ReadonlyArray<string>,
  g: SignedGraphInput,
  objectiveId: string | undefined
): "virtuous" | "vicious" | undefined {
  if (!objectiveId) return undefined;
  const inLoop = new Set(loopNodes);
  if (inLoop.has(objectiveId)) return undefined; // loop contains the objective: no external path needed
  // BFS over edges, tracking accumulated sign (+1 / -1).
  const queue: Array<{ id: string; sign: 1 | -1 }> = loopNodes.map((id) => ({ id, sign: 1 }));
  const seen = new Set(loopNodes);
  const out = new Map<string, Array<{ to: string; sign: 1 | -1 }>>();
  for (const e of g.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push({ to: e.to, sign: e.sign === "-" ? -1 : 1 });
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const step of out.get(cur.id) ?? []) {
      const sign = (cur.sign * step.sign) as 1 | -1;
      if (step.to === objectiveId) return sign === 1 ? "virtuous" : "vicious";
      if (!seen.has(step.to)) { seen.add(step.to); queue.push({ id: step.to, sign }); }
    }
  }
  return undefined;
}
