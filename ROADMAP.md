# Decision Forge — Roadmap

Source of truth: `../docs/superpowers/specs/2026-04-13-decision-forge-design.md`.

## Plan 1 — Foundation ✅ complete (2026-04-14)

- [x] pnpm + turbo monorepo skeleton
- [x] `@decision-forge/core` with Scenario Zod schema and path helpers
- [x] FastAPI sidecar (`py-engine`) with `/health`
- [x] Electron main + sidecar supervisor (spawn, health-wait, shutdown)
- [x] Renderer shell with module frames — `Masthead`, `ModuleFrame`, `Sidecar` + Home/Forecast/MC/Negotiation pages
- [x] Keychain stub (`keytar`) in `main/keychain.ts` — real wiring landed in Plan 4
- [x] Scenario JSON persistence under `~/DecisionForge/` — `main/scenarios.ts` + e2e in `tests/e2e/scenarios.spec.ts`
- [x] Plan 1 Definition-of-Done checklist complete

## Plan 2 — Forecast Journal ✅ complete (2026-04-14)

- [x] SQLite schema at `~/DecisionForge/forecasts.db` (questions, predictions, resolutions)
- [x] Forecast Zod schemas (Question, Prediction, Resolution, CalibrationReport)
- [x] CRUD flows (ask / predict / resolve / list) via `/forecast` REST endpoints
- [x] Calibration scoring (Brier, 10-bucket reliability decomposition) in py-engine
- [x] Journal page UI — AskForm, QuestionList, ResolveDialog, Calibration plot, SeedButton
- [x] Electron IPC bridge to sidecar (main + preload + renderer `forecast-api`)
- [x] Playwright e2e: ask → resolve → calibration roundtrip

## Plan 3 — Monte Carlo Sandbox ✅ complete (2026-04-14)

- [x] `MCConfigSchema` (full — normal/lognormal/triangular/uniform/pert/empirical)
- [x] Simulation engine in `py-engine` — numpy samplers, safe formula evaluator, summary stats
- [x] `/mc/run` endpoint with deterministic seeding and 1000-point wire truncation
- [x] VariableCard with live client-side mini-histogram (Box-Muller, no sidecar round-trip)
- [x] SimulationPanel with 40-bin outcome histogram, P5/P50/P95 column, threshold slider
- [x] LogForecastButton bridges § I → § III (log from any percentile)
- [x] MonteCarlo page wired with revenue-cost default config
- [x] Playwright e2e: run → log P90 → appears in Forecast journal

### Plan 3.5 status (partially complete 2026-04-14)

- [x] PERT + empirical sampling (py-engine and renderer preview)
- [x] Variable correlations (Iman-Conover rank-reordering preserving marginals)
- [x] First-order sensitivity ranking (Spearman² bars)
- [x] Compare mode — keep-as-baseline snapshot, dual-distribution histogram on shared x-range, signed delta indicators (citron up / vermilion down) under each summary stat (`971c0c6`)
- [ ] 3D particle cloud (react-three-fiber) — deferred
- [ ] SSE streaming of run progress — deferred (polling sufficient for <200ms runs)
- [ ] Sobol total-order indices (SAlib) — deferred

## Plan 4 — Negotiation Dojo ✅ complete (2026-04-14)

- [x] `NegoConfigSchema` — seats, issues, personas, BATNA, transcript types
- [x] Anthropic integration with tool-constrained agent (make_offer/accept/reject/walk)
- [x] `keytar` keychain wiring (service: "DecisionForge")
- [x] JSON-backed session store under `~/DecisionForge/nego/<id>.json`
- [x] `/nego/start`, `/nego/action/{id}`, `/nego/state/{id}`, `/nego/debrief/{id}`
- [x] Theater-script UI: KeyPrompt, Setup (Act I-III), SessionView, Debrief
- [x] Per-seat utility, BATNA reference, Nash equal-gain target

### Plan 4.5 status (partially complete 2026-04-14)

- [x] Multi-issue offers with per-issue sliders — continuous + discrete issues, add/remove with weight rebalancing, full terms map in offers (`971c0c6`)
- [x] Timeline scrubber / replay — Play/Pause/Rewind/End, cursor-synced ZOPA dot, transcript dimming past cursor in Debrief (`971c0c6`)
- [x] Nego E2E via `ScriptedDriver` — `DECISION_FORGE_NEGO_SCRIPT` env makes sidecar deterministic regardless of Anthropic key; `tests/e2e/nego.spec.ts` covers key-prompt → BEGIN → offer → accept → handshake → scrubber (`971c0c6`)
- [x] MC variable → BATNA linkage (`{refMCVar, percentile}`) fully wired — schema extends with optional percentile (default 50); `/nego/start` accepts pre-resolved `mc_samples` scalar map; session persists them; `batna_value` threads through `seat_utility` debrief AND `build_persona_prompt`; renderer ships `BatnaPicker` + `mc-percentile` helper + `mc-store` pub/sub; Setup buyer BATNA toggles to Link-to-MC and resolves percentile at BEGIN. E2E in `nego-batna.spec.ts` (passing — the "pre-existing bundle bug" was a misdiagnosed `ELECTRON_RUN_AS_NODE` env leak, now resolved; see `BUGS.md`). Plan 4.5 spec: `docs/superpowers/specs/2026-05-19-nego-mc-batna-linkage.md`.
- [ ] Thought-bubble reasoning trace — deferred
- [ ] 3D negotiation table (react-three-fiber) — deferred
- [ ] SSE streaming of agent turns — deferred (polling works for now)

## Cross-cutting / Later

- [x] E2E tests with Playwright (`packages/desktop/tests/e2e/`) — 6 specs: smoke, forecast, mc, nego, nego-batna, scenarios (all green)
- [/] Cross-module integration — partial: `LogForecastButton` bridges MC § III → Forecast § I; MC → BATNA (`{refMCVar, percentile}` in Nego) shipped (Plan 4.5). Reverse direction (forecast → MC param distribution) still open
- [ ] Visual/interaction polish per design §10
- [ ] Packaging, code-signing, auto-update
- [/] CLI package (`packages/cli/`) — `version`; `mc validate <config.json>` and
  `mc run <config.json> [--url U] [--json]` (reuses `core` `MCConfigSchema`, posts
  to `/mc/run`); full `forecast` journal: `list`, `calibration`, `ask <text>
  --prob P --by DATE [--tags a,b] [--criteria C]`, and `resolve <questionId>
  <true|false> [--notes N]` (validate against `core` schemas client-side, then
  POST). Stats/table or raw `--json`; shared flag+options parser; injectable
  `readFile`/`fetch`/`env`/`now`/`uuid`; 36 vitest tests. Remaining: scenario
  subcommands, optional sidecar auto-spawn.
