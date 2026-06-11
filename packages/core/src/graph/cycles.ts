// packages/core/src/graph/cycles.ts
import type { GraphInput } from "./types.js";

function adjacency(g: GraphInput): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) adj.get(e.from)?.push(e.to);
  return adj;
}

/** Tarjan's SCC (iterative). Returns every strongly-connected component. */
export function stronglyConnectedComponents(g: GraphInput): string[][] {
  const adj = adjacency(g);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let idx = 0;

  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    // iterative DFS frame: [node, neighbourPointer]
    const work: Array<{ v: string; i: number }> = [{ v: start, i: 0 }];
    index.set(start, idx); low.set(start, idx); idx++; stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1]!;
      const neighbours = adj.get(frame.v)!;
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i++]!; // bounds-checked by frame.i < neighbours.length
        if (!index.has(w)) {
          index.set(w, idx); low.set(w, idx); idx++; stack.push(w); onStack.add(w);
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        }
      } else {
        if (low.get(frame.v) === index.get(frame.v)) {
          const comp: string[] = [];
          let w: string;
          do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== frame.v);
          out.push(comp);
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1]!.v;
          low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
        }
      }
    }
  }
  return out;
}

/** Cyclic groups = SCCs with >1 node (self-loops are schema-rejected). Shortest first. */
export function findCycles(g: GraphInput): string[][] {
  return stronglyConnectedComponents(g)
    .filter((c) => c.length > 1)
    .sort((a, b) => a.length - b.length);
}
