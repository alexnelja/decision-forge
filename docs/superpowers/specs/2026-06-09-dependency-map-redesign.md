# § IV Dependency Map — Redesign Spec (v1.5)

Extends `2026-06-09-dependency-map-design.md` after two rounds of user testing.
Decisions in this spec were confirmed by Alex on 2026-06-09 (see
`2026-06-09-dependency-map-redesign-notes.md` for the brainstorm trail).

**Confirmed direction:**
- **Paradigm A+** — keep the freeform canvas; fix the gestures (react-flow tiny
  handles were the culprit, not the paradigm).
- **Connector set** — directed base + optional polarity (+/−) by colour +
  optional confidence (solid = known / dashed = assumption). Defer
  thickness/delay. No edge-type enum.
- **Decision Readout** — light node typing (objective / lever / uncertainty) +
  loop classification + a plain-English "Act first / Resolve next / Plan
  around" panel. This is the answer to "I don't understand the outcome."

---

## 1. Data model changes (`@decision-forge/core`)

### 1.1 Node: replace the unused v1.1 reserved trio with a single `role`

The reserved `type` / `controllability` / `uncertainty` fields were never
written by any code (one schema test references them). One UI concept should be
one field:

```ts
role: z.enum(["objective", "lever", "uncertainty", "factor"]).optional()
// absent ≡ "factor"
```

- **objective** ◎ — the thing you're deciding for (usually 1, not enforced).
- **lever** ◆ — controllable: you can act on it.
- **uncertainty** ? — unknown that resolves over time (tender outcome, price).
- **factor** (default, no glyph) — everything else.

Remove `type`/`controllability`/`uncertainty` from the schema and update the
one test. No saved map ever contained them (fields were never writable), so no
migration is needed.

### 1.2 Edge: add `confidence`

```ts
sign: z.enum(["+", "-"]).optional()          // already present
confidence: z.enum(["known", "assumption"]).optional()  // absent ≡ "known"
```

### 1.3 Visual encoding (single source of truth, shared by 2D + 3D)

| Attribute | Value | Encoding |
|---|---|---|
| direction | always | arrowhead (existing) |
| sign | `+` | green stroke (`--ok`-family token) |
| sign | `−` | red stroke (`--danger`-family token) |
| sign | absent | `--ink-dim` (current neutral) |
| confidence | `assumption` | dashed stroke |
| confidence | `known`/absent | solid stroke |

Cycle-edge highlight (currently `--sec-nego` recolour) must not collide with
polarity colour: cycle membership moves to a **wider stroke + glow**, leaving
hue free for sign.

## 2. New core analysis (pure TS, TDD)

### 2.1 `graph/loops.ts` — loop classification

```ts
type LoopClass = "reinforcing" | "balancing";
classifyLoop(cycleNodeIds, edges): LoopClass
// edges within the SCC; unsigned edges count as "+".
// odd # of "−" → balancing, even → reinforcing.
classifyLoops(g): Array<{ nodes: string[]; class: LoopClass }>
```

Simplification (documented in code): classification is per SCC over the SCC's
internal edges. Good enough at this module's 10–60 node scale.

**Virtuous/vicious refinement:** a reinforcing loop is *virtuous* if the
sign-product along a shortest path from the loop to the objective node is `+`,
*vicious* if `−`; if there is no objective or no path, it stays plain
"reinforcing". Implemented as `loopValence(loop, g, objectiveId)`.

### 2.2 `graph/readout.ts` — the Decision Readout

```ts
decisionReadout(map: DependencyMap): Readout
interface Readout {
  actFirst:    Array<{ nodeId: string; reason: string }>; // levers
  resolveNext: Array<{ nodeId: string; reason: string }>; // uncertainties
  planAround:  Array<
    | { kind: "loop"; nodes: string[]; class: LoopClass; valence?: "virtuous" | "vicious" }
    | { kind: "external"; nodeId: string; reason: string }>;
  guidance: string | null;  // non-null when roles are missing → onboarding copy
}
```

Deterministic ranking, top 3 per section:
- **Act first** — `role=lever`, ranked by downstream-reach size; reason e.g.
  `"drives 4 factors → reaches the objective"`.
- **Resolve next** — `role=uncertainty`, ranked by downstream-reach size;
  reason e.g. `"3 factors hang on this"`.
- **Plan around** — classified loops (vicious first), plus `factor` nodes with
  large downstream reach and **no lever upstream** (`"outside your control —
  drives N factors"`).
- **guidance** — if no node has a role: `"Mark your objective ◎, levers ◆ and
  uncertainties ? to get a readout."` (loops still listed). If objective set
  but no levers: prompt for levers; etc.

## 3. Canvas interaction rework (LayeredView)

### 3.1 Custom node — `FactorNode` (the Easy Connect fix)

Registered via `nodeTypes`; replaces default styled nodes.
- **Body = move, border = connect**: a perimeter ring (~8px) renders
  source/target handles spanning the full border (react-flow Easy Connect
  pattern); cursor switches `grab` → `crosshair` on the ring.
- **Role glyph** before the label: ◎ / ◆ / ? (none for factor).
- **Hover mini-toolbar** above the node: ⧉ duplicate · 🗑 delete.
- **Double-click → inline rename** (input swap in place; Enter/blur commits,
  Esc cancels). Notes stay in NodeInspector.
- Keeps all existing style-effect state (selection ring, ego-fade, root/leaf
  rings) — styles move into `FactorNode` driven by `data` flags rather than
  inline `style` overwrites.

### 3.2 Canvas gestures

