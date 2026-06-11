# Dependency Map Redesign (v1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the second-round usability feedback on § IV Dependency Map and add the Decision Readout — the plain-English "Act first / Resolve next / Plan around" output that answers "what's the outcome?"

**Architecture:** Pure analysis additions (`loops`, `readout`) go in `@decision-forge/core` behind the existing `GraphInput` shape. The canvas rework swaps react-flow's default nodes for a custom `FactorNode` (Easy Connect: body = move, border = connect) and adds gesture handlers in `LayeredView`. New `ReadoutPanel` renders core's readout in the marginalia. Schema gains node `role` + edge `confidence` (both optional → no migration).

**Tech Stack:** TypeScript, zod, react-flow 11, dagre, react-force-graph-3d + three-spritetext, vitest + RTL, playwright.

**Spec:** `docs/superpowers/specs/2026-06-09-dependency-map-redesign.md`
**Worktree:** `/Users/alexnelja/projects/decision-forge/.worktrees/dependency-map` (branch `feat/dependency-map`, PR #12). Run all commands from the worktree root.

**Test commands:**
- core: `pnpm --filter @decision-forge/core test`
- desktop unit: `pnpm --filter @decision-forge/desktop test`
- e2e: `pnpm --filter @decision-forge/desktop test:e2e`
- typecheck: `pnpm --filter @decision-forge/core build && npx tsc -p packages/desktop --noEmit` (4 pre-existing errors allowed; zero NEW)

---

### Task 1: Schema — node `role`, edge `confidence`, drop reserved trio

**Files:**
- Modify: `packages/core/src/schemas/dependency-map.ts`
- Test: `packages/core/tests/dependency-map.test.ts`

- [ ] **Step 1: Write failing tests** — in `dependency-map.test.ts`, replace the reserved-field usage (line ~31 uses `type`/`controllability`/`uncertainty`) and add:

```ts
// NOTE: the existing file defines `base` as a shared object literal — convert
// it to a factory `base()` returning a fresh map per call, or these mutations
// leak state across tests.
it("accepts role on nodes and sign/confidence on edges", () => {
  const m = base();
  m.nodes[0]!.role = "objective";
  m.nodes[1]!.role = "lever";
  m.edges[0]!.sign = "-";
  m.edges[0]!.confidence = "assumption";
  expect(DependencyMapSchema.safeParse(m).success).toBe(true);
});

it("rejects unknown role", () => {
  const m = base();
  (m.nodes[0] as any).role = "wildcard";
  expect(DependencyMapSchema.safeParse(m).success).toBe(false);
});

it("no longer accepts the reserved v1.1 trio as typed fields", () => {
  // zod objects are non-strict: unknown keys are stripped, not rejected.
  const m = base();
  (m.nodes[0] as any).controllability = "control";
  const parsed = DependencyMapSchema.parse(m);
  expect((parsed.nodes[0] as any).controllability).toBeUndefined();
});
```

- [ ] **Step 2: Run** `pnpm --filter @decision-forge/core test` → FAIL (role not in schema / trio still parsed).

- [ ] **Step 3: Implement** — in `dependency-map.ts`, replace lines 14–17 (the reserved trio) with:

```ts
/** v1.5 — drives the Decision Readout. Absent ≡ "factor". */
role: z.enum(["objective", "lever", "uncertainty", "factor"]).optional()
```

and add to `DependencyEdgeSchema` after `sign`:

```ts
confidence: z.enum(["known", "assumption"]).optional() // absent ≡ "known"
```

- [ ] **Step 4: Run** core tests → PASS. Rebuild: `pnpm --filter @decision-forge/core build`.

- [ ] **Step 5: Commit** `feat(core): node role + edge confidence; drop unused reserved fields`

---

### Task 2: Core — loop classification (`loops.ts`)

**Files:**
- Create: `packages/core/src/graph/loops.ts`
- Modify: `packages/core/src/graph/index.ts` (add `export * from "./loops.js";`)
- Test: `packages/core/tests/graph-loops.test.ts`

Signed graph input extends `GraphInput`: edges may carry `sign?: "+" | "-"`.

- [ ] **Step 1: Write failing tests** (`graph-loops.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { classifyLoops, loopValence } from "../src/graph/loops.js";

const n = (...ids: string[]) => ids.map((id) => ({ id }));

describe("classifyLoops", () => {
  it("all-positive cycle is reinforcing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a" }, // unsigned counts as +
    ]};
    expect(classifyLoops(g)).toEqual([{ nodes: expect.arrayContaining(["a", "b"]), class: "reinforcing" }]);
  });

  it("odd number of minus edges is balancing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "-" as const },
      { from: "b", to: "a", sign: "+" as const },
    ]};
    expect(classifyLoops(g)[0]!.class).toBe("balancing");
  });

  it("two minus edges is reinforcing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "-" as const },
      { from: "b", to: "a", sign: "-" as const },
    ]};
    expect(classifyLoops(g)[0]!.class).toBe("reinforcing");
  });

  it("acyclic graph yields no loops", () => {
    expect(classifyLoops({ nodes: n("a", "b"), edges: [{ from: "a", to: "b" }] })).toEqual([]);
  });
});

describe("loopValence", () => {
  it("reinforcing loop with + path to objective is virtuous", () => {
    const g = { nodes: n("a", "b", "obj"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
      { from: "b", to: "obj", sign: "+" as const },
    ]};
    expect(loopValence(["a", "b"], g, "obj")).toBe("virtuous");
  });

  it("negative path to objective is vicious", () => {
    const g = { nodes: n("a", "b", "obj"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
      { from: "b", to: "obj", sign: "-" as const },
    ]};
    expect(loopValence(["a", "b"], g, "obj")).toBe("vicious");
  });

  it("no path or no objective → undefined", () => {
    const g = { nodes: n("a", "b", "x"), edges: [
      { from: "a", to: "b" }, { from: "b", to: "a" },
    ]};
    expect(loopValence(["a", "b"], g, "x")).toBeUndefined();
    expect(loopValence(["a", "b"], g, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/core/src/graph/loops.ts`:

```ts
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
```

Add `export * from "./loops.js";` to `packages/core/src/graph/index.ts`.

- [ ] **Step 4: Run** core tests → PASS. **Step 5: Commit** `feat(core): loop classification (reinforcing/balancing) + valence vs objective`

---

### Task 3: Core — Decision Readout (`readout.ts`)

**Files:**
- Create: `packages/core/src/graph/readout.ts`
- Modify: `packages/core/src/graph/index.ts`
- Test: `packages/core/tests/graph-readout.test.ts`

- [ ] **Step 1: Write failing tests.** Build maps with the schema shape (`nodes: [{id, label, role?}]`, `edges: [{id, from, to, sign?}]`); uuids via `crypto.randomUUID()`. Cover:
  1. **guidance when no roles**: `decisionReadout(map).guidance` non-null; `actFirst`/`resolveNext` empty; loops still listed in `planAround`.
  2. **actFirst ranking**: two levers, one with bigger downstream reach ranks first; reason mentions count (e.g. `"drives 3 factors"`) and appends `"→ reaches the objective"` when the objective is in its downstream set.
  3. **resolveNext**: uncertainties ranked by downstream reach, reason `"N factors hang on this"`.
  4. **planAround / loop**: a signed 2-cycle appears as `{ kind: "loop", class: ... }`, vicious loops sorted before plain ones.
  5. **planAround / external**: a `factor` root with ≥2 downstream and no lever upstream appears as `{ kind: "external" }`.
  6. **top-3 cap** per section.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `packages/core/src/graph/readout.ts`:

```ts
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
  const g = { nodes: map.nodes, edges: map.edges.map((e) => ({ from: e.from, to: e.to, sign: e.sign })) };
  const objective = map.nodes.find((n) => n.role === "objective");
  const levers = map.nodes.filter((n) => n.role === "lever");
  const uncertainties = map.nodes.filter((n) => n.role === "uncertainty");
  const anyRole = map.nodes.some((n) => n.role && n.role !== "factor");

  const down = new Map(map.nodes.map((n) => [n.id, reachDownstream(g, n.id)]));

  const rank = (ns: typeof map.nodes) =>
    [...ns].sort((a, b) => (down.get(b.id)!.size - down.get(a.id)!.size)).slice(0, TOP);

  const actFirst = rank(levers).map((n) => {
    const d = down.get(n.id)!;
    const hitsObjective = objective ? d.has(objective.id) : false;
    return { nodeId: n.id, reason: `drives ${d.size} factor${d.size === 1 ? "" : "s"}${hitsObjective ? " → reaches the objective" : ""}` };
  });

  const resolveNext = rank(uncertainties).map((n) => {
    const d = down.get(n.id)!;
    return { nodeId: n.id, reason: `${d.size} factor${d.size === 1 ? "" : "s"} hang on this` };
  });

  // Loops, vicious first, then reinforcing, then balancing.
  const loops: PlanAroundItem[] = classifyLoops(g).map((l) => ({
    kind: "loop" as const, nodes: l.nodes, class: l.class,
    valence: l.class === "reinforcing" ? loopValence(l.nodes, g, objective?.id) : undefined,
  }));
  loops.sort((a, b) => loopWeight(b) - loopWeight(a));

  // External pressures: factors with real downstream and no lever upstream.
  const leverIds = new Set(levers.map((l) => l.id));
  const externals: PlanAroundItem[] = map.nodes
    .filter((n) => (!n.role || n.role === "factor") && down.get(n.id)!.size >= 2)
    .filter((n) => ![...reachUpstream(g, n.id)].some((u) => leverIds.has(u)))
    .sort((a, b) => down.get(b.id)!.size - down.get(a.id)!.size)
    .slice(0, TOP)
    .map((n) => ({ kind: "external" as const, nodeId: n.id, reason: `outside your control — drives ${down.get(n.id)!.size} factors` }));

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
  return 1;
}
```

Add `export * from "./readout.js";` to `graph/index.ts`.

- [ ] **Step 4: Run** core tests → PASS. Build core. **Step 5: Commit** `feat(core): decisionReadout — act first / resolve next / plan around`

---

### Task 4: Tidy fix (root cause)

**Files:**
- Modify: `packages/desktop/src/renderer/pages/depmap/LayeredView.tsx:324-327` (`handleTidy`)
- Test: `packages/desktop/tests/renderer/DependencyMap.test.tsx`

Root cause: Tidy persists dagre positions to the map, but the structural-sync
effect is keyed on topology only, so rfNodes never re-read positions.

- [ ] **Step 1: Failing test** — render the map page, add ≥2 nodes (use existing test helpers in `DependencyMap.test.tsx`), drag is hard in RTL so instead: assert that clicking the Tidy button calls through and the react-flow node positions equal `layoutPositions(...)` output. Practical RTL approach: mock `./layout` (`vi.mock`) so `layoutPositions` returns **different positions per call** (e.g. a counter: first call `{x: 111, y: 222}`, second `{x: 333, y: 444}`) — a fixed mock would pass pre-fix, because freshly added nodes have no saved position and the structural sync already falls back to the mocked dagre output on first render. Click Tidy, then assert the rf node wrapper transform contains the *second-call* coordinate (`333`). Verify it FAILS against current code.

- [ ] **Step 2: Implement** — in `handleTidy`, apply positions to rfNodes directly as well as persisting:

```ts
const handleTidy = useCallback(() => {
  const positions = layoutPositions(map.nodes, map.edges);
  setRfNodes((nds) =>
    nds.map((n) => {
      const pos = positions.get(n.id);
      return pos ? { ...n, position: pos } : n;
    })
  );
  onRelayout(positions);
  setTimeout(() => fitView({ padding: 0.2 }), 50);
}, [map.nodes, map.edges, onRelayout, setRfNodes, fitView]);
```

- [ ] **Step 3: Run** `pnpm --filter @decision-forge/desktop test` → PASS (all 73+1).
- [ ] **Step 4: Commit** `fix(depmap): Tidy actually re-lays-out — apply dagre positions to rendered nodes`

---

### Task 5: FactorNode + canvas gestures (Easy Connect)

**Files:**
- Create: `packages/desktop/src/renderer/pages/depmap/FactorNode.tsx`
- Modify: `packages/desktop/src/renderer/pages/depmap/LayeredView.tsx` (nodeTypes, dbl-click, onConnectEnd, context menu)
- Modify: `packages/desktop/src/renderer/pages/DependencyMap.tsx` (handlers: add-at-position, duplicate, rename, role)
- Create: `packages/desktop/src/renderer/pages/depmap/ContextMenu.tsx`
- Test: `packages/desktop/tests/renderer/DependencyMap.test.tsx` (extend)

Gestures (spec §3): body = move / border = connect (full-perimeter handles);
double-click pane → node in rename mode; drag border → empty pane → new
connected node in rename mode; double-click node → inline rename; hover
toolbar ⧉/🗑; right-click context menus; ⌘D duplicate; marquee select;
empty-state hint.

- [ ] **Step 1: Failing tests** (one `describe` per gesture, RTL + `fireEvent`):
  - double-click on `.react-flow__pane` → a new node appears with an `<input>` focused (rename mode); typing + Enter commits the label.
  - new handlers in `DependencyMap.tsx`: `handleAddNodeAt(label, pos)` stores position; `handleDuplicateNode(id)` clones label+role with `(copy)` suffix and offset position; `handleRenameNode(id, label)`.
  - FactorNode renders role glyph (◎/◆/?) from `data.role`.
  - hover toolbar: duplicate + delete buttons fire callbacks.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement FactorNode** — key structure:

```tsx
// FactorNode.tsx — custom react-flow node. Body = move, border ring = connect.
import { Handle, Position, type NodeProps } from "reactflow";

const GLYPH: Record<string, string> = { objective: "◎", lever: "◆", uncertainty: "?" };

export function FactorNode({ id, data, selected }: NodeProps<FactorNodeData>) {
  // data: { label, role?, renaming?, glow flags (cycle/root/leaf/dim…),
  //         onRename(id,label), onCancelRename(id), onDuplicate(id), onDelete(id) }
  // - 4 source handles (Top/Right/Bottom/Left) styled as one perimeter ring
  //   (absolute inset:-8px, transparent, crosshair cursor) + 1 target handle
  //   covering the node so any drop on the node connects.
  // - hover state → mini-toolbar <div class="nodrag"> with ⧉ 🗑 buttons.
  // - data.renaming → <input autoFocus class="nodrag"> Enter=commit Esc=cancel.
  // - visual flags reproduce the existing style-effect (selection ring,
  //   cycle glow, root/leaf rings, opacity dim) — the style effect in
  //   LayeredView now only computes flags into node.data, no inline styles.
}
```

  In `LayeredView`: `const nodeTypes = { factor: FactorNode }` (module-level
  constant — react-flow warns on inline), nodes get `type: "factor"`, style
  effect rewritten to set `data` flags instead of `style`. Add:

```ts
// reactflow 11 has NO onPaneDoubleClick prop: wire via onDoubleClick on the
// wrapper div, only acting when (e.target as Element).closest(".react-flow__pane")
// hits, AND set zoomOnDoubleClick={false} or dbl-click zooms instead.
const handlePaneDoubleClick = (e: React.MouseEvent) => {
  const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
  onAddNodeAt("", pos); // empty label → renaming mode until committed
};
// v11 onConnectEnd receives ONLY the event (the connectionState param is v12).
// Capture the source in onConnectStart via a ref; clear it in handleConnect.
const handleConnectEnd = (event: MouseEvent | TouchEvent) => {
  if (!didConnectRef.current && connectStartRef.current) {
    const { clientX, clientY } = "touches" in event ? event.changedTouches[0]! : event;
    const pos = screenToFlowPosition({ x: clientX, y: clientY });
    onAddConnectedNodeAt(connectStartRef.current, pos); // node + edge, renaming
  }
};
```

  Empty-state hint: when `map.nodes.length === 0`, absolutely-centred faint
  text `Double-click to add your first factor.`
  ⌘D: `onKeyDown` on the wrapper (`metaKey||ctrlKey`+`d`, preventDefault) duplicates selection.
  Marquee: `selectionOnDrag` + `panOnDrag={[1, 2]}` (left-drag selects, middle/right pans) — and `panOnScroll`.

- [ ] **Step 4: Implement DependencyMap.tsx handlers** — `handleAddNodeAt`,
  `handleAddConnectedNodeAt`, `handleDuplicateNode`, `handleRenameNode`
  (commit empty label on a *new* node → delete it instead), `handleSetRole`.
  Renaming state: `renamingId: string | null` lives in `DependencyMap` and is
  passed down through node `data`.
- [ ] **Step 5: ContextMenu.tsx** — fixed-position menu from
  `onNodeContextMenu` / `onEdgeContextMenu` / `onPaneContextMenu`. Node:
  Rename · Duplicate · Role ▸ (Factor/◎ Objective/◆ Lever/? Uncertainty) ·
  Delete. Pane: Add node here · Tidy. (Edge items wired in Task 6.)
- [ ] **Step 6: Run desktop tests → PASS; `npx tsc -p packages/desktop --noEmit` zero new.**
- [ ] **Step 7: Commit** `feat(depmap): FactorNode — easy-connect, on-canvas add/rename/duplicate, context menus`

---

### Task 6: Edge editing + polarity/confidence visuals

**Files:**
- Create: `packages/desktop/src/renderer/pages/depmap/EdgeToolbar.tsx`
- Create: `packages/desktop/src/renderer/pages/depmap/edge-style.ts`
- Modify: `LayeredView.tsx`, `DependencyMap.tsx` (edge handlers), `ContextMenu.tsx` (edge menu)
- Test: extend `DependencyMap.test.tsx` + new `packages/desktop/tests/renderer/edge-style.test.ts`

- [ ] **Step 1: Failing tests:**
  - `edge-style.test.ts` — pure fn `edgeVisual(edge, {isCycle, dimmed})` →
    `{ stroke, strokeDasharray?, strokeWidth }`: `+`→`var(--plus)`,
    `-`→`var(--minus)`, none→`var(--ink-dim)`; `assumption`→`strokeDasharray: "6 4"`;
    cycle→`strokeWidth: 2.5` + glow filter id (NOT a hue change).
  - handlers in `DependencyMap.tsx`: `handleFlipEdge` swaps from/to (and
    refuses if reversed edge already exists), `handleCycleEdgeSign`
    (undefined→"+"→"-"→undefined), `handleToggleEdgeConfidence`.
  - EdgeToolbar renders at selected edge and fires all four callbacks.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `edge-style.ts` pure module (used by both 2D
  edge objects and Task 8's 3D links). Add CSS tokens to
  `packages/desktop/src/renderer/index.css`: `--plus: #6fa88a; --minus: #e8582b;`.
  In `LayeredView`, the edge-building code calls `edgeVisual()`; selected edge
  (react-flow `onEdgeClick` → `selectedEdgeId`) shows `<EdgeToolbar>`
  positioned at edge midpoint (compute from the two node positions, render in
  a `<Panel>`/absolute overlay): `⇄` flip · `±` sign · `▰/▱` confidence ·
  `🗑` delete, each with `title` tooltip.
  Endpoint re-point: `onEdgeUpdate={(oldEdge, conn) => onRepointEdge(oldEdge.id, conn)}`
  + `onEdgeUpdateStart/End` so releasing on empty space restores (react-flow
  default keeps edge if handler doesn't fire — verify no silent unbind).
- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit** `feat(depmap): editable connectors — flip/sign/confidence/re-point; polarity colours, assumption dashes`

---

### Task 7: Decision Readout panel + role UX + loop badges

**Files:**
- Create: `packages/desktop/src/renderer/pages/depmap/ReadoutPanel.tsx`
- Modify: `packages/desktop/src/renderer/pages/depmap/NodeInspector.tsx` (role radio row)
- Modify: `DependencyMap.tsx` (mount ReadoutPanel above StructurePanel; pass readout)
- Modify: `useAnalysis.ts` (memoise `decisionReadout` + `classifyLoops` alongside existing analysis)
- Modify: `LayeredView.tsx` (loop badges overlay)
- Test: `packages/desktop/tests/renderer/ReadoutPanel.test.tsx`, extend NodeInspector tests

- [ ] **Step 1: Failing tests:**
  - ReadoutPanel shows guidance copy when map has no roles.
  - With roles set: renders ACT FIRST row with lever label + reason; RESOLVE
    NEXT with uncertainty; PLAN AROUND with `⟳ reinforcing` loop naming the
    node labels; clicking a row calls `onSelect(nodeId)`.
  - NodeInspector: role radio (Factor/Objective/Lever/Uncertainty) fires
    `onUpdate(id, { role })` — widen the patch type at `NodeInspector.tsx:13`
    from `{ label?: string; note?: string }` to include `role`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** ReadoutPanel header `DECISION READOUT` in the
  existing marginalia eyebrow style; three labelled sections; glyphs ◎◆?⟳;
  rows are `<button>`s (keyboard accessible). Loop badge overlay in
  LayeredView: for each classified loop, place
  `⟳ reinforcing` / `⇋ balancing` (or `vicious`/`virtuous`) at the centroid
  of the loop's node positions, `pointerEvents: none`.
- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit** `feat(depmap): Decision Readout — act first / resolve next / plan around + role assignment + loop badges`

---

### Task 8: Chrome — icons, collapsible Contents nav, 3D labels

**Files:**
- Modify: `DependencyMap.tsx` (icon buttons), `LayeredView.tsx` (Tidy icon)
- Modify: `packages/desktop/src/renderer/components/Sidebar.tsx`
- Modify: `packages/desktop/src/renderer/pages/depmap/ConstellationView.tsx`
- Modify: `packages/desktop/package.json` (`three-spritetext`)
- Test: extend `DependencyMap.test.tsx`; new `packages/desktop/tests/renderer/Sidebar.test.tsx`

- [ ] **Step 1: Failing tests:** header buttons exist by `aria-label`
  ("Save map", "Open map", "New map", "Layered view", "3D view", "Tidy
  layout") with `title` tooltips and no visible text label; Sidebar: unpin
  → collapses to rail (nav links hidden), hover → reveals, pin state read
  from/written to `localStorage("df.sidebar.pinned")`, default pinned.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Inline 16px SVGs (stroke `currentColor`,
  strokeWidth 1.5 — matches the engraving aesthetic): floppy/save, folder,
  plus, layers, cube/hex, grid for Tidy. Sidebar collapse mirrors the
  capture-panel pin/rail pattern from `DependencyMap.tsx:314-384` (14px rail,
  vertical "Contents" label, hover reveal, ●/○ pin) — extract nothing yet
  (two uses, not three; YAGNI).
  3D: `pnpm --filter @decision-forge/desktop add three-spritetext`; in
  ConstellationView add `nodeThreeObject` returning a `SpriteText(label)`
  (`textHeight 4`, color `#f1ece0`, `material.depthWrite = false`) and
  `nodeThreeObjectExtend` so the sphere stays; link colour/dash from
  `edge-style.ts` mapping (`linkColor`, `linkLineDash` for assumptions).
- [ ] **Step 4: Run desktop tests → PASS.** (3D remains untested in unit —
  jsdom can't WebGL; e2e smoke covers the toggle.)
- [ ] **Step 5: Commit** `feat(depmap): icon chrome, collapsible contents nav, 3D node labels + styled links`

---

### Task 9: e2e sweep + PR update

**Files:**
- Modify: `packages/desktop/tests/e2e/depmap.spec.ts`
- Modify: `README.md` / `ROADMAP.md` (redesign shipped), PR #12 description

- [ ] **Step 1: New e2e scenario** (extends existing 7): launch app →
  double-click canvas → type label, Enter → drag from node border to empty
  space → name the connected node → right-click first node → set role
  Objective → set second to Lever → readout shows ACT FIRST row → click edge,
  cycle sign to "−" (edge turns `--minus` colour) → Tidy (positions change) →
  Save → New → Open → roles, sign, positions survive.
- [ ] **Step 2: Run** `pnpm --filter @decision-forge/desktop test:e2e` → all pass.
- [ ] **Step 3: Full suite** — core + desktop + e2e + tsc zero-new.
- [ ] **Step 4: Update** ROADMAP/redesign-notes doc (mark addressed), push,
  update PR #12 description (use pr-description skill).
- [ ] **Step 5: Commit + push** `docs: dependency-map redesign shipped — notes + roadmap`

---

## Verification checklist (after all tasks)

- [ ] All 8 second-round feedback items addressed: Tidy ✓(T4), editable
  connectors ✓(T6), double-click add ✓(T5), on-map block actions ✓(T5),
  icons ✓(T8), 3D labels ✓(T8), global Contents nav ✓(T8), outcome/readout ✓(T7).
- [ ] No regression: 58 core + 73 desktop + 7 e2e all green, plus new tests.
- [ ] `tsc` zero new errors.
- [ ] Manual smoke in the full Electron app (Alex preference — never browser-only).
