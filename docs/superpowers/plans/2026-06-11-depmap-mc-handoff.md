# § IV → § I Monte Carlo Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "→ Simulate" on a § IV uncertainty node creates a linked, persisted MC variable that § I edits write back to the map, with the node showing its p10·p50·p90 range.

**Architecture:** The map file is the single source of truth (`node.mc` block); a renderer-global `mc-link-store` (mirroring the existing BATNA `mc-store` pattern) signals § I which map-linked variables to display; § I edits write through via the existing `mapsApi`. No backend changes.

**Tech Stack:** TypeScript, zod, React 18, react-router (HashRouter), existing client-side samplers (`mc-client-samplers`/`mc-percentile`), vitest + RTL, playwright.

**Spec:** `docs/superpowers/specs/2026-06-11-depmap-mc-handoff-design.md`
**Worktree:** `/Users/alexnelja/projects/decision-forge/.worktrees/dependency-map` (branch `feat/depmap-mc-handoff`). All commands from worktree root.

**Test commands:**
- core: `pnpm --filter @decision-forge/core test` (77 pass today)
- desktop: `pnpm --filter @decision-forge/desktop test` (241 pass today)
- e2e: `pnpm --filter @decision-forge/desktop test:e2e` (8 pass today)
- typecheck: `pnpm --filter @decision-forge/core build && npx tsc -p packages/desktop --noEmit` (exactly 4 pre-existing errors allowed: nego-api.ts ×2, mc.spec.ts ×2)

**Conventions that bind every task:** TDD (see each test FAIL before implementing). Handlers in `DependencyMap.tsx` are `useCallback([])` with functional `setMap` updaters — keep that. Optional schema keys are REMOVED, not set undefined (destructure pattern, see `handleCycleEdgeSign`). jsdom react-flow rendering uses `tests/renderer/helpers/reactflow-jsdom.ts`.

---

### Task 1: Core — `mc` block on the node schema + `mcVarName` helper

**Files:**
- Modify: `packages/core/src/schemas/dependency-map.ts`
- Create: `packages/core/src/lib/mc-link.ts`
- Modify: `packages/core/src/index.ts` (or wherever schemas/graph are re-exported — check and add `export * from "./lib/mc-link.js";`)
- Test: `packages/core/tests/dependency-map.test.ts` (extend), `packages/core/tests/mc-link.test.ts` (new)

- [ ] **Step 1: Failing schema tests** (extend `dependency-map.test.ts`; `base()` is a factory):

```ts
it("accepts an mc block on a node and round-trips it", () => {
  const m = base();
  m.nodes[0]!.mc = {
    varName: "transnet_tender",
    distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
    summary: { p10: 14, p50: 26, p90: 44, mean: 27.5, definedAt: "2026-06-11T12:00:00Z" }
  };
  const parsed = DependencyMapSchema.parse(m);
  expect(parsed.nodes[0]!.mc?.varName).toBe("transnet_tender");
});

it("rejects an mc block with an invalid varName", () => {
  const m = base();
  (m.nodes[0] as any).mc = {
    varName: "3rd_party", // must start with a letter
    distribution: { kind: "triangular", min: 0, mode: 0, max: 0 }
  };
  expect(DependencyMapSchema.safeParse(m).success).toBe(false);
});

it("mc block is optional and absent by default", () => {
  const parsed = DependencyMapSchema.parse(base());
  expect("mc" in parsed.nodes[0]!).toBe(false);
});
```

- [ ] **Step 2: Run** `pnpm --filter @decision-forge/core test` → FAIL (mc stripped / no such field).

- [ ] **Step 3: Implement schema** — in `dependency-map.ts`, import the distribution schema and add to `DependencyNodeSchema` after `role`:

```ts
import { DistributionSchema } from "./mc-config.js"; // same package, no cycle: mc-config imports nothing from here

  /** § IV → § I Monte Carlo link (v1.6). Only meaningful on role="uncertainty";
   *  schema stays permissive — the UI enforces the role restriction. */
  mc: z.object({
    /** Identifier used in § I formulas — must satisfy MCVariableSchema.name. */
    varName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    distribution: DistributionSchema,
    /** Derived from `distribution` on every edit (client-side sampling). */
    summary: z.object({
      p10: z.number(), p50: z.number(), p90: z.number(), mean: z.number(),
      definedAt: iso
    }).optional()
  }).optional()
```

