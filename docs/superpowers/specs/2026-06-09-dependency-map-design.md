# Decision Forge — § IV "Dependency Map" — Design

**Status:** Design approved 2026-06-09 (brainstorm). Ready for implementation planning.
**Author:** brainstormed with Alex via the visual companion.
**Supersedes/extends:** the deferred "3D particle cloud (react-three-fiber)" item in
`2026-04-13-decision-forge-design.md` §10 — that 3D centerpiece is realised here, but
re-scoped per operability research (below).

---

## 1. Overview

A new fourth module — **§ IV · CONSEQUENCE · "Dependency Map"** (accent **iris `#8f7ae6`**) —
where a user hand-maps the **factors of a decision** as nodes and draws **directed
"drives / depends-on" edges**, then reads the **structure** of the decision back: what
drives what, what's foundational, where the cycles are, and what a change ripples into.

The module is a standalone canvas (no coupling to the other three modules in v1). It
combines two things the user asked for: a **dependency map** (directed edges, structure)
and an **idea/option space** (clusters reveal themes). The primary working view is a
**layered DAG**; a **3D "constellation"** force view is available as an overview toggle.

### 1.1 Why this shape (research-grounded)

Two rounds of HCI / decision-science research shaped the design. Key conclusions
(citations in Appendix A):

