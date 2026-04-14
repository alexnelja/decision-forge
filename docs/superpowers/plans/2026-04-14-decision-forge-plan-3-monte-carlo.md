# Decision Forge — Plan 3: Monte Carlo Sandbox

**Date:** 2026-04-14
**Prereqs:** Plans 1 & 2 merged.
**Design reference:** `docs/superpowers/specs/2026-04-13-decision-forge-design.md` §6.

## Goal

Turn § I — Monte Carlo from a placeholder into a working sandbox: define
uncertain inputs as distributions, compose them into an outcome formula,
run 10 000 iterations, read mean/percentiles, and log a forecast from any
percentile into the Forecast Journal.

## Explicit scope cuts

Deferred to Plan 3.5 (marked with a reason — not forgotten, intentional):

- **3D particle cloud (react-three-fiber).** Wait until the core loop
  works; it's a wow, not a load-bearing feature.
- **SSE streaming of run progress.** 10k iterations run in <200ms; batch
  response is fine.
- **Sobol sensitivity (SAlib).** Adds a heavy dep; land after first use.
- **Compare mode (two scenarios overlaid).** Trivial once one runs; wait.
- **Correlations between variables.** Schema leaves room; sampler ignores.
- **Empirical + PERT distributions.** Schema includes them; sampler ships
  normal / lognormal / triangular / uniform (the four I actually use).
- **BATNA link to Negotiation.** Lands in Plan 4 where Nego needs it.

## File structure

```
packages/core/src/schemas/mc-config.ts   (rewritten)
packages/py-engine/decision_forge/
  mc/__init__.py, sampling.py, evaluate.py, stats.py   (new)
  routers/mc.py                                        (new)
  app.py                                               (+ include mc router)
packages/py-engine/tests/
  test_mc_sampling.py, test_mc_evaluate.py, test_mc_stats.py,
  test_mc_routes.py                                    (new)
packages/desktop/src/main/mc.ts                        (new — IPC bridge)
packages/desktop/src/main/index.ts                     (+ registerMcIpc)
packages/desktop/src/main/preload.ts                   (+ window.api.mc)
packages/desktop/src/renderer/
  lib/mc-api.ts                                        (new)
  pages/MonteCarlo.tsx                                 (rewritten)
  pages/mc/VariableCard.tsx                            (new)
  pages/mc/SimulationPanel.tsx                         (new)
  pages/mc/LogForecastButton.tsx                       (new)
packages/desktop/tests/
  main/mc.test.ts, renderer/MonteCarlo.test.tsx,
  e2e/mc.spec.ts                                       (new)
```

## Conventions

- TDD throughout — failing test first, confirm red for the right reason.
- Python math: numpy vectorised; samples are `np.ndarray[float64]`.
- Formula evaluation: restricted Python expressions, variables bound as
  numpy arrays so the formula broadcasts in one call.
- All numbers ISO-safe (no NaN/±Inf in output; clamp / reject).
- Keep editorial aesthetic — `--sec-mc` accent (citron `#c4d82e`).

---

### Task 1: Core — MCConfig Zod schema

**Goal:** Rewrite `mc-config.ts` placeholder. Ship all 6 distribution kinds in
the schema (even the two we don't sample yet, so renderer types don't drift).

Fields:
- `variables: Array<{ name, distribution, correlations? }>`
- `formula: string` (non-empty)
- `iterations: number` (int, 100..1_000_000, default 10_000)
- `seed?: number` (for reproducibility)

Distribution union: `normal | lognormal | triangular | uniform | pert | empirical`.

Tests: accept a minimal config, reject `iterations<100`, reject empty formula,
accept each distribution kind.

Commit: `feat(core): MCConfig schema`

---

### Task 2: Python — distribution sampler

**File:** `packages/py-engine/decision_forge/mc/sampling.py`

One pure function per supported distribution:
```python
def sample_normal(rng, n, *, mean, sd): -> np.ndarray
def sample_lognormal(rng, n, *, meanlog, sdlog): ...
def sample_triangular(rng, n, *, min, mode, max): ...
def sample_uniform(rng, n, *, min, max): ...
```
Plus a dispatcher:
```python
def sample(rng: np.random.Generator, n: int, dist: dict) -> np.ndarray
```
Tests: each sampler produces `n` finite samples; mean of many normal
samples approaches `mean`; triangular samples fall in `[min, max]`;
unsupported kind raises `ValueError` mentioning the kind.

Commit: `feat(py-engine): MC distribution samplers (normal, lognormal, triangular, uniform)`

---

### Task 3: Python — formula evaluator + stats

**Files:** `mc/evaluate.py`, `mc/stats.py`.

`evaluate.py`: compile a user formula once, then call with a dict of
`name → np.ndarray`. Use `compile(..., "<mc-formula>", "eval")` and
`eval(code, SAFE_GLOBALS, locals_dict)` where `SAFE_GLOBALS` is
`{"__builtins__": {}, "math": math, "np": np, "min": min, "max": max, "abs": abs}`.
Reject names starting with `_` at parse time. Return numpy array.

`stats.py`:
```python
def summarise(samples: np.ndarray) -> dict:
    # mean, sd, min, max, and p5/p10/p25/p50/p75/p90/p95/p99
```
Plus `prob_greater_than(samples, threshold) -> float` and
`percentile_of(samples, value) -> float` (inverse — returns the percentile
at which `value` sits; useful for "Log forecast from P90 of outcome > X").

Tests: formula `a + b` returns elementwise sum; disallow `import`,
`__import__`, `open`, etc; `summarise` returns the expected keys;
percentile_of on a uniform [0,1] sample at 0.7 lands near 0.7.

