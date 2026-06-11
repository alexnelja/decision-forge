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
 * Valence of a loop relative to the objective: sign-product along paths from
 * any loop node to the objective. Conservative: explores ALL reachable
 * (node, sign) states — if ANY path arrives with a negative sign-product the
 * loop is "vicious"; else "virtuous" if a positive path exists; else
 * undefined (no objective or no path). The seen set is keyed by (id, sign)
 * so a node first reached "+" cannot mask a later "−" path through it.
 */
export function loopValence(
  loopNodes: ReadonlyArray<string>,
  g: SignedGraphInput,
  objectiveId: string | undefined
): "virtuous" | "vicious" | undefined {
  if (!objectiveId) return undefined;
  const inLoop = new Set(loopNodes);
  if (inLoop.has(objectiveId)) return undefined; // loop contains the objective: no external path needed
  const out = new Map<string, Array<{ to: string; sign: 1 | -1 }>>();
  for (const e of g.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push({ to: e.to, sign: e.sign === "-" ? -1 : 1 });
  }
  // BFS over (node, sign) states, tracking accumulated sign (+1 / −1).
  const queue: Array<{ id: string; sign: 1 | -1 }> = loopNodes.map((id) => ({ id, sign: 1 }));
  const seen = new Set(queue.map((s) => `${s.id}:${s.sign}`));
  let negHit = false;
  let posHit = false;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const step of out.get(cur.id) ?? []) {
      const sign = (cur.sign * step.sign) as 1 | -1;
      if (step.to === objectiveId) {
        if (sign === -1) negHit = true; else posHit = true;
        continue; // record arrival; don't traverse beyond the objective
      }
      const key = `${step.to}:${sign}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ id: step.to, sign }); }
    }
  }
  if (negHit) return "vicious"; // any negative path wins (conservative)
  if (posHit) return "virtuous";
  return undefined;
}
