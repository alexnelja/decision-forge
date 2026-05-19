# Plan 4.5 — MC → BATNA Linkage

**Status:** in-progress on `feat/nego-mc-batna-linkage`
**Author:** Alex + Claude
**Date:** 2026-05-19

## Context

The Decision-Forge spec promises an integrated decision tool that links Forecast, Monte Carlo, and Negotiation modules. Today the integration is one-directional only: `LogForecastButton` carries an MC percentile into the Forecast journal. The reverse direction — feeding an MC distribution into a Negotiation seat's BATNA — is half-built and silently broken.

### What exists

- `NegoSeatPrivateSchema.batna` is already a union: `number | { refMCVar: string }`.
- `py-engine/decision_forge/nego/utility.py:batna_value()` already resolves both forms, with an optional `mc_samples: dict[str, float]` parameter.

### What's broken

1. `session.py:142` calls `batna_value(private)` without `mc_samples` → a `{refMCVar: "price"}` BATNA resolves to `0.0` silently.
2. `agent.py:95` injects `BATNA: {private.get('batna')}` into the AI prompt. For the refMCVar form, that emits the dict literal — the AI sees `{'refMCVar': 'price'}` as text and ignores it.
3. `/nego/start` route has no payload field for MC samples — no way to thread them in even if the rest worked.
4. `NegoSessionState` has no `mc_samples` field — even if accepted, the session can't persist them.
5. Renderer Setup wizard has no UI to link a seat's BATNA to an MC variable + percentile.

## Goals

Wire the MC → BATNA path end-to-end so a user can:

1. Run an MC simulation (existing flow).
2. Open the Negotiation Setup wizard and, for any seat with a BATNA, choose:
   - **Static scalar** (current behavior — number input), or
   - **Link to MC** (new): pick a variable from the most recent MC run and a percentile (P5–P95).
3. Start the session; the resolved scalar feeds both the utility computation and the AI agent prompt.
4. See the resolved value (and its provenance) in the Debrief replay.

## Non-goals

