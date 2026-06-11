// packages/core/src/graph/micmac.ts
import type { GraphInput } from "./types.js";
import { degrees } from "./degree.js";

export type Quadrant = "driver" | "dependent" | "linkage" | "autonomous";
export interface Micmac { id: string; influence: number; dependence: number; quadrant: Quadrant; }

export function micmac(g: GraphInput): Map<string, Micmac> {
  const d = degrees(g);
  const vals = [...d.values()];
  const meanOut = vals.reduce((s, v) => s + v.out, 0) / (vals.length || 1);
  const meanIn = vals.reduce((s, v) => s + v.in, 0) / (vals.length || 1);
  const out = new Map<string, Micmac>();
  for (const v of vals) {
    const hiInf = v.out > meanOut, hiDep = v.in > meanIn;
    const quadrant: Quadrant =
      hiInf && !hiDep ? "driver" : !hiInf && hiDep ? "dependent" : hiInf && hiDep ? "linkage" : "autonomous";
    out.set(v.id, { id: v.id, influence: v.out, dependence: v.in, quadrant });
  }
  return out;
}
