// packages/core/src/graph/layers.ts
import type { GraphInput } from "./types.js";
import { stronglyConnectedComponents } from "./cycles.js";

export function topoLayers(g: GraphInput): Map<string, number> {
  const sccs = stronglyConnectedComponents(g);
  const compOf = new Map<string, number>();
  sccs.forEach((c, i) => c.forEach((id) => compOf.set(id, i)));

  // condensed DAG adjacency (component → set of component)
  const cadj = new Map<number, Set<number>>();
  const indeg = new Map<number, number>();
  for (let i = 0; i < sccs.length; i++) { cadj.set(i, new Set()); indeg.set(i, 0); }
  for (const e of g.edges) {
    const a = compOf.get(e.from)!, b = compOf.get(e.to)!;
    if (a !== b && !cadj.get(a)!.has(b)) { cadj.get(a)!.add(b); indeg.set(b, indeg.get(b)! + 1); }
  }
  // longest-path layering: layer[c] = max(layer[pred]) + 1 via Kahn order
  const layer = new Map<number, number>();
  const queue: number[] = [];
  for (let i = 0; i < sccs.length; i++) if (indeg.get(i) === 0) { layer.set(i, 0); queue.push(i); }
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of cadj.get(c)!) {
      layer.set(d, Math.max(layer.get(d) ?? 0, layer.get(c)! + 1));
      indeg.set(d, indeg.get(d)! - 1);
      if (indeg.get(d) === 0) queue.push(d);
    }
  }
  const out = new Map<string, number>();
  for (const n of g.nodes) out.set(n.id, layer.get(compOf.get(n.id)!) ?? 0);
  return out;
}