- [ ] **Step 4: Failing helper tests** (`mc-link.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { mcVarName, isUnconfiguredDistribution } from "../src/lib/mc-link.js";

describe("mcVarName", () => {
  it("slugifies a label", () => expect(mcVarName("Transnet tender", new Set())).toBe("transnet_tender"));
  it("prepends v_ when the label starts with a non-letter", () =>
    expect(mcVarName("3rd party risk", new Set())).toBe("v_3rd_party_risk"));
  it("strips symbols and collapses runs", () =>
    expect(mcVarName("Rooibos — price/kg (net)", new Set())).toBe("rooibos_price_kg_net"));
  it("dedups with _2, _3 …", () => {
    const taken = new Set(["demand", "demand_2"]);
    expect(mcVarName("Demand", taken)).toBe("demand_3");
  });
  it("falls back to v_ for an all-symbol label", () =>
    expect(mcVarName("???", new Set())).toMatch(/^v_?/));
  it("always satisfies the MCVariable name regex", () => {
    for (const label of ["3rd", "—", "a b", "_x", "9", "Ünïcode label"])
      expect(mcVarName(label, new Set())).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });
});

describe("isUnconfiguredDistribution", () => {
  it("true for the all-zero triangular seed", () =>
    expect(isUnconfiguredDistribution({ kind: "triangular", min: 0, mode: 0, max: 0 })).toBe(true));
  it("false once any parameter is set", () =>
    expect(isUnconfiguredDistribution({ kind: "triangular", min: 0, mode: 5, max: 10 })).toBe(false));
  it("false for non-triangular kinds", () =>
    expect(isUnconfiguredDistribution({ kind: "normal", mean: 0, sd: 1 })).toBe(false));
});
```

- [ ] **Step 5: Run → FAIL. Implement** `packages/core/src/lib/mc-link.ts`:

```ts
// packages/core/src/lib/mc-link.ts
import type { Distribution } from "../schemas/mc-config.js";

/**
 * Derive a § I variable identifier from a node label.
 * Contract: result ALWAYS matches /^[A-Za-z][A-Za-z0-9_]*$/ (MCVariableSchema.name)
 * and is not in `taken`.
 */
export function mcVarName(label: string, taken: ReadonlySet<string>): string {
  let slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")   // non-alphanumerics → _
    .replace(/^_+|_+$/g, "")        // trim underscores
    .replace(/_{2,}/g, "_");
  if (!/^[a-z]/.test(slug)) slug = slug ? `v_${slug}` : "v";
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}_${i}`)) i++;
  return `${slug}_${i}`;
}

/** The push action seeds {triangular 0/0/0}; that exact shape means "not yet
 *  configured" — a UX state, not a schema failure. */
export function isUnconfiguredDistribution(d: Distribution): boolean {
  return d.kind === "triangular" && d.min === 0 && d.mode === 0 && d.max === 0;
}
```

Re-export from the core entry point (find the index that exports schemas/graph and add the lib export the same way).

- [ ] **Step 6: Run core tests → all pass (77 + new). Build:** `pnpm --filter @decision-forge/core build`.
- [ ] **Step 7: Commit** `feat(core): node mc-link block + varName slug / unconfigured helpers`

---

### Task 2: Renderer — `mc-link-store.ts` + summary computation

**Files:**
- Create: `packages/desktop/src/renderer/lib/mc-link-store.ts`
- Create: `packages/desktop/src/renderer/lib/mc-summary.ts`
- Test: `packages/desktop/tests/renderer/mc-link-store.test.ts` (new)

- [ ] **Step 1: Failing tests:**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setMcLinks, getMcLinks, addMcLink, clearMcLinks } from "../../src/renderer/lib/mc-link-store";
import { computeMcSummary } from "../../src/renderer/lib/mc-summary";

beforeEach(() => clearMcLinks());

describe("mc-link-store", () => {
  it("registers and lists bindings, deduping by nodeId", () => {
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" });
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" }); // re-register = replace
    addMcLink({ mapId: "m1", nodeId: "n2", varName: "price" });
    expect(getMcLinks()).toHaveLength(2);
  });
  it("setMcLinks replaces the whole set", () => {
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" });
    setMcLinks([]);
    expect(getMcLinks()).toEqual([]);
  });
});

describe("computeMcSummary", () => {
  it("returns ordered percentiles and a sane mean for a triangular", () => {
    const s = computeMcSummary({ kind: "triangular", min: 10, mode: 25, max: 50 });
    expect(s.p10).toBeGreaterThan(10); expect(s.p10).toBeLessThan(s.p50);
    expect(s.p50).toBeLessThan(s.p90); expect(s.p90).toBeLessThan(50);
    expect(s.mean).toBeGreaterThan(20); expect(s.mean).toBeLessThan(35);
    expect(typeof s.definedAt).toBe("string");
  });
});
```

