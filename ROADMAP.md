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

## Plan 2 — Forecast Journal

- [ ] SQLite schema at `~/DecisionForge/forecasts.db`
- [ ] `ForecastSchema` (replace `z.unknown()` placeholder in `packages/core/src/schemas/forecast.ts`)
- [ ] CRUD flows (create / resolve / list) in renderer
- [ ] Calibration scoring (Brier, log score, buckets) in py-engine
- [ ] Journal page UI

## Plan 3 — Monte Carlo Sandbox

- [ ] `MCConfigSchema` (replace placeholder in `packages/core/src/schemas/mc-config.ts`)
- [ ] Simulation engine in `py-engine` (distributions, correlations, sensitivity)
- [ ] Results visualisation (histograms, tornado, scenario compare)
- [ ] Save/load scenarios as JSON

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