- **Double-click empty canvas** → new node at that point, immediately in
  inline-rename mode (`screenToFlowPosition`).
- **Drag from border to empty space** (`onConnectEnd` on pane) → create a new
  node there, connected `source → new`, immediately in rename mode. *The*
  killer gesture (FigJam/Obsidian).
- **Drag direction = edge direction** (unchanged semantics: from drives to).
- **Right-click node/edge/pane** → context menu (node: rename · duplicate ·
  delete · role submenu; edge: flip · sign · confidence · delete; pane: add
  node here · tidy).
- **Keyboard**: `Delete`/`Backspace` delete selection (exists), `⌘D`
  duplicate, marquee multi-select (react-flow `selectionOnDrag`).
- **Empty-state hint** centred on blank canvas: `"Double-click to add your
  first factor."`

### 3.3 Editable edges

- Click an edge → selected + **edge mini-toolbar** floats at its midpoint:
  `⇄ flip` · `±` cycle sign (none → + → − → none) · `▰/▱` toggle confidence ·
  `🗑 delete`.
- **Endpoint re-point**: react-flow `onEdgeUpdate` (updatable edges) — drag an
  endpoint to a different node; strong snap + target highlight; releasing on
  empty space does **not** silently unbind (edge snaps back).

### 3.4 Tidy — root-cause fix

`handleTidy` writes dagre positions into the map, but the structural-sync
effect is keyed on `structuralKey` (topology only), so react-flow never reads
the new positions. Fix: Tidy applies positions **directly to rfNodes**
(`setRfNodes`) *and* persists via `onRelayout`, then `fitView`. (Equivalent
acceptable fix: include a `layoutVersion` counter in the sync key.)

## 4. Decision Readout panel (desktop)

`ReadoutPanel` renders `decisionReadout(map)` in the marginalia **above**
StructurePanel (StructurePanel stays, demoted to "Structure" detail):

```
DECISION READOUT
ACT FIRST    ◆ Rail allocation — drives 4 factors → reaches the objective
RESOLVE NEXT ? Transnet tender — 3 factors hang on this
PLAN AROUND  ⟳ Price–volume loop (vicious) · Port tariffs — outside your control
```

- Rows are clickable → select that node (or loop nodes) on canvas.
- Guidance copy shown when roles are missing (see §2.2).
- **Role assignment UX**: radio row in NodeInspector (Factor / Objective ◎ /
  Lever ◆ / Uncertainty ?) + right-click role submenu on nodes.
- **Loop badges on canvas**: small floating label at each loop's centroid:
  `⟳ reinforcing` / `⇋ balancing` (vicious/virtuous wording when valence is
  known), in the cycle highlight colour.

## 5. Chrome & polish

- **Icons over text** with `title` tooltips: header bar (Save 💾 / Open 📂 /
  New ✚ / view toggle ▤ ⬡) and canvas (Tidy ⌗). Inline SVG (no icon dep) —
  match the existing hand-set aesthetic; `aria-label` on every icon button.
- **Collapsible global Contents nav** (`Sidebar.tsx`, the § I–IV nav): same
  pin/rail pattern as the capture panel — unpinned ⇒ 14px rail with vertical
  "Contents" label, reveal on hover, pin toggle. Default **pinned** (no
  behaviour change until the user unpins). Preference persisted to
  `localStorage`.
- **3D node labels**: `three-spritetext` (tiny dep, same author as
  react-force-graph) — `nodeThreeObject` sprite showing the label, sized
  ~6px, `--ink` colour; keeps hover tooltip. Polarity/confidence styling
  applied to 3D links too (colour + dashed).

## 6. Testing (TDD, tests first)

- **core**: schema round-trip for `role`/`confidence` (+ removal of reserved
  trio), `classifyLoop(s)` parity rule, `loopValence`, `decisionReadout`
  ranking/guidance/empty-states.
- **desktop unit (RTL)**: Tidy applies dagre positions to rfNodes; double-click
  pane adds node in rename mode; connect-to-empty creates connected node;
  inline rename commit/cancel; duplicate (toolbar + ⌘D); edge toolbar flip /
  sign cycle / confidence toggle / delete; role radio in NodeInspector;
  ReadoutPanel rendering incl. guidance; Sidebar collapse.
- **e2e (playwright)**: double-click-add → drag-to-empty-create → set roles →
  readout appears → tidy → save/reload round-trip keeps roles/signs/positions.
- `tsc` zero new errors. All existing 58 core + 73 desktop + 7 e2e stay green.

## 7. Build order

1. **Core**: schema (`role`, `confidence`, drop reserved trio) → `loops.ts` →
   `readout.ts`. Pure, fully TDD-able, no UI risk.
2. **Tidy fix** (small, isolated, kills the most visible bug first).
3. **FactorNode + gestures** (Easy Connect, dbl-click add, drag-to-empty,
   inline rename, hover toolbar, ⌘D, context menu).
4. **Edge editing + visuals** (toolbar, flip/sign/confidence, onEdgeUpdate,
   polarity colours, dashed assumptions; move cycle highlight off hue).
5. **Readout** (ReadoutPanel, role UX in inspector + context menu, loop
   badges).
6. **Chrome**: icons, Sidebar collapse, 3D labels + 3D edge styling.
7. e2e sweep, PR #12 update.

## 8. Non-goals (unchanged + new)

- No thickness=strength, no delay marks, no edge-type enum (deferred until a
  calculation reads them).
- No auto-import of factors from other modules (v2 idea).
- No multi-objective readout weighting; first objective node wins, others
  listed in guidance.