- [ ] **Step 2: Run → FAIL. Implement.** `mc-link-store.ts` mirrors `mc-store.ts` exactly (module-level array + listener Set + `useMcLinks()` hook; export `McLink = { mapId: string; nodeId: string; varName: string }`; `addMcLink` replaces any binding with the same nodeId; include `clearMcLinks` for tests). `mc-summary.ts`:

```ts
// packages/desktop/src/renderer/lib/mc-summary.ts
import type { Distribution } from "@decision-forge/core";
import { sampleDistribution } from "./mc-client-samplers";
import { percentileFromSorted } from "./mc-percentile";

export interface McSummary { p10: number; p50: number; p90: number; mean: number; definedAt: string }

/** Range summary of a single input distribution (NOT a formula run). */
export function computeMcSummary(d: Distribution, n = 2000): McSummary {
  const samples = sampleDistribution(d, n).sort((a, b) => a - b);
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    p10: percentileFromSorted(samples, 10),
    p50: percentileFromSorted(samples, 50),
    p90: percentileFromSorted(samples, 90),
    mean,
    definedAt: new Date().toISOString()
  };
}
```

- [ ] **Step 3: Run desktop tests → pass. Commit** `feat(mc): link store + input-distribution summary helper`

---

### Task 3: § IV push action — "→ Simulate"

