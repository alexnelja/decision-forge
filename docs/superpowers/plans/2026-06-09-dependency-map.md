# § IV Dependency Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth desktop module — a hand-built dependency map of decision factors with a layered DAG primary view and a 3D constellation overview, plus structural analysis (cycles, roots/leaves, layers, reachability, hubs, communities, MICMAC).

**Architecture:** Pure graph algorithms + Zod schema live in `@decision-forge/core` (unit-tested first). JSON-per-map persistence in the Electron main process mirrors the existing `scenarios.ts` pattern (IPC → preload → renderer api). The renderer page renders one data model through two lazy-loaded views (`react-flow`+`dagre` layered; `react-force-graph-3d` constellation). Decision *semantics* (objective/controllability/uncertainty, Decision Readout) are v1.1 — the schema reserves them as optional fields so there is no migration.

**Tech Stack:** TypeScript, Zod, React, react-router-dom, vitest, Playwright; new renderer deps `reactflow`, `dagre`, `react-force-graph-3d` (pulls `three`).

**Spec:** `docs/superpowers/specs/2026-06-09-dependency-map-design.md`. Read §4 (data model), §5 (analysis), §6 (operability), §7 (file layout) before starting.

**Conventions to follow (verified in repo):**
- Core schemas live in `packages/core/src/schemas/*.ts`, re-exported from `packages/core/src/index.ts`, tested in `packages/core/tests/*.test.ts` (vitest).
- `uuid = z.string().uuid()`, `iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)` (see `schemas/forecast.ts`).
- Persistence + IPC pattern: `packages/desktop/src/main/scenarios.ts`. IPC handlers registered in `main/index.ts`'s `app.whenReady`.
- Preload exposes `window.api.<name>` (`main/preload.ts`); the renderer-side type lives in `declare global` inside `renderer/lib/sidecar-client.ts`.
- Renderer api wrappers: `renderer/lib/<name>-api.ts` (e.g. `scenarios-api.ts`).
- Run core tests: `pnpm --filter @decision-forge/core test`. Desktop unit: `pnpm --filter @decision-forge/desktop test`. E2E: `cd packages/desktop && unset ELECTRON_RUN_AS_NODE && npx playwright test`.

---

## Task 1: Core schema + maps dir

**Files:**
- Create: `packages/core/src/schemas/dependency-map.ts`
- Modify: `packages/core/src/index.ts` (add export)
- Modify: `packages/core/src/paths.ts` (add `mapsDir`)
- Test: `packages/core/tests/dependency-map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/dependency-map.test.ts
import { describe, it, expect } from "vitest";
import { DependencyMapSchema as S } from "../src/index.js"; // surfaced via the index barrel

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const E = "33333333-3333-4333-8333-333333333333";
const base = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "decision",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [{ id: A, label: "demand" }, { id: B, label: "margin" }],
  edges: [{ id: E, from: A, to: B }]
};

describe("DependencyMapSchema", () => {
  it("accepts a valid map", () => {
    expect(S.parse(base).edges).toHaveLength(1);
  });
  it("rejects a dangling edge", () => {
    const bad = { ...base, edges: [{ id: E, from: A, to: "99999999-9999-4999-8999-999999999999" }] };
    expect(() => S.parse(bad)).toThrow(/unknown node|to/i);
  });
  it("rejects a self-loop", () => {
    const bad = { ...base, edges: [{ id: E, from: A, to: A }] };
    expect(() => S.parse(bad)).toThrow(/self-loop/i);
  });
  it("accepts v1.1 optional fields (forward-compat)", () => {
    const fwd = { ...base,
      nodes: [{ id: A, label: "demand", type: "objective", controllability: "control", uncertainty: { flag: true, impact: "high" } }, { id: B, label: "margin" }],
      edges: [{ id: E, from: A, to: B, sign: "+" }] };
    expect(() => S.parse(fwd)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @decision-forge/core test dependency-map`
Expected: FAIL (module/export missing).

- [ ] **Step 3: Write the schema**

