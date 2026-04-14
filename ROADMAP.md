# Decision Forge — Roadmap

Source of truth: `../docs/superpowers/specs/2026-04-13-decision-forge-design.md`.

## Plan 1 — Foundation (current)

- [x] pnpm + turbo monorepo skeleton
- [x] `@decision-forge/core` with Scenario Zod schema and path helpers
- [x] FastAPI sidecar (`py-engine`) with `/health`
- [x] Electron main + sidecar supervisor (spawn, health-wait, shutdown)
- [ ] Renderer shell with module frames (Monte Carlo / Negotiation / Forecast stubs)
- [ ] Keychain stub (`keytar`) — real wiring in Plan 4
- [ ] Scenario JSON persistence under `~/DecisionForge/`
- [ ] Plan 1 Definition-of-Done checklist complete

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
- [ ] 3D particle cloud (react-three-fiber) — deferred
- [ ] SSE streaming of run progress — deferred (polling sufficient for <200ms runs)
- [ ] Sobol total-order indices (SAlib) — deferred
- [ ] Compare mode (two scenarios overlaid) — deferred

## Plan 4 — Negotiation Dojo ✅ complete (2026-04-14)

- [x] `NegoConfigSchema` — seats, issues, personas, BATNA, transcript types
- [x] Anthropic integration with tool-constrained agent (make_offer/accept/reject/walk)
- [x] `keytar` keychain wiring (service: "DecisionForge")
- [x] JSON-backed session store under `~/DecisionForge/nego/<id>.json`
- [x] `/nego/start`, `/nego/action/{id}`, `/nego/state/{id}`, `/nego/debrief/{id}`
- [x] Theater-script UI: KeyPrompt, Setup (Act I-III), SessionView, Debrief
- [x] Per-seat utility, BATNA reference, Nash equal-gain target

### Deferred to Plan 4.5
- 3D negotiation table (react-three-fiber)
- SSE streaming of agent turns (polling works for now)
- Multi-issue offers with per-issue sliders
- MC variable → BATNA linkage (`{refMCVar}`) fully wired
- Thought-bubble reasoning trace
- Timeline scrubber / replay

## Cross-cutting / Later

- [ ] Cross-module integration (link forecasts to MC runs, etc.)
- [ ] Visual/interaction polish per design §10
- [ ] Packaging, code-signing, auto-update
- [ ] CLI package (stub referenced in plan, not yet scaffolded)
- [ ] E2E tests with Playwright (`packages/desktop/test:e2e`)
