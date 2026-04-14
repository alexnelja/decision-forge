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

### Deferred to Plan 3.5 (intentional)
- 3D particle cloud (react-three-fiber)
- SSE streaming of run progress
- Sobol sensitivity (SAlib)
- Compare mode (two scenarios overlaid)
- Correlations between variables (schema ready; sampler ignores)
- Empirical + PERT sampling (schema ready; not wired)

## Plan 4 — Negotiation Dojo

- [ ] `NegoConfigSchema` (replace placeholder)
- [ ] Anthropic API integration via Claude Agent SDK / SDK
- [ ] Real `keytar` wiring in `packages/desktop/src/main/keychain.ts`
- [ ] Transcript storage + replay
- [ ] Role/persona presets, rubric-based feedback

## Cross-cutting / Later

- [ ] Cross-module integration (link forecasts to MC runs, etc.)
- [ ] Visual/interaction polish per design §10
- [ ] Packaging, code-signing, auto-update
- [ ] CLI package (stub referenced in plan, not yet scaffolded)
- [ ] E2E tests with Playwright (`packages/desktop/test:e2e`)