1. **A 3D force-directed point cloud is the wrong *primary* surface** for a directed
   dependency graph on a normal monitor. Every empirical win for 3D node-link graphs
   depends on **stereo + motion** (VR/head-tracking), which we don't have; on a flat
   screen it keeps the costs (occlusion, depth ambiguity, label rotation, click
   inaccuracy, orbit disorientation) and gains nothing (Munzner's "no unjustified 3D").
   Force-directed layout is also the **wrong layout family** for *directed* dependencies —
   distance-based placement implies symmetry and hides direction-of-flow. → **Primary
   view is a layered (Sugiyama) DAG; 3D is an optional overview only.**
2. **"The layout is the least valuable thing you ship; the analysis layered onto it is
   the product"** (Kumu vs. the Obsidian graph-view critique). → The structural analysis
   and its plain-language presentation are first-class, not decoration.
3. **A plain dependency graph describes a decision but does not *decide*.** Making it
   decision-useful needs a thin layer of **typed semantics** (mark the objective; tag
   controllability and uncertainty) and a **Decision Readout**. Per Alex's call on
   2026-06-09, **that semantic layer is deferred to v1.1** — v1 ships the structural
   canvas. The v1 data model reserves the v1.1 fields as optional so there is **no
   migration** later (see §4.4).

---

## 2. Goals / Non-goals

### v1 goals
- Hand-build a decision's factor graph (add nodes, draw directed edges) quickly and
  ergonomically.
- See the **structure**: cycles, roots/leaves, dependency layers, what's reachable
  downstream/upstream of a selected node, connectivity hubs, theme clusters, and an
  influence/dependence (MICMAC) quadrant.
- Two views over one data model: a readable **layered DAG** (primary) and a **3D
  constellation** overview (toggle).
- Persist named maps locally; reopen and edit.
- All analysis is **pure, local TypeScript** — no sidecar, no AI, no network for v1.

### Non-goals (v1)
- No decision semantics / typed nodes / Decision Readout (→ v1.1, §9).
- No edge weights or signs (→ v1.1).
- No integration with Monte Carlo / Forecast / Negotiation (→ v1.1 hand-off).
- No semantic-similarity (embedding) layout — force/structure only.
- No collaboration, no import from external formats.

---

## 3. The two views

| | Primary — **Layered** | Overview — **3D constellation** |
|---|---|---|
| Purpose | Reason about the decision | At-a-glance "wow" / explore |
| Layout | Sugiyama layered DAG (roots → leaves, top-down) | Force-directed 3D |
| Library | `react-flow` + `dagre` | `react-force-graph-3d` (three.js) |
| Direction | Arrowheads, layers = reachability depth | Arrowheads; depth-fade |
| Default | **Yes** | Toggle |

Both render the **same** `DependencyMap` data and the **same** computed analysis;
switching views never changes the model. The 3D view applies the mitigations the
research demands: easy orbit, depth fog/fade, **fade-non-neighbours on select**, and a
"focus on selection" (local subgraph) mode to fight occlusion.

---

## 4. Data model

New `@decision-forge/core` schema module `src/schemas/dependency-map.ts` (Zod, sibling to
`scenario` / `mc-config` / `forecast`).

### 4.1 Schema (v1)
```ts
DependencyNodeSchema = {
  id: uuid,
  label: string (1..),         // the factor
  note?: string,               // optional free text
  // --- v1.1 reserved (all optional; absent in v1) ---
  type?: "objective" | "factor",          // v1.1
  controllability?: "control" | "influence" | "concern", // v1.1
  uncertainty?: { flag: boolean, impact?: "low" | "high" }, // v1.1
}

DependencyEdgeSchema = {
  id: uuid,
  from: uuid,   // depends-on / driven-by
  to: uuid,     // drives / influences   (semantics: from → to means "from drives to")
  // --- v1.1 reserved ---
  sign?: "+" | "-",   // v1.1 (virtuous/vicious loops, increases/decreases)
}

DependencyMapSchema = {
  id: uuid,
  name: string (1..),
  createdAt: iso,
  updatedAt: iso,
  nodes: DependencyNode[],
  edges: DependencyEdge[],
}
```

**Edge direction convention (write this in code comments and the UI):** an edge
`A → B` reads **"A drives / influences B"** (equivalently "B depends on A"). Roots are
drivers (no incoming); leaves are outcomes (no outgoing). The layered view places roots
at the top, outcomes at the bottom.

Analysis results are **derived, never stored**.

### 4.2 Validation rules
- `edges[*].from` and `edges[*].to` must reference existing node ids; reject dangling.
- Self-loops (`from === to`) rejected.
- Duplicate edges (same from+to) collapsed/rejected.
- Cycles are **allowed** in the data (users will create them); they are *detected and
  flagged*, not prevented.

### 4.3 v1.1 forward-compat
All v1.1 fields are optional and absent in v1 documents. v1 code ignores them; v1.1 adds
behaviour without a schema migration. A v1 map opened in v1.1 simply has no objective/
controllability/uncertainty set yet.

---

## 5. Analysis — pure TS functions (the heart of the module)

Location: `@decision-forge/core` `src/graph/` (pure, no React, fully unit-tested **first**
per TDD). Each takes `{nodes, edges}` and returns plain data the views render.

| Function | Algorithm | Output | Renders as |
|---|---|---|---|
| `findCycles` | DFS / Tarjan SCC | list of cycles (node+edge ids), ranked shortest-first | offending edges in vermilion; ranked list, hover→highlight |
| `rootsAndLeaves` | in/out degree | `{roots[], leaves[]}` | roots citron, leaves sage |
| `topoLayers` | Kahn (cycles broken via SCC condensation) | `node → layer index` | drives the layered layout |
| `reachDownstream` / `reachUpstream` | BFS from a node | reachable sets | blast-radius highlight on select |
| `degree` / `hubs` | in/out/total degree | per-node degree; top hubs | node size in both views |
| `communities` | connected components (v1); label-propagation optional | `node → clusterId` | cluster tint |
| `micmac` | per-node (outDeg = influence, inDeg = dependence) | quadrant per node | mini influence/dependence scatter in marginalia |

**Cycle policy for layering/reachability:** condense strongly-connected components (each
SCC becomes one super-node) before topological layering, so a cyclic graph still layers
cleanly; the cycle itself is surfaced by `findCycles`.

**Presentation rule (from research):** outputs are **ranked** and shown in
**plain language**, never raw metric numbers as the headline. Even structural readouts
read like "FX rate drives 6 of 8 downstream factors," not "out-degree = 6."

---

## 6. Interaction & operability

Editorial three-column module (matches the app's `ModuleFrame` idiom):

- **Left — Capture:** text field to add a factor; the factor list with role tags
  (root/leaf, in cycle, hub); select a node here or in the canvas.
- **Centre — Canvas:** the active view (layered default / 3D toggle). Orbit+zoom in 3D;
  pan+zoom in 2D.
- **Right — Structure:** live counts (nodes, edges, **cycles ⚠**, roots, leaves) + the
  MICMAC mini-quadrant + the selected node's downstream/upstream counts.

**Operability requirements (research-mandated, apply to both views):**
- **Arrowheads on every edge** — direction is the payload.
- **One-drag directed edge creation** (drag from source node to target); **click-source-
  then-click-target** as an equal-footing fallback (lower effort for many edges). Never a
  modal dialog per edge.
- **Hover → ego-highlight** (node + immediate neighbours; dim the rest).
- **Click → focus**: highlight downstream (one colour) and upstream (another); optional
  "isolate to local subgraph" to defeat hairballs.
- **Hairball guard:** soft-warn past ~20 nodes ("getting dense — try focus mode / cluster
  tint"); never hard-block.
- **Keyboard:** node create on Enter from the capture field; Delete removes selected
  node/edge; arrow-key list navigation. Respect the global `:focus-visible` ring.
- Labels stay horizontal and legible (free in 2D; billboarded toward camera in 3D).

---

## 7. Architecture & file layout

- **`packages/core/src/schemas/dependency-map.ts`** — Zod schema + types.
- **`packages/core/src/graph/`** — `cycles.ts`, `layers.ts`, `reach.ts`, `degree.ts`,
  `communities.ts`, `micmac.ts`, `index.ts`; pure functions + vitest suites.
- **`packages/desktop/src/main/maps.ts`** — JSON persistence under
  `~/DecisionForge/maps/<id>.json` (mirrors `main/scenarios.ts`); IPC: `maps:list/load/
  save/delete`. Preload bridge + renderer `maps-api` like the others.
- **`packages/desktop/src/renderer/pages/DependencyMap.tsx`** — the module page
  (`ModuleFrame`), holding map state and wiring the panels.
- **`packages/desktop/src/renderer/pages/depmap/`** — `CapturePanel.tsx`,
  `LayeredView.tsx` (react-flow + dagre), `ConstellationView.tsx` (react-force-graph-3d),
  `StructurePanel.tsx`, `useAnalysis.ts` (memoised selectors over the core functions).
- **Masthead / nav** — add § IV entry (`Sidebar.tsx`, `Home.tsx`, route).

**New dependencies (desktop):** `reactflow`, `dagre` (+ `@types/dagre`),
`react-force-graph-3d` (pulls `three`). All renderer-side; no sidecar change. Note bundle
-size impact (three.js) — lazy-load both view components (the app already lazy-loads
`lightweight-charts`).

---

## 8. Testing strategy (TDD — tests first)

- **Unit (core, `packages/core`):** every graph function, written **red→green** with
  hand-checked fixtures — including the hard cases: a known cycle, a diamond (shared
  downstream), a disconnected component, a DAG with multiple roots, an all-in-one-SCC
  graph. These are deterministic and the bulk of the value.
- **Schema:** valid map round-trips; dangling edge rejected; self-loop rejected;
  v1.1-field-bearing doc still parses (forward-compat).
- **Component (desktop):** capture add-node; one-drag edge creates a directed edge with
  correct from/to; cycle renders flagged.
- **E2E (playwright, 1 spec):** open § IV → add 3 nodes → connect into a cycle → cycle
  flag appears in Structure → toggle to 3D constellation → back. Reuses `_env.ts`.
- **Persistence:** save → list → load round-trip (mirrors `scenarios.spec.ts`).

## 9. Build order

1. **core schema** + **graph analysis functions** (all unit-tested). ← largest value,
   no UI risk.
2. **persistence + IPC** (`main/maps.ts`, preload, renderer api) + round-trip test.
3. **Layered view + capture/edge UX** (react-flow + dagre) — the usable canvas.
4. **Structural rendering**: cycles (vermilion), roots/leaves, click→blast-radius,
   hover→ego-highlight, hairball warning.
5. **MICMAC quadrant + hubs + community tint** in the Structure panel.
6. **3D constellation toggle** (react-force-graph-3d) with depth-fade + fade-non-neighbours.
7. Masthead/nav wiring + e2e + docs (README/ROADMAP).

## 10. v1.1 roadmap (designed-in, deferred)

Adds the **decision semantics** that turn the map from *describing* to *deciding*:
- **Node flags:** `type: objective`, `controllability: control|influence|concern`,
  `uncertainty {flag, impact}` (all already reserved in the schema).
- **Edge sign** `+/-` → virtuous vs vicious loop detection; "increases/decreases" wording.
- **Decision Readout** (the centrepiece): **Act first** (controllable, max downstream
  reach to objective) · **Resolve next** (uncertain ∧ uncontrollable ∧ high impact) ·
  **Plan around** (high-impact concern) · **Watch** (betweenness bottleneck; symptoms-not-
  drivers). Plain sentences with verbs, never raw metrics; outputs labelled "candidates."
- **DEMATEL-lite** prominence (D+R) / net-cause (D−R) leverage ranking — replaces the
  misleading "hub = leverage" reading (a hub is the busiest node, not the highest-leverage
  one).
- **Integration hand-off:** "Resolve next" sends a factor to **Monte Carlo** (model a
  range) or **Forecast** (log a calibrated prediction) — the first real reason the four
  modules connect.

## 11. Risks & open questions

- **Bundle size:** three.js + react-flow are heavy. Mitigation: lazy-load both view
  modules; the 3D view loads only when toggled.
- **react-flow vs hand-rolled 2.5D:** v1 uses react-flow (proven node/edge UX) for the
  layered view rather than an r3f 2.5D layered scene. If the editorial look can't be
  achieved within react-flow's theming, fall back to custom SVG + dagre. Decide during
  step 3; not a blocker.
- **Naming/accent** ("Dependency Map" / iris `#8f7ae6`) are provisional; confirm before
  the masthead wiring step.
- **3D operability** remains a watch item even as an overview — keep the local-subgraph
  fallback prominent so users never have to reason in the cloud.

---

## Appendix A — Research sources

**3D vs 2D graph operability:** Ware & Mitchell 2008 (ACM TAP, the stereo-display result
often miscited for on-screen 3D) https://dl.acm.org/doi/10.1145/1279640.1279642 ·
McGuffin et al. 2022 (VR/physical path-tracing) https://arxiv.org/abs/2207.11586 ·
Munzner, *Visualization Analysis & Design* ("no unjustified 3D") · Kosara, "Graphs Beyond
the Hairball" https://eagereyes.org/blog/2012/graphs-hairball · Sugiyama/layered drawing.

**Comparable systems:** Kumu.io (loops, MICMAC, centrality, communities)
https://docs.kumu.io/guides/metrics · LOOPY https://ncase.me/loopy/ · Vensim causal
tracing https://vensim.com/causal-tracing/ · Obsidian graph-view critique
https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful ·
react-force-graph https://github.com/vasturiano/react-force-graph · react-flow
https://reactflow.dev/learn/concepts/adding-interactivity

**Dependency mapping for decision-making (v1.1 grounding):** MICMAC / Godet · ISM ·
DEMATEL (D+R / D−R) https://www.mdpi.com/2073-8994/15/7/1357 · cross-impact analysis ·
SODA / cognitive mapping (Eden & Ackermann) https://www.ifm.eng.cam.ac.uk/research/dstools/soda/ ·
influence diagrams (decision/chance/value node types) https://analytica.com/decision-technologies/influence-diagrams/ ·
Meadows, *Leverage Points* https://donellameadows.org/wp-content/userfiles/Leverage_Points.pdf ·
Circle of Control/Influence/Concern https://www.leadingsapiens.com/circle-of-control-influence-concerns/ ·
scenario-planning critical uncertainties https://www.fibresonline.com/scenario-planning/critical-uncertainties

*(Full annotated source lists from both research passes are preserved in the brainstorm
session.)*