**Files:**
- Modify: `packages/desktop/src/renderer/pages/DependencyMap.tsx` (handler + role-change clearing)
- Modify: `packages/desktop/src/renderer/pages/depmap/ReadoutPanel.tsx` (button on Resolve-next rows)
- Modify: `packages/desktop/src/renderer/pages/depmap/NodeInspector.tsx` (button)
- Modify: `packages/desktop/src/renderer/pages/depmap/ContextMenu.tsx` (node menu item, uncertainty only)
- Test: `packages/desktop/tests/renderer/mc-handoff.test.tsx` (new; import the reactflow-jsdom helper if canvas rendering is needed — inspector/readout paths don't need it)

- [ ] **Step 1: Failing tests** (mock `react-router-dom`'s `useNavigate` with `vi.mock`, and mock `window.api.maps.save` per existing test patterns):
  - marking a node uncertainty + clicking "→ Simulate" in the NodeInspector: seeds `node.mc` (triangular 0/0/0, varName slug of label), SAVES the map (`maps.save` called with the mc block present), registers a binding (`getMcLinks()` contains `{nodeId, varName}`), navigates to `/mc`.
  - second click on the same node does NOT re-seed (existing mc kept), still navigates.
  - readout Resolve-next row shows a "→ Simulate" affordance for uncertainty entries and fires the same handler.
  - context menu on an uncertainty node shows "→ Simulate"; on a factor node it does NOT.
  - changing a linked node's role away from uncertainty REMOVES the `mc` key (assert via save: `"mc" in savedNode === false`).

- [ ] **Step 2: Run → FAIL. Implement:**
  - `DependencyMap.tsx`: `const navigate = useNavigate();` plus

```ts
const handlePushToMC = useCallback((id: string) => {
  setMap((prev) => {
    const node = prev.nodes.find((n) => n.id === id);
    if (!node || node.role !== "uncertainty") return prev;
    if (node.mc) return prev; // already linked — keep definition
    const taken = new Set(
      prev.nodes.flatMap((n) => (n.mc ? [n.mc.varName] : []))
    );
    const varName = mcVarName(node.label, taken);
    return {
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === id
          ? { ...n, mc: { varName, distribution: { kind: "triangular" as const, min: 0, mode: 0, max: 0 } } }
          : n
      ),
      updatedAt: new Date().toISOString()
    };
  });
  // post-state work happens in an effect or after flush — simplest: queue it
  setPendingMcPush(id);
}, []);
```

  Then a small `useEffect` watching `pendingMcPush`: when set and the node has `mc`, `await mapsApi.save(map)` (reuse `handleSave`'s persist-first pattern), `addMcLink({ mapId: map.id, nodeId, varName })`, `navigate("/mc")`, clear the pending flag. (This avoids reading stale state inside the `useCallback([])` handler — keep the established freshness discipline. An equally acceptable shape: compute everything inside the updater and stash `{nodeId, varName}` in a ref the effect consumes.)
  - Role-change clearing: in `handleUpdateNode`/`handleSetRole`'s single role implementation, when the new role ≠ "uncertainty" and the node has `mc`, destructure `mc` out (same key-removal pattern as role="factor").
  - ReadoutPanel: Resolve-next rows get a small trailing button (`aria-label` `Simulate <label> in Monte Carlo`, title from one shared string) calling a new `onPushToMC(nodeId)` prop.
  - NodeInspector: when `node.role === "uncertainty"`, render a "→ Simulate in § I" button (full-width, btnStyle family) above Delete; calls `onPushToMC(node.id)` via a new optional prop.
  - ContextMenu node menu: add "→ Simulate" item only when the node's role is uncertainty (the menu already receives role state for the Role ▸ submenu — thread `role` if not present).

- [ ] **Step 3: Run desktop suite → green (241 + new). tsc zero new.**
- [ ] **Step 4: Commit** `feat(depmap): → Simulate push — seed mc link, save, hand off to § I`

---

### Task 4: § I — merged linked variables, write-through, formula bootstrap

**Files:**
- Modify: `packages/desktop/src/renderer/pages/MonteCarlo.tsx`
- Modify: `packages/desktop/src/renderer/pages/mc/VariableCard.tsx` (badge + note hint + lock name editing for linked vars; current props at line ~308 are `{variable, onChange, onRemove, index}` — extend with optionals)
- Modify: `packages/desktop/src/renderer/pages/mc/SimulationPanel.tsx` (the "use <varName>" chip lives next to the formula input, `id="mc-formula"`, which is in THIS file — pass linked varNames + an onInsert callback down)
- Test: `packages/desktop/tests/renderer/mc-handoff-mc-side.test.tsx` (new)

- [ ] **Step 1: Failing tests** (mock `window.api.maps.load/save`; seed `mc-link-store` with a binding and a map fixture whose node carries `mc`):
  - § I renders the linked variable in the list, badged `§ IV · <node label>` with the node note shown.
  - editing the linked variable's distribution calls `maps.load(mapId)` then `maps.save` with the patched `node.mc.distribution` AND a recomputed `summary` (p10<p50<p90).
  - the linked variable's NAME is not editable (it's persisted in formulas/map).
  - the "use <varName>" chip appears next to the formula input when a linked variable is not referenced in the formula; clicking it inserts the varName. (Do NOT try to arrange an empty-formula arrival through the UI — `formula` initializes to the non-empty default and SimulationPanel keeps its own draft; the chip is the tested deliverable, and the empty-string prefill branch may be tested as a pure function if implemented.)
  - `maps.load` returning null (deleted map) → variable still shown, badge replaced by "link broken — now ad-hoc", no save attempted.
  - adding an ad-hoc variable while a linked one named `x1` exists → new ad-hoc name dedups (existing `addVariable` uses `x${n}` — guard collisions).

- [ ] **Step 2: Run → FAIL. Implement** in `MonteCarlo.tsx`:
  - `const links = useMcLinks();` On mount/changes: for each link, `mapsApi.load(link.mapId)` (cache per mapId), find the node, build `MCVariable { name: link.varName, distribution: node.mc.distribution }` tagged in a parallel `linkedMeta: Map<varName, {mapId, nodeId, label, note?, broken?}>`. Merge: `const allVariables = [...linkedVars, ...variables]` for display/run/publish (`setLatestMCVariables(allVariables)` so the BATNA picker sees both).
  - IMPORTANT: `updateVariable`/`removeVariable` are INDEX-based into the ad-hoc array; render linked variables on a separate keyed path (by `varName`) with their own handlers — never feed merged-list indices into the ad-hoc handlers (off-by-offset edits).
  - `updateLinkedVariable(varName, updated)`: write-through — `mapsApi.load` → patch the node's `mc.distribution` + `mc.summary = computeMcSummary(updated.distribution)` → `mapsApi.save`; update local linked state. On load/save failure mark `broken`.
  - Formula bootstrap: `useEffect` — if `formula === DEFAULT_CONFIG.formula && variables === DEFAULT_CONFIG.variables` is NOT the right test; instead, when links exist and the user hasn't touched the formula this session (track a `formulaTouched` ref set by SimulationPanel edits), set formula to the linked varNames joined by ` + `? **No — YAGNI/explicit:** only when the CURRENT formula is empty string. The default config ships a non-empty formula, so: when arriving with links and `formula.trim() === ""` OR formula still strictly equals the untouched default AND default variables were never edited, replace with the first linked varName. Keep it simple: implement `formula.trim() === "" → first varName`, and ALSO offer a one-click "use <varName>" chip next to the formula input when a linked var is not referenced. (The chip is the robust path given the non-empty default formula; test the chip.)
  - VariableCard: new optional props `linkedLabel?: string`, `linkedNote?: string`, `linkedBroken?: boolean`, `nameLocked?: boolean` — renders the badge line + note hint, disables the name input when locked.
- [ ] **Step 3: Run → green. tsc zero new.**
- [ ] **Step 4: Commit** `feat(mc): map-linked variables — badge, write-through to map file, formula chip`

---

### Task 5: § IV display — node chip, inspector summary, readout range

**Files:**
- Modify: `packages/desktop/src/renderer/pages/depmap/FactorNode.tsx` (range chip)
- Modify: `packages/desktop/src/renderer/pages/depmap/LayeredView.tsx` (thread `mc` summary into node data)
- Modify: `packages/desktop/src/renderer/pages/depmap/NodeInspector.tsx` (summary + Edit in § I + Unlink)
- Modify: `packages/desktop/src/renderer/pages/depmap/ReadoutPanel.tsx` (range suffix on Resolve-next)
- Modify: `packages/desktop/src/renderer/pages/DependencyMap.tsx` (`handleUnlinkMC`)
- Test: extend `mc-handoff.test.tsx`

- [ ] **Step 1: Failing tests:**
  - a node whose `mc.summary` exists renders a chip line `14 · 26 · 44` (rounded, dim meta style) under the label; linked-but-unconfigured renders `→ § I`.
  - NodeInspector for a linked node shows kind + parameters + range, an "Edit in § I" button (re-registers binding + navigates — reuse `handlePushToMC`'s effect path but without re-seeding), and "Unlink" which strips `mc` (assert via save round-trip key absence).
  - Resolve-next row for a linked node appends `· p10–p90: 14–44`.

- [ ] **Step 2: Run → FAIL. Implement.** Number formatting: `Intl.NumberFormat` with `maximumSignificantDigits: 3` shared in a tiny `formatRange` helper (put it next to `mc-summary.ts`). Chip into `FactorNodeData` via the style-sync `data` flags (same channel as role/glow flags). Unlink uses the established key-removal destructure.
- [ ] **Step 3: Run → green. tsc zero new.**
- [ ] **Step 4: Commit** `feat(depmap): linked-uncertainty range chip, inspector summary, readout range`

---

### Task 6: e2e + docs + PR

**Files:**
- Modify: `packages/desktop/tests/e2e/depmap.spec.ts`
- Modify: `ROADMAP.md`
- Test: e2e suite

- [ ] **Step 1: New e2e scenario** (reuse the existing launch fixture incl. `DF_E2E_INACTIVE`): § IV → add node "Transnet tender" → right-click → Role ▸ Uncertainty → inspector "→ Simulate in § I" → lands on `/mc` with a variable badged `§ IV · Transnet tender` → set triangular 10/25/50 (drive VariableCard inputs) → navigate back to § IV (sidebar) → node shows a range chip → Save → New → Open → chip + link survive reload.
- [ ] **Step 2: Run** `pnpm --filter @decision-forge/desktop test:e2e` → 9/9. Full suites: core, desktop, tsc (4 pre-existing only).
- [ ] **Step 3: Docs** — ROADMAP.md: MC hand-off moved to shipped with commit map.
- [ ] **Step 4: Commit** `test+docs: MC hand-off e2e round-trip; roadmap` — then push branch and open PR `§ IV → § I Monte Carlo hand-off` (body via pr-description conventions, mention: map file is source of truth; § I ad-hoc state still ephemeral; no backend changes).

---

## Verification checklist (after all tasks)

- [ ] Push from readout, inspector, AND context menu all work; non-uncertainty nodes never see the affordance.
- [ ] Role change away from uncertainty strips `mc` (key absent in saved JSON).
- [ ] § I edit → § IV chip updates after map reload; restart app → chip still there (map file truth).
- [ ] Broken-link fallback visible, never silent.
- [ ] Suites: core 77+new, desktop 241+new, e2e 9; tsc 4 pre-existing only.