Commit: `feat(py-engine): safe formula evaluator + run stats`

---

### Task 4: Python — /mc/run endpoint

**File:** `packages/py-engine/decision_forge/routers/mc.py`.

```python
POST /mc/run
body: MCConfig
→ 200 { samples: number[], stats: {mean, sd, min, max, p5..p99}, iterations }
```

- Truncate `samples` to 1000 points (stride sample) before returning, so
  the renderer draws a clean histogram without shipping 10k floats.
- Compute stats on the full array, not the truncated one.
- Seed the RNG with `config.seed` if provided, else OS entropy.
- Reject formulas that reference names not declared in `variables`
  (404? 422 — Pydantic handles shape, we validate names in handler).
- On any eval error return 400 with a short reason.

Tests (with TestClient):
- Round-trip: config → non-empty samples, stats.mean finite, p50 present.
- Unknown name in formula → 400 with message naming the variable.
- Seeded runs are deterministic.
- `iterations=200` runs faster than default.

Commit: `feat(py-engine): /mc/run endpoint`

---

### Task 5: Desktop main — MC IPC bridge

Mirror `ForecastClient` exactly:

```ts
class McClient { run(cfg: MCConfig): Promise<McRunResult> }
registerMcIpc(baseUrl: string)
// preload exposes window.api.mc = { run }
```

Vitest: URL, method, error path. Commit: `feat(desktop): MC IPC bridge`.

---

### Task 6: Renderer — VariableCard

**File:** `pages/mc/VariableCard.tsx`.

One card per `MCVariable`:
- Name input (top, editorial serif)
- Distribution selector as 4 small radio-like buttons (N / LN / T / U)
- Parameter fields change based on distribution
- Inline SVG mini-histogram (100×50) of *this variable's* samples,
  drawn from a client-side quick sampler (1000 samples — pure JS is
  fine for a preview). Recomputes on parameter change.
- Remove (X) button in top right

Deliberately *no* server round-trip for the preview — feels instant.

Keep the component pure: props `{ variable, onChange, onRemove }`.

Client-side samplers in `lib/mc-client-samplers.ts` (pure JS,
Box-Muller for normal; derive lognormal / triangular / uniform
cheaply).

Tests: changing `sd` on a normal card calls `onChange` with the new
`sd`; histogram renders a `<path>` with non-zero length.

Commit: `feat(desktop): MC VariableCard with live mini-histogram`

---

### Task 7: Renderer — SimulationPanel

**File:** `pages/mc/SimulationPanel.tsx`.

Props: `{ config, onRun }`. Shows:
- A large "Run" button (section accent citron)
- Iterations field (collapsed; defaults to 10 000)
- Formula input (mono textarea)
- After a run: outcome histogram (100×300 SVG, 40 bins) and a stats
  column (mean / sd / P5 / P50 / P95) in a two-column grid
- A "threshold" slider that overlays a vertical line on the histogram
  and shows `P(outcome > X) = ...%` below

Pending state while the sidecar runs (button → "Running…").

Test: clicking Run invokes `onRun(config)`; post-result the histogram
renders bins.

Commit: `feat(desktop): MC SimulationPanel with run button + outcome histogram`

---

### Task 8: Renderer — Log forecast from percentile

**File:** `pages/mc/LogForecastButton.tsx`.

After a run, a button "Log P90 as forecast →" opens a small popover:
- Threshold value (prefilled from P90)
- Question text (prefilled: "Will `<formula>` exceed `<P90 value>`?")
- Resolve-by date (defaults to today + 3 months)
- Commit → calls `forecastApi.ask` with the corresponding probability
  (derived from `percentile_of` — so selecting P90 gives a baseline p=0.10
  since "exceed P90" is a 10% event by construction; let user override).

The popover seeds `forecastApi` with a commit, closes, and shows a toast
("Logged to § III — Forecast").

Test (vitest with stubbed forecastApi + mcApi): after clicking commit,
forecastApi.ask was called with a question text containing the numeric
threshold.

Commit: `feat(desktop): Log forecast from MC percentile (bridges § I → § III)`

---

### Task 9: MonteCarlo page + E2E

Wire it all:
- Left column: a vertical stack of VariableCards + "Add variable" button.
- Center: SimulationPanel.
- Right (marginalia): LogForecastButton (only shown after a run) + tips.

Default config on first mount — two variables:
```ts
{
  variables: [
    { name: "revenue", distribution: { kind: "normal", mean: 100, sd: 15 } },
    { name: "cost",    distribution: { kind: "triangular", min: 40, mode: 50, max: 70 } }
  ],
  formula: "revenue - cost",
  iterations: 10_000
}
```
So the first run shows something meaningful without setup.

**E2E spec** (`tests/e2e/mc.spec.ts`):
1. Launch Electron in tmp-home.
2. Navigate to § I.
3. Click Run. Assert P50 appears (non-empty numeral).
4. Click "Log P90 as forecast". Commit the popover.
5. Navigate to § III. Assert the new question is in the list.

Commit: `test(desktop): MC page wiring + e2e run → log forecast → appears in journal`

---

## Definition of Done

- [ ] `pnpm test` across workspace, `pytest` in py-engine, `pnpm test:e2e`
      in desktop all green.
- [ ] `pnpm dev` — § I opens with the two-variable default config and a
      single Run click produces a histogram and stats.
- [ ] Logging from P90 lands a new unresolved question in § III.
- [ ] No 3D, no SSE, no Sobol — and that's fine: the plan explicitly
      defers them.
