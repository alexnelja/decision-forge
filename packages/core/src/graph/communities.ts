// packages/core/src/graph/communities.ts
import type { GraphInput } from "./types.js";

// Treats edges as UNDIRECTED (union-find) to find weakly-connected components.
export function communities(g: GraphInput): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x; while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  for (const n of g.nodes) parent.set(n.id, n.id);
  for (const e of g.edges) {
    if (!parent.has(e.from) || !parent.has(e.to)) continue;
    parent.set(find(e.from), find(e.to));
  }
  // normalise roots → 0..k stable ids
  const idOf = new Map<string, number>();
  const out = new Map<string, number>();
  for (const n of g.nodes) {
    const r = find(n.id);
    if (!idOf.has(r)) idOf.set(r, idOf.size);
    out.set(n.id, idOf.get(r)!);
  }
  return out;
}