```ts
// packages/core/src/schemas/dependency-map.ts
import { z } from "zod";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

export const DependencyNodeSchema = z.object({
  id: uuid,
  label: z.string().min(1),
  note: z.string().optional(),
  // --- v1.1 reserved (optional; absent in v1) ---
  type: z.enum(["objective", "factor"]).optional(),
  controllability: z.enum(["control", "influence", "concern"]).optional(),
  uncertainty: z.object({ flag: z.boolean(), impact: z.enum(["low", "high"]).optional() }).optional()
});
export type DependencyNode = z.infer<typeof DependencyNodeSchema>;

export const DependencyEdgeSchema = z.object({
  id: uuid,
  from: uuid, // driver
  to: uuid,   // driven  (from → to means "from drives to")
  sign: z.enum(["+", "-"]).optional() // v1.1
});
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const DependencyMapSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    createdAt: iso,
    updatedAt: iso,
    nodes: z.array(DependencyNodeSchema),
    edges: z.array(DependencyEdgeSchema)
  })
  .superRefine((map, ctx) => {
    const ids = new Set(map.nodes.map((n) => n.id));
    map.edges.forEach((e, i) => {
      if (e.from === e.to)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i], message: "self-loop not allowed" });
      if (!ids.has(e.from))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i, "from"], message: "edge.from references unknown node" });
      if (!ids.has(e.to))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i, "to"], message: "edge.to references unknown node" });
    });
  });
export type DependencyMap = z.infer<typeof DependencyMapSchema>;
```

- [ ] **Step 4: Wire exports + paths**

In `packages/core/src/index.ts` add: `export * from "./schemas/dependency-map.js";`
In `packages/core/src/paths.ts` add:
```ts
export function mapsDir(override?: string): string {
  return path.join(resolveAppDataDir(override), "maps");
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm --filter @decision-forge/core test dependency-map`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schemas/dependency-map.ts packages/core/src/index.ts packages/core/src/paths.ts packages/core/tests/dependency-map.test.ts
git commit -m "feat(core): DependencyMap schema + maps dir"
```

---

## Task 2: Graph types + degree, roots/leaves

**Files:**
- Create: `packages/core/src/graph/types.ts`, `packages/core/src/graph/degree.ts`
- Test: `packages/core/tests/graph-degree.test.ts`

`GraphInput` is a minimal shape so algorithms don't depend on the full schema.

- [ ] **Step 1: Failing test**

```ts
// packages/core/tests/graph-degree.test.ts
import { describe, it, expect } from "vitest";
import { degrees, rootsAndLeaves } from "../src/graph/degree.js";

const g = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "iso" }],
  edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "c" }]
};