- Re-sampling per-turn. BATNA is locked at session start; this is realistic (your fallback doesn't change mid-negotiation) and matches the existing scalar semantics.
- Linking to MC formula output (`samples` array). For v1, only input-variable marginals are linkable. Output linkage can come in 4.5.1.
- 3D viz, SSE streaming, thought-bubble trace — separate deferred items.

## Design

### Schema (`packages/core/src/schemas/nego-config.ts`)

Extend the refMCVar branch with a percentile, defaulting to 50:

```ts
batna: z.union([
  z.number(),
  z.object({
    refMCVar: z.string().min(1),
    percentile: z.number().int().min(1).max(99).default(50)
  })
])
```

Backwards-compatible: a bare `{ refMCVar: "price" }` parses with `percentile: 50`.

### Wire format (`/nego/start`)

Add an optional `mc_samples` payload:

```ts
POST /nego/start
{
  "config": NegoConfig,
  "mc_samples": { "price": 5800, "shipping": 240 }   // resolved percentiles, name → scalar
}
```

The renderer resolves percentiles from the live MC run's marginal samples *before* sending. The backend treats `mc_samples` as an opaque scalar map — it does not re-compute percentiles. This keeps the backend stateless w.r.t. MC runs.

### Backend (`py-engine`)

1. `NegoSessionState` (in `session.py`): add `mc_samples: dict[str, float] = {}` field, persisted in the JSON-backed store.
2. `SessionStore.create()`: accept optional `mc_samples` kwarg, store on session.
3. `utility.py:batna_value()`: already accepts `mc_samples`. Plumb through:
   - `session.py:142` → `batna_value(private, self.mc_samples)`
   - Agent prompt rendering: resolve `private.batna` to scalar via `batna_value(private, mc_samples)` before injecting into the prompt template at `agent.py:95`.
4. `routers/nego.py:StartRequest`: add `mc_samples: dict[str, float] | None = None`.

### Frontend (`packages/desktop/src/renderer`)

1. New component `nego/BatnaPicker.tsx`:
   - Toggle: "Static scalar" / "Link to MC"
   - When linked: dropdown of MC variable names (sourced from `useLatestMCRun()` hook backed by global state — likely already in nego setup state, or pulled from `mc-api.ts`)
   - Percentile slider/dropdown (P5, P10, P25, P50, P75, P90, P95)
   - Live-preview of resolved scalar
2. Integrate `BatnaPicker` into existing Setup wizard for each seat.
3. On submit, compute percentile from MC variable's marginal samples and POST `mc_samples` alongside config.
4. Resolution helper in `lib/mc-percentile.ts`: `percentileOf(samples: number[], p: number) → number`.

### E2E (`tests/e2e/nego-batna.spec.ts`)

Scenario: configure a 2-variable MC config, run, pick an MC variable for the buyer's BATNA at P90, start a scripted nego, verify the Debrief shows the resolved BATNA scalar and the variable provenance.

## File changes

- **Modify:** `packages/core/src/schemas/nego-config.ts` — extend refMCVar branch
- **Modify:** `packages/py-engine/decision_forge/nego/session.py` — `mc_samples` field, persist, thread to utility
- **Modify:** `packages/py-engine/decision_forge/nego/agent.py` — resolve batna scalar before prompt injection
- **Modify:** `packages/py-engine/decision_forge/routers/nego.py` — `StartRequest.mc_samples`
- **Modify:** `packages/desktop/src/main/nego.ts` — IPC plumbs `mc_samples` through to `/nego/start`
- **Modify:** `packages/desktop/src/renderer/lib/nego-api.ts` — `start(config, mc_samples?)` signature
- **Create:** `packages/desktop/src/renderer/pages/nego/BatnaPicker.tsx`
- **Create:** `packages/desktop/src/renderer/lib/mc-percentile.ts`
- **Modify:** Setup wizard (locate in `pages/nego/`) — embed BatnaPicker
- **Modify:** Debrief view — surface BATNA provenance string
- **Create:** `packages/desktop/tests/e2e/nego-batna.spec.ts`
- **Add tests:** `packages/py-engine/tests/test_nego_batna_mc.py`, `packages/core/tests/nego-batna.test.ts`, renderer test for `BatnaPicker`

## Commit shape (TDD, narrow)

1. `test(core): refMCVar accepts optional percentile field`
2. `feat(core): extend NegoSeatPrivateSchema.batna refMCVar with percentile`
3. `test(py-engine): /nego/start accepts mc_samples; session persists them; utility/agent resolve via batna_value(mc_samples)`
4. `feat(py-engine): plumb mc_samples through StartRequest → Session → utility + agent prompt`
5. `test(desktop): BatnaPicker resolves percentile from MC samples; emits scalar`
6. `feat(desktop): BatnaPicker component + Setup wizard integration + mc-percentile helper`
7. `test(desktop e2e): MC → link BATNA P90 → start nego → Debrief shows resolved scalar`
8. `feat(desktop e2e): scenario implementation + ROADMAP tick`

## Verification

- `pnpm test` — core (28+1) + desktop (20+2) + cli (2) all pass
- `pytest packages/py-engine -q` — 66 + 2 = 68 pass
- `pnpm --filter @decision-forge/desktop test:e2e -- nego-batna` passes
- Manual: run dev app, configure 2-var MC, run, open Nego Setup, link buyer BATNA to "price" P90, start session against ScriptedDriver, verify Debrief shows scalar.

## Out of scope (followups)

- Linking to MC formula output (`mc_run.samples`) — needs an implicit name like `__outcome` and percentile resolution against the output samples.
- Re-sampling per-turn or per-round.
- BATNA provenance in the agent prompt (e.g., "your BATNA derives from price P90 = R5,800"). For v1 the AI just sees the scalar.
