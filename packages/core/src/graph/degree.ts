// packages/core/src/graph/degree.ts
import type { GraphInput } from "./types.js";
export interface Degree { id: string; in: number; out: number; total: number; }

export function degrees(g: GraphInput): Map<string, Degree> {
  const m = new Map<string, Degree>();
  for (const n of g.nodes) m.set(n.id, { id: n.id, in: 0, out: 0, total: 0 });
  for (const e of g.edges) {
    const f = m.get(e.from);
    const t = m.get(e.to);
    if (f) { f.out++; f.total++; }
    if (t) { t.in++; t.total++; }
  }
  return m;
}

export function rootsAndLeaves(g: GraphInput): { roots: string[]; leaves: string[] } {
  const d = degrees(g);
  const roots: string[] = [];
  const leaves: string[] = [];
  for (const v of d.values()) {
    if (v.in === 0 && v.out > 0) roots.push(v.id);
    if (v.out === 0 && v.in > 0) leaves.push(v.id);
  }
  return { roots, leaves };
}
