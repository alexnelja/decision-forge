// packages/core/src/graph/reach.ts
import type { GraphInput } from "./types.js";

function bfs(g: GraphInput, start: string, dir: "down" | "up"): Set<string> {
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    if (dir === "down") adj.get(e.from)?.push(e.to);
    else adj.get(e.to)?.push(e.from);
  }
  const seen = new Set<string>();
  const q = [...(adj.get(start) ?? [])];
  while (q.length) {
    const v = q.shift()!;
    if (seen.has(v)) continue;
    // Only track nodes registered in the graph; skip dangling references
    if (!adj.has(v)) continue;
    seen.add(v);
    for (const w of adj.get(v) ?? []) if (!seen.has(w)) q.push(w);
  }
  return seen; // excludes start unless reachable via a cycle
}
export const reachDownstream = (g: GraphInput, id: string) => bfs(g, id, "down");
export const reachUpstream = (g: GraphInput, id: string) => bfs(g, id, "up");
