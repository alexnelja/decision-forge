// packages/core/src/graph/readout.ts
import type { DependencyMap } from "../schemas/dependency-map.js";
import { reachDownstream, reachUpstream } from "./reach.js";
import { classifyLoops, loopValence, type LoopClass } from "./loops.js";

export interface ReadoutEntry { nodeId: string; reason: string }
export type PlanAroundItem =
  | { kind: "loop"; nodes: string[]; class: LoopClass; valence?: "virtuous" | "vicious" }
  | { kind: "external"; nodeId: string; reason: string };
export interface Readout {
  actFirst: ReadoutEntry[];
  resolveNext: ReadoutEntry[];
  planAround: PlanAroundItem[];
  guidance: string | null;
}

const TOP = 3;

export function decisionReadout(map: DependencyMap): Readout {
  const g = {
    nodes: map.nodes,
    edges: map.edges.map((e) => ({ from: e.from, to: e.to, sign: e.sign })),
  };
  const objective = map.nodes.find((n) => n.role === "objective");
  const levers = map.nodes.filter((n) => n.role === "lever");
  const uncertainties = map.nodes.filter((n) => n.role === "uncertainty");
  const anyRole = map.nodes.some((n) => n.role && n.role !== "factor");

  // Downstream reach per node (Set excludes start, except when in a cycle).
  const down = new Map(map.nodes.map((n) => [n.id, reachDownstream(g, n.id)]));

  /** Downstream count for ranking: excludes self (handles cyclic start nodes). */
  const downCount = (id: string) => {
    const s = down.get(id)!;
    return s.has(id) ? s.size - 1 : s.size;
  };

  // Zero-downstream candidates are excluded: a lever that drives nothing
  // isn't "act first" material, and "0 factors hang on this" reads as noise.
  const rank = (ns: typeof map.nodes) =>
    ns
      .filter((n) => downCount(n.id) > 0)
      .sort((a, b) => downCount(b.id) - downCount(a.id))
      .slice(0, TOP);

  const actFirst = rank(levers).map((n) => {
    const count = downCount(n.id);
    const hitsObjective = objective ? down.get(n.id)!.has(objective.id) : false;
    return {
      nodeId: n.id,
      reason: `drives ${count} factor${count === 1 ? "" : "s"}${hitsObjective ? " → reaches the objective" : ""}`,
    };
  });

  const resolveNext = rank(uncertainties).map((n) => {
    const count = downCount(n.id);
    return { nodeId: n.id, reason: `${count} factor${count === 1 ? "" : "s"} hang on this` };
  });

  // Loops — vicious first (weight 3), then reinforcing (weight 2), then balancing (weight 1).
  const loops: PlanAroundItem[] = classifyLoops(g).map((l) => ({
    kind: "loop" as const,
    nodes: l.nodes,
    class: l.class,
    valence:
      l.class === "reinforcing"
        ? loopValence(l.nodes, g, objective?.id)
        : undefined,
  }));
  loops.sort((a, b) => loopWeight(b) - loopWeight(a));

  // External pressures: factors (no role or role="factor") with ≥2 downstream
  // and no lever in their upstream set.
  const leverIds = new Set(levers.map((l) => l.id));
  const externals: PlanAroundItem[] = map.nodes
    .filter((n) => !n.role || n.role === "factor")
    .filter((n) => downCount(n.id) >= 2)
    .filter((n) => ![...reachUpstream(g, n.id)].some((u) => leverIds.has(u)))
    .sort((a, b) => downCount(b.id) - downCount(a.id))
    .slice(0, TOP)
    .map((n) => ({
      kind: "external" as const,
      nodeId: n.id,
      reason: `outside your control — drives ${downCount(n.id)} factors`,
    }));

  const planAround = [...loops, ...externals].slice(0, TOP);

  let guidance: string | null = null;
  if (!anyRole) guidance = "Mark your objective ◎, levers ◆ and uncertainties ? to get a readout.";
  else if (!objective) guidance = "Mark an objective ◎ so the readout can aim at it.";
  else if (levers.length === 0) guidance = "Mark the factors you can act on as levers ◆.";

  return { actFirst, resolveNext, planAround, guidance };
}

function loopWeight(l: PlanAroundItem): number {
  if (l.kind !== "loop") return 0;
  if (l.valence === "vicious") return 3;
  if (l.class === "reinforcing") return 2;
  return 1; // balancing
}