describe("degree", () => {
  it("counts in/out/total", () => {
    const d = degrees(g);
    expect(d.get("a")).toEqual({ id: "a", in: 0, out: 2, total: 2 });
    expect(d.get("c")).toEqual({ id: "c", in: 2, out: 0, total: 2 });
  });
  it("roots = drivers (in=0, out>0); leaves = outcomes (out=0, in>0); isolated excluded", () => {
    const { roots, leaves } = rootsAndLeaves(g);
    expect(roots).toEqual(["a"]);
    expect(leaves).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm --filter @decision-forge/core test graph-degree`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/graph/types.ts
export interface GraphInput {
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
}
```
```ts
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
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): graph degree + roots/leaves"`

---

## Task 3: Strongly-connected components + cycle detection

**Files:** Create `packages/core/src/graph/cycles.ts`; Test `packages/core/tests/graph-cycles.test.ts`

v1 reports cyclic groups as SCCs of size > 1 (a tangle). Elementary-cycle enumeration (Johnson) is a v1.1 refinement — note it in a code comment.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { stronglyConnectedComponents, findCycles } from "../src/graph/cycles.js";

describe("cycles", () => {
  it("a DAG has no cycles", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }] };
    expect(findCycles(g)).toEqual([]);
  });
  it("detects a 3-cycle", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }] };
    const cy = findCycles(g);
    expect(cy).toHaveLength(1);
    expect([...cy[0]].sort()).toEqual(["a", "b", "c"]);
  });
  it("ranks shorter cycles first", () => {
    const g = { nodes: ["a","b","c","d","e"].map(id => ({ id })),
      edges: [
        { from: "a", to: "b" }, { from: "b", to: "a" },           // 2-cycle
        { from: "c", to: "d" }, { from: "d", to: "e" }, { from: "e", to: "c" } // 3-cycle
      ] };
    const cy = findCycles(g);
    expect(cy.map(c => c.length)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (iterative Tarjan to avoid stack overflow on large graphs)**

```ts
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
      const frame = work[work.length - 1];
      const neighbours = adj.get(frame.v)!;
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i++];
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
          const parent = work[work.length - 1].v;
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
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): SCC + cycle detection"`

---

## Task 4: Topological layers (over SCC condensation)

**Files:** Create `packages/core/src/graph/layers.ts`; Test `packages/core/tests/graph-layers.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { topoLayers } from "../src/graph/layers.js";

describe("topoLayers", () => {
  it("layers a simple chain", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] };
    const L = topoLayers(g);
    expect(L.get("a")).toBe(0);
    expect(L.get("b")).toBe(1);
    expect(L.get("c")).toBe(2);
  });
  it("places a diamond's join below both parents", () => {
    const g = { nodes: ["a","b","c","d"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"a",to:"c"},{from:"b",to:"d"},{from:"c",to:"d"}] };
    const L = topoLayers(g);
    expect(L.get("d")).toBe(2);
  });
  it("does not loop forever on a cycle (condenses SCCs)", () => {
    const g = { nodes: ["a","b","c"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"b",to:"a"},{from:"b",to:"c"}] };
    const L = topoLayers(g);
    expect(L.get("a")).toBe(L.get("b")); // same SCC → same layer
    expect(L.get("c")!).toBeGreaterThan(L.get("a")!);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (condense SCCs → longest-path layering)**

```ts
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
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): topological layering over SCC condensation"`

---

## Task 5: Reachability (downstream / upstream)

**Files:** Create `packages/core/src/graph/reach.ts`; Test `packages/core/tests/graph-reach.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { reachDownstream, reachUpstream } from "../src/graph/reach.js";

const g = { nodes: ["a","b","c","d"].map(id=>({id})),
  edges: [{from:"a",to:"b"},{from:"b",to:"c"},{from:"x",to:"a"}] };

describe("reach", () => {
  it("downstream excludes the start, follows from→to transitively", () => {
    expect([...reachDownstream(g, "a")].sort()).toEqual(["b","c"]);
  });
  it("upstream follows to→from", () => {
    expect([...reachUpstream(g, "c")].sort()).toEqual(["a","b"]);
  });
  it("is cycle-safe", () => {
    const cyc = { nodes:["a","b"].map(id=>({id})), edges:[{from:"a",to:"b"},{from:"b",to:"a"}] };
    expect([...reachDownstream(cyc,"a")].sort()).toEqual(["a","b"]); // a reaches b, b reaches a
  });
});
```
(Note: in the cycle case `a`'s downstream includes itself because it's reachable via the loop — that's correct/expected.)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (BFS)**

```ts
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
    seen.add(v);
    for (const w of adj.get(v) ?? []) if (!seen.has(w)) q.push(w);
  }
  return seen; // excludes start unless reachable via a cycle
}
export const reachDownstream = (g: GraphInput, id: string) => bfs(g, id, "down");
export const reachUpstream = (g: GraphInput, id: string) => bfs(g, id, "up");
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): downstream/upstream reachability"`

---

## Task 6: Communities (weakly-connected components)

**Files:** Create `packages/core/src/graph/communities.ts`; Test `packages/core/tests/graph-communities.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { communities } from "../src/graph/communities.js";

it("groups weakly-connected nodes, separate clusters get distinct ids", () => {
  const g = { nodes: ["a","b","c","d"].map(id=>({id})),
    edges: [{from:"a",to:"b"},{from:"c",to:"d"}] };
  const c = communities(g);
  expect(c.get("a")).toBe(c.get("b"));
  expect(c.get("c")).toBe(c.get("d"));
  expect(c.get("a")).not.toBe(c.get("c"));
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (union-find, undirected)**

```ts
// packages/core/src/graph/communities.ts
import type { GraphInput } from "./types.js";

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
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): community detection (weakly-connected components)"`

---

## Task 7: MICMAC influence/dependence quadrant

**Files:** Create `packages/core/src/graph/micmac.ts`; Test `packages/core/tests/graph-micmac.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { micmac } from "../src/graph/micmac.js";

it("classifies a clear driver and a clear dependent", () => {
  // 'a' drives 3, depends on 0 → driver; 'sink' driven by 3, drives 0 → dependent
  const g = { nodes: ["a","b","c","sink"].map(id=>({id})),
    edges: [{from:"a",to:"b"},{from:"a",to:"c"},{from:"a",to:"sink"},{from:"b",to:"sink"},{from:"c",to:"sink"}] };
  const m = micmac(g);
  expect(m.get("a")!.influence).toBe(3);
  expect(m.get("a")!.dependence).toBe(0);
  expect(m.get("a")!.quadrant).toBe("driver");
  expect(m.get("sink")!.quadrant).toBe("dependent");
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (degree-based; thresholds = mean)**

```ts
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
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): MICMAC influence/dependence quadrant"`

---

## Task 8: Graph barrel + `analyze()` convenience + core export

**Files:** Create `packages/core/src/graph/index.ts`; Modify `packages/core/src/index.ts`; Test `packages/core/tests/graph-analyze.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { analyze } from "../src/index.js";

it("bundles structural analysis for a map", () => {
  const g = { nodes: ["a","b","c"].map(id=>({id})), edges:[{from:"a",to:"b"},{from:"b",to:"c"}] };
  const r = analyze(g);
  expect(r.roots).toEqual(["a"]);
  expect(r.leaves).toEqual(["c"]);
  expect(r.cycles).toEqual([]);
  expect(r.layers.get("c")).toBe(2);
  expect(r.micmac.get("a")!.quadrant).toBeDefined();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement barrel**

```ts
// packages/core/src/graph/index.ts
import type { GraphInput } from "./types.js";
import { degrees, rootsAndLeaves } from "./degree.js";
import { findCycles } from "./cycles.js";
import { topoLayers } from "./layers.js";
import { communities } from "./communities.js";
import { micmac } from "./micmac.js";

export * from "./types.js";
export * from "./degree.js";
export * from "./cycles.js";
export * from "./layers.js";
export * from "./reach.js";
export * from "./communities.js";
export * from "./micmac.js";

export function analyze(g: GraphInput) {
  const { roots, leaves } = rootsAndLeaves(g);
  return {
    degrees: degrees(g),
    roots, leaves,
    cycles: findCycles(g),
    layers: topoLayers(g),
    communities: communities(g),
    micmac: micmac(g)
  };
}
```
Add to `packages/core/src/index.ts`: `export * from "./graph/index.js";`

- [ ] **Step 4: Run full core suite** — `pnpm --filter @decision-forge/core test` → all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(core): graph analyze() barrel + export"`

---

## Task 9: Persistence (main) + IPC + preload + typing

**Files:**
- Create: `packages/desktop/src/main/maps.ts`
- Modify: `packages/desktop/src/main/index.ts` (register IPC), `packages/desktop/src/main/preload.ts` (expose `maps`), `packages/desktop/src/renderer/lib/sidecar-client.ts` (`Window.api.maps` type)
- Test: `packages/desktop/tests/main/maps.test.ts`

- [ ] **Step 1: Failing test** (mirror `tests/main/scenarios.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { MapStore } from "../../src/main/maps.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "df-maps-")); });

const map = {
  id: "44444444-4444-4444-8444-444444444444", name: "m",
  createdAt: "2026-06-09T00:00:00.000Z", updatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [{ id: "11111111-1111-4111-8111-111111111111", label: "x" }], edges: []
};

describe("MapStore", () => {
  it("save → load round-trips", async () => {
    const s = new MapStore(dir);
    await s.save(map);
    expect((await s.load(map.id))?.name).toBe("m");
  });
  it("list returns id+name", async () => {
    const s = new MapStore(dir); await s.save(map);
    expect(await s.list()).toEqual([{ id: map.id, name: "m" }]);
  });
  it("load missing → null", async () => {
    expect(await new MapStore(dir).load("nope")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm --filter @decision-forge/desktop test maps`

- [ ] **Step 3: Implement `main/maps.ts`** (copy `scenarios.ts`, swap schema + dir; the `appDataOverride` is the maps dir directly in tests, so accept a dir override)

```ts
import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { DependencyMapSchema, mapsDir, type DependencyMap } from "@decision-forge/core";

export class MapStore {
  private readonly dir: string;
  // NOTE: `dirOverride` is the maps dir ITSELF (tests pass a tmp dir), unlike
  // ScenarioStore whose override is the app-data root passed to scenariosDir().
  constructor(dirOverride?: string) { this.dir = dirOverride ?? mapsDir(); }
  private async ensure() { await fs.mkdir(this.dir, { recursive: true }); }
  async save(map: DependencyMap): Promise<void> {
    const parsed = DependencyMapSchema.parse(map);
    await this.ensure();
    await fs.writeFile(path.join(this.dir, `${parsed.id}.json`), JSON.stringify(parsed, null, 2), "utf8");
  }
  async load(id: string): Promise<DependencyMap | null> {
    try { return DependencyMapSchema.parse(JSON.parse(await fs.readFile(path.join(this.dir, `${id}.json`), "utf8"))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  async list(): Promise<Array<{ id: string; name: string }>> {
    try {
      await this.ensure();
      const out: Array<{ id: string; name: string }> = [];
      for (const f of await fs.readdir(this.dir)) {
        if (!f.endsWith(".json")) continue;
        try { const m = DependencyMapSchema.parse(JSON.parse(await fs.readFile(path.join(this.dir, f), "utf8"))); out.push({ id: m.id, name: m.name }); } catch { /* skip */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  }
  async delete(id: string): Promise<void> {
    try { await fs.unlink(path.join(this.dir, `${id}.json`)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
}

let store: MapStore | null = null;
export function registerMapsIpc(dirOverride?: string): void {
  store = new MapStore(dirOverride);
  ipcMain.handle("maps:list", () => store!.list());
  ipcMain.handle("maps:load", (_e, id: string) => store!.load(id));
  ipcMain.handle("maps:save", (_e, m: DependencyMap) => store!.save(m));
  ipcMain.handle("maps:delete", (_e, id: string) => store!.delete(id));
}
```

Note: `MapStore` accepts the maps dir DIRECTLY (tests pass a tmp dir as the maps dir). This differs from `ScenarioStore` (which derives `scenariosDir(override)`); keep the direct-dir form so the test fixture is simple.

- [ ] **Step 4: Wire it up**
- `main/index.ts`: import `registerMapsIpc` and call it next to `registerScenarioIpc();` inside `app.whenReady`.
- `main/preload.ts`: add a `MapsApi` type + `const maps: MapsApi = { list:()=>ipcRenderer.invoke("maps:list"), load:(id)=>ipcRenderer.invoke("maps:load", id), save:(m)=>ipcRenderer.invoke("maps:save", m), delete:(id)=>ipcRenderer.invoke("maps:delete", id) };` and add `maps` to the `exposeInMainWorld("api", {...})` object.
- `renderer/lib/sidecar-client.ts`: in the `Window.api` interface add:
  ```ts
  maps: {
    list: () => Promise<Array<{ id: string; name: string }>>;
    load: (id: string) => Promise<unknown>;
    save: (map: unknown) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };
  ```

- [ ] **Step 5: Run test + typecheck.** `pnpm --filter @decision-forge/desktop test maps` (pass). `pnpm --filter @decision-forge/desktop build:main` (compiles).
- [ ] **Step 6: Commit** — `git commit -m "feat(desktop): DependencyMap JSON persistence + IPC"`

---

## Task 10: Renderer maps-api + add deps

**Files:** Create `packages/desktop/src/renderer/lib/maps-api.ts`; Modify `packages/desktop/package.json`

- [ ] **Step 1: Add dependencies**

```bash
cd packages/desktop
pnpm add reactflow dagre react-force-graph-3d
pnpm add -D @types/dagre
```
Expected: `reactflow`, `dagre`, `react-force-graph-3d` (and transitively `three`) in `dependencies`.

- [ ] **Step 2: Write `maps-api.ts`** (mirror `scenarios-api.ts`)

```ts
import type { DependencyMap } from "@decision-forge/core";
export const mapsApi = {
  list: () => window.api.maps.list(),
  load: (id: string) => window.api.maps.load(id) as Promise<DependencyMap | null>,
  save: (map: DependencyMap) => window.api.maps.save(map),
  delete: (id: string) => window.api.maps.delete(id)
};
```

- [ ] **Step 3: Commit** — `git commit -m "feat(desktop): maps-api + reactflow/dagre/3d-force-graph deps"`

---

## Task 11: Module scaffold + route + nav (§ IV)

**Files:**
- Create: `packages/desktop/src/renderer/pages/DependencyMap.tsx`
- Modify: `renderer/App.tsx` (route), `renderer/components/Sidebar.tsx` (nav entry), `renderer/pages/Home.tsx` (module card — follow existing pattern), `renderer/index.css` (add `--sec-depmap: #8f7ae6;` to `:root`)
- Test: `packages/desktop/tests/renderer/DependencyMap.test.tsx`

- [ ] **Step 1: Failing render test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
it("renders the § IV heading", () => {
  render(<MemoryRouter><DependencyMap /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /dependency map/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Scaffold the page** using `ModuleFrame` (see `MonteCarlo.tsx` for the idiom). Minimal v1:

```tsx
import { useState } from "react";
import { ModuleFrame } from "../components/ModuleFrame";
import type { DependencyMap as DMap } from "@decision-forge/core";

const EMPTY: DMap = {
  id: crypto.randomUUID(), name: "Untitled map",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  nodes: [], edges: []
};

export default function DependencyMap() {
  const [map, setMap] = useState<DMap>(EMPTY);
  return (
    <ModuleFrame
      section="§ IV" kicker="Consequence" title="Dependency Map" accent="var(--sec-depmap)"
      lede="Map the factors of a decision and the lines of force between them. Read the structure back: what drives what, where the loops are, what a change ripples into."
      marginalia={<div className="eyebrow">Structure</div>}
    >
      <div className="text-ink-dim">Canvas goes here ({map.nodes.length} factors)</div>
    </ModuleFrame>
  );
}
```

- [ ] **Step 4: Wire route + nav + accent + Home card**
- `App.tsx`: import + `<Route path="/dependency-map" element={<DependencyMap />} />`.
- `Sidebar.tsx`: add `{ to: "/dependency-map", roman: "IV", label: "Dependency Map", kicker: "Consequence", color: "var(--sec-depmap)" }` to `modules`.
- `index.css`: add `--sec-depmap: #8f7ae6;` under the other `--sec-*` vars.
- `Home.tsx`: add a fourth module card following the existing three (read the file; copy the card pattern for § IV).

- [ ] **Step 5: Run test + app boots** — `pnpm --filter @decision-forge/desktop test DependencyMap` passes; `pnpm --filter @decision-forge/desktop build` succeeds.
- [ ] **Step 6: Commit** — `git commit -m "feat(desktop): § IV Dependency Map page scaffold + nav"`

---

## Task 12: Capture panel — add nodes + list

**Files:** Create `renderer/pages/depmap/CapturePanel.tsx`; Modify `DependencyMap.tsx`; Test `tests/renderer/CapturePanel.test.tsx`

CapturePanel is presentational: props `{ map, onAddNode(label), selectedId, onSelect(id) }`.

- [ ] **Step 1: Failing test** — typing a label + Enter calls `onAddNode`; the node list renders labels.

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { CapturePanel } from "../../src/renderer/pages/depmap/CapturePanel";
const map = { id:"x", name:"m", createdAt:"", updatedAt:"", nodes:[{id:"a",label:"demand"}], edges:[] } as any;
it("adds a node on Enter and lists existing", () => {
  const onAddNode = vi.fn();
  render(<CapturePanel map={map} onAddNode={onAddNode} selectedId={null} onSelect={()=>{}} />);
  expect(screen.getByText("demand")).toBeInTheDocument();
  const input = screen.getByPlaceholderText(/add a factor/i);
  fireEvent.change(input, { target: { value: "supply" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onAddNode).toHaveBeenCalledWith("supply");
});
```
(Import `vi` from vitest.)

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `CapturePanel` (text input with `onKeyDown` Enter → `onAddNode(value.trim())` + clear; map nodes to a clickable list calling `onSelect`). Style with `eyebrow`/editorial classes like other panels.
- [ ] **Step 4: Wire into `DependencyMap.tsx`** — `onAddNode` appends `{ id: crypto.randomUUID(), label }` to `map.nodes` (immutably) and bumps `updatedAt`.
- [ ] **Step 5: Run test (pass).**
- [ ] **Step 6: Commit** — `git commit -m "feat(depmap): capture panel — add + list factors"`

---

## Task 13: Layered view (react-flow + dagre) with directed edges + edge creation

**Files:** Create `renderer/pages/depmap/LayeredView.tsx`, `renderer/pages/depmap/layout.ts`; Modify `DependencyMap.tsx`; Test `tests/renderer/layout.test.ts`

The pure layout helper is unit-tested; the react-flow canvas itself is exercised by the e2e (Task 18) since jsdom can't render it meaningfully.

- [ ] **Step 1: Failing test for the pure dagre layout helper**

```ts
import { describe, it, expect } from "vitest";
import { layoutPositions } from "../../src/renderer/pages/depmap/layout";
it("assigns y increasing with dependency depth", () => {
  const pos = layoutPositions(
    [{id:"a"},{id:"b"}],
    [{from:"a",to:"b"}]
  );
  expect(pos.get("b")!.y).toBeGreaterThan(pos.get("a")!.y);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `layout.ts`** using `dagre` (rankdir `"TB"`, ranksep/nodesep tuned) → returns `Map<id,{x,y}>`. Keep it a pure function over `{id}[]` + `{from,to}[]`.
- [ ] **Step 4: Implement `LayeredView.tsx`** — `reactflow` `<ReactFlow>` with `nodes`/`edges` derived from `map` + `layoutPositions`; every edge `markerEnd: { type: MarkerType.ArrowClosed }` (arrowheads always); `onConnect` → `onAddEdge(from,to)`; node click → `onSelect`. Import `reactflow/dist/style.css`. Theme nodes/edges to the dark palette (background transparent, node bg `var(--paper-raised)`, text `var(--ink)`, edge stroke `var(--ink-dim)`).
- [ ] **Step 5: Wire into page** — render `LayeredView` in the `ModuleFrame` children; `onAddEdge` appends a `DependencyEdge` (guard: no self-loop, no duplicate from+to).
- [ ] **Step 6: Run layout test (pass); `pnpm --filter @decision-forge/desktop build` succeeds.**
- [ ] **Step 7: Commit** — `git commit -m "feat(depmap): layered DAG view (react-flow + dagre) with directed edges"`

---

## Task 14: Structural rendering — cycles, roots/leaves, hover, blast-radius, hairball guard

**Files:** Create `renderer/pages/depmap/useAnalysis.ts`; Modify `LayeredView.tsx`, `DependencyMap.tsx`; Test `tests/renderer/useAnalysis.test.ts`

- [ ] **Step 1: Failing test for the memo selector**

```ts
import { renderHook } from "@testing-library/react";
import { useAnalysis } from "../../src/renderer/pages/depmap/useAnalysis";
it("derives roots/leaves/cycles from a map", () => {
  const map = { id:"x",name:"m",createdAt:"",updatedAt:"",
    nodes:[{id:"a",label:"a"},{id:"b",label:"b"}], edges:[{id:"e",from:"a",to:"b"}] } as any;
  const { result } = renderHook(() => useAnalysis(map));
  expect(result.current.roots).toContain("a");
  expect(result.current.leaves).toContain("b");
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `useAnalysis`** = `useMemo(() => analyze({ nodes: map.nodes, edges: map.edges.map(e=>({from:e.from,to:e.to})) }), [map])`, plus a `cycleEdgeIds` set derived from `findCycles` (edges whose both endpoints are in the same returned SCC).
- [ ] **Step 4: Apply to `LayeredView`** (visual; covered by e2e): cycle edges/nodes stroked `var(--sec-nego)`; root nodes ringed citron, leaves sage; on node **hover** dim non-neighbours (ego-highlight); on node **click/select** highlight `reachDownstream` (accent) + `reachUpstream` (ink-dim) and dim the rest; when `map.nodes.length > 20` show a small "getting dense — select a node to focus" notice.
- [ ] **Step 5: Run hook test (pass).**
- [ ] **Step 6: Commit** — `git commit -m "feat(depmap): structural rendering — cycles, roots/leaves, ego-highlight, blast-radius"`

---

## Task 15: Structure panel — counts + MICMAC mini-quadrant + selection readout

**Files:** Create `renderer/pages/depmap/StructurePanel.tsx`; Modify `DependencyMap.tsx`; Test `tests/renderer/StructurePanel.test.tsx`

- [ ] **Step 1: Failing test** — given a map + selectedId, renders node/edge/cycle counts and "affects N / depends on M".

```tsx
import { render, screen } from "@testing-library/react";
import { StructurePanel } from "../../src/renderer/pages/depmap/StructurePanel";
const map = { id:"x",name:"m",createdAt:"",updatedAt:"",
  nodes:[{id:"a",label:"a"},{id:"b",label:"b"},{id:"c",label:"c"}],
  edges:[{id:"1",from:"a",to:"b"},{id:"2",from:"b",to:"c"}] } as any;
it("shows counts and selection reach", () => {
  render(<StructurePanel map={map} selectedId="a" />);
  expect(screen.getByText(/nodes/i)).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();          // node count
  expect(screen.getByText(/affects/i)).toBeInTheDocument();   // a → b,c downstream = 2
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `StructurePanel`** consuming `useAnalysis` (counts: nodes, edges, cycles ⚠ in vermilion, roots, leaves) + a tiny SVG MICMAC scatter (influence x, dependence y, four quadrants) + when `selectedId`, "affects {reachDownstream.size} downstream · depends on {reachUpstream.size}". Plain language, no raw metric jargon as headline.
- [ ] **Step 4: Wire as `ModuleFrame` `marginalia`.**
- [ ] **Step 5: Run test (pass).**
- [ ] **Step 6: Commit** — `git commit -m "feat(depmap): structure panel + MICMAC mini-quadrant"`

---

## Task 16: 3D constellation overview (lazy-loaded toggle)

**Files:** Create `renderer/pages/depmap/ConstellationView.tsx`; Modify `DependencyMap.tsx`; (no new unit test — exercised by e2e Task 18)

- [ ] **Step 1: Implement `ConstellationView`** wrapping `react-force-graph-3d`: `graphData = { nodes: map.nodes.map(n=>({id:n.id,name:n.label})), links: map.edges.map(e=>({source:e.from,target:e.to})) }`; `linkDirectionalArrowLength` set (arrowheads); `nodeColor` by role (root citron / leaf sage / cycle vermilion / else iris); on node click → `onSelect`; `linkColor`/opacity fades non-neighbours of the selected node (depth-fade). Dark background `#0d0c0a`.
- [ ] **Step 2: Lazy-load + toggle** in `DependencyMap.tsx`:
  ```tsx
  const ConstellationView = lazy(() => import("./depmap/ConstellationView"));
  // a [Layered | 3D] toggle in the header; render <Suspense fallback>…</Suspense> when 3D active
  ```
- [ ] **Step 3: Build + smoke** — `pnpm --filter @decision-forge/desktop build` succeeds; manually toggling shows the 3D cloud (verified in e2e).
- [ ] **Step 4: Commit** — `git commit -m "feat(depmap): 3D constellation overview (lazy-loaded toggle)"`

---

## Task 17: Persistence wiring — new / save / open

**Files:** Modify `DependencyMap.tsx`; Test extends `tests/renderer/DependencyMap.test.tsx` (mock `window.api.maps`)

- [ ] **Step 1: Failing test** — clicking "Save" calls `window.api.maps.save` with the current map. Mock `window.api = { maps: { save: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]), load: vi.fn(), delete: vi.fn() } } as any` in the test.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** a small header bar: editable `name`, **Save** (`mapsApi.save(map)`), **Open** (list via `mapsApi.list()`, load via `mapsApi.load(id)`), **New** (reset to a fresh `EMPTY`). Bump `updatedAt` on save.
- [ ] **Step 4: Run test (pass).**
- [ ] **Step 5: Commit** — `git commit -m "feat(depmap): map persistence wiring (new/save/open)"`

---

## Task 18: E2E + docs + final sweep

**Files:** Create `packages/desktop/tests/e2e/depmap.spec.ts`; Modify `README.md`, `ROADMAP.md`

- [ ] **Step 1: Write e2e** (reuse `_env.ts`; pattern from `mc.spec.ts`)

```ts
import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

test("build a dependency map: add factors, connect, flag a cycle, toggle 3D", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-dep-e2e-"));
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: e2eEnv({ HOME: tmpHome, DECISION_FORGE_DB_PATH: path.join(tmpHome, "f.db") })
  });
  try {
    const w = await app.firstWindow();
    await w.waitForLoadState("domcontentloaded");
    await w.getByRole("link", { name: /dependency map/i }).first().click();
    await expect(w.getByRole("heading", { name: /dependency map/i })).toBeVisible();
    const add = w.getByPlaceholder(/add a factor/i);
    for (const label of ["demand", "price", "margin"]) { await add.fill(label); await add.press("Enter"); }
    await expect(w.getByText("demand")).toBeVisible();
    await expect(w.getByText("margin")).toBeVisible();
    // toggle to 3D and back
    await w.getByRole("button", { name: /3d|constellation/i }).click();
    await w.getByRole("button", { name: /layered/i }).click();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
```
(Edge creation via react-flow drag is hard to drive reliably in Playwright; assert node capture + view toggle. If a click-source-then-target edge affordance exists, add an assertion that connecting two factors then shows a cycle flag.)

- [ ] **Step 2: Build, run full e2e** — `cd packages/desktop && pnpm build && unset ELECTRON_RUN_AS_NODE && npx playwright test depmap` → pass; then run the whole suite to confirm no regressions.
- [ ] **Step 3: Update docs**
- `README.md`: add `DependencyMap.tsx` / § IV to the `packages/` description; note the new deps.
- `ROADMAP.md`: add a "Plan 5 — Dependency Map (§ IV)" section marking v1 shipped and listing the v1.1 deferral (objective/controllability/uncertainty flags, edge sign, Decision Readout, DEMATEL-lite, MC/Forecast hand-off).
- [ ] **Step 4: Run core + desktop unit + e2e once more.** All green.
- [ ] **Step 5: Commit** — `git commit -m "test(depmap): e2e + docs for § IV Dependency Map"`

---

## Definition of Done (v1)
- Core: schema + 7 graph functions + `analyze()`, all unit-tested green.
- Persistence: JSON-per-map, round-trip tested, IPC wired.
- UI: § IV in nav/Home/route; capture panel; layered DAG with directed edges, cycle/root/leaf rendering, hover ego-highlight, click blast-radius, hairball notice; structure panel + MICMAC; 3D constellation toggle (lazy); new/save/open.
- E2E green; full suite green; `tsc` clean; README + ROADMAP updated.
- No v1.1 semantics implemented, but schema fields reserved (no migration needed later).
