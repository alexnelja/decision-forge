# § IV → § I Monte Carlo Hand-off — Design

Push an uncertainty node from the § IV Dependency Map into § I Monte Carlo as a
simulation input, with a durable link back. This answers the readout's "Resolve
next" with an action: turn the named unknown into a distribution you can model.

Confirmed with Alex (2026-06-11): **push + linked back** (not one-shot, not a
distribution editor inside § IV); definition **persisted on the map node** (not
a new MC scenario save system, not session-only); **triangular** as the seeded
default; distribution editing happens **in § I**.

## 1. Key insight shaping the design

An MC *run* produces stats for the **formula outcome**, not per input. The range
worth showing on a map node is the uncertainty's *own* distribution — its
p10/p50/p90 — which derives directly from the distribution definition (client-side
sampling, same mechanism as the existing BATNA percentile resolution in
`packages/desktop/src/renderer/lib/mc-percentile.ts`). So the back-flow needs **no
run**: define the distribution in § I and the map immediately knows its range.
Runs remain a § I-only activity.

## 2. Data model (`@decision-forge/core`)

`DependencyNodeSchema` gains an optional `mc` block:

```ts
mc: z.object({
  /** Reuses § I's Distribution schema (all six kinds) — import from mc-config. */
  distribution: DistributionSchema,
  /** Variable identifier used in § I formulas. Slug of the label at link time. */
  varName: z.string().min(1),
  /** Derived from `distribution` whenever it changes (client-side sampling). */
  summary: z.object({
    p10: z.number(), p50: z.number(), p90: z.number(), mean: z.number(),
    definedAt: iso
  }).optional()
}).optional()
```

- Lives in the map's JSON file → round-trips with save/load like `role`/`sign`.
- Schema is permissive (any node may carry it); the **UI** offers it only on
  `role === "uncertainty"` nodes and **clears `mc` when the role changes away**
  from uncertainty (same key-removal semantics as role="factor").
- `DistributionSchema` moves to (or is re-exported from) a location both schemas
  can import without cycles — `mc-config.ts` already lives in core, so a plain
  import suffices.

## 3. The push (§ IV side)

A **"→ Simulate"** action on uncertainty nodes, in the three established
surfaces: the readout's *Resolve next* rows, the NodeInspector, and the node
context menu.

On activation:
1. If `node.mc` is absent, seed it: triangular distribution stub
   (min/mode/max unset-but-editable — concretely `{kind:"triangular", min:0,
   mode:0, max:0}` flagged as unconfigured until § I edits land; § I shows it
   as an empty editor, not as a real 0/0/0 spike), `varName` slugified from the
   label (`"Transnet tender"` → `transnet_tender`), de-duplicated against other
   linked nodes in the map (`_2` suffix).
2. Save the map (unsaved new maps save first — existing `handleSave` path).
3. Register the binding `{ mapId, nodeId, varName }` in a new renderer-global
   `mc-link-store.ts` (same subscriber pattern as the existing `mc-store.ts`
   used by the BATNA linkage).
4. Navigate to `/mc` (react-router `useNavigate`; HashRouter already in place).

## 4. § I side (MonteCarlo page)

- **Merged variable list**: map-linked variables render alongside § I's ad-hoc
  ones, badged `§ IV · <node label>`, with the node's `note` shown as a hint
  line. Ad-hoc variables stay ephemeral exactly as today.
- **Write-through editing**: edits to a linked variable's distribution update
  the map file via the existing `mapsApi` (load → patch `node.mc.distribution`
  + recompute `summary` → save). One source of truth; the link cannot dangle.
  If the map fails to load (deleted file), the variable falls back to ad-hoc
  with a visible "link broken" note — never silently lost.
- **Summary recompute**: on each distribution edit commit, p10/p50/p90/mean are
  computed by sampling the single variable (reuse `variablePercentile`) and
  written into `node.mc.summary`.
- **Formula bootstrap**: if the § I formula is empty when arriving via a push,
  pre-fill it with the pushed `varName` so Run works immediately.
- **Name collisions**: an ad-hoc variable named like a linked one is suffixed on
  creation (linked names win — they're persisted).

## 5. Back on the map (§ IV display)

- **Node chip**: a linked uncertainty node shows a small range line under its
  label: `14 · 26 · 44` (p10 · p50 · p90), in the dim meta style. Unconfigured
  link (no summary yet) shows `→ § I` instead.
- **Inspector**: distribution summary (kind + parameters + range), plus two
  actions: **Edit in § I** (re-registers binding, navigates) and **Unlink**
  (strips `node.mc`, confirm not required — it's recoverable by re-pushing).
- **Readout**: *Resolve next* rows append the range when present
  (`"3 factors hang on this · p10–p90: 14–44"`). Ranking stays structural —
  the range is display only.

## 6. Boundaries / non-goals

- No MC scenario persistence beyond the map-linked variables (ad-hoc § I state
  stays ephemeral).
- No per-run write-back of formula-outcome stats to the map.
- No distribution editor inside § IV (inspector shows summary only).
- No correlations on linked variables in v1 (the schema field exists in § I;
  linked vars simply don't expose it on the map side).
- Backend (py-engine) untouched — everything is renderer + core, like the
  BATNA linkage.

## 7. Testing (TDD)

- **core**: schema round-trip for `mc` block (incl. key-removal when cleared);
  varName slug/dedup helper.
- **desktop unit (RTL)**: push action seeds mc + saves + registers binding
  (mock navigate); role-change away clears mc; § I merges linked variables with
  badge + note; write-through persists distribution + summary via mapsApi mock;
  formula bootstrap; broken-link fallback; node chip renders range; inspector
  Edit-in-§I / Unlink; readout row range suffix.
- **e2e (playwright)**: § IV mark uncertainty → "→ Simulate" → § I shows badged
  variable → edit triangular params → back to § IV → chip shows range →
  save/reload map → chip survives.

## 8. File map

| Change | File |
|---|---|
| `mc` block on node schema | `packages/core/src/schemas/dependency-map.ts` |
| slug/dedup helper (+tests) | `packages/core/src/graph/` or `core/src/lib/` (tiny, pure) |
| link store | `packages/desktop/src/renderer/lib/mc-link-store.ts` (new) |
| push action + chip + inspector + readout range | `depmap/ReadoutPanel.tsx`, `depmap/NodeInspector.tsx`, `depmap/FactorNode.tsx`, `depmap/ContextMenu.tsx`, `pages/DependencyMap.tsx` |
| merged list + badge + write-through + bootstrap | `pages/MonteCarlo.tsx`, `pages/mc/VariableCard.tsx` |
| summary computation | reuse `renderer/lib/mc-percentile.ts` |
| e2e | `tests/e2e/depmap.spec.ts` |
