# Decision Forge

## Overview

Decision Forge is a personal decision-support desktop app combining Monte Carlo scenario sandboxing, AI-assisted negotiation practice, and calibrated forecasting journaling. It is a pnpm + turbo monorepo with a TypeScript/React Electron shell and a Python (FastAPI) sidecar engine — the shell owns UI, IPC, and persistence; the Python sidecar handles numerical/simulation work.

Full design: `../docs/superpowers/specs/2026-04-13-decision-forge-design.md`.
Plan 1 (current): `../docs/superpowers/plans/2026-04-13-decision-forge-plan-1-foundation.md`.

## Status

**Plan 2 — Forecast Journal complete (2026-04-14).** Working calibration journal: ask questions with probabilities, log predictions, resolve outcomes, view overall Brier score and 10-bucket reliability plot. SQLite at `~/DecisionForge/forecasts.db`, Python sidecar computes calibration math, Electron bridges IPC → REST. Monte Carlo (Plan 3) and Negotiation Dojo (Plan 4) remain stubs.

What exists in `packages/`:
- **`core/`** — shared TS library. Zod schemas (`scenario`, `forecast` — full; `mc-config`, `nego-config` placeholders), path helpers, vitest suite.
- **`desktop/`** — Electron app. Main process (`index.ts`, `preload.ts`, `sidecar.ts` supervisor, `scenarios.ts`, `forecast.ts` IPC, `keychain.ts` stub), React renderer (Vite + Tailwind + framer-motion) with working Forecast page (AskForm, QuestionList, ResolveDialog, Calibration, SeedButton) and stubs for Monte Carlo / Negotiation.
- **`py-engine/`** — FastAPI sidecar with `/health` and `/forecast` routers, SQLite persistence (`db.py`), calibration math (`calibration.py`), pytest.
- **`cli/`** — CLI stub with version command.

## Setup & Run

Prereqs: Node 20+, pnpm 9.15+, Python 3.12+.

```bash
# From repo root
pnpm install

# Python sidecar (one-time)
cd packages/py-engine
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd ../..

# Dev (Electron + Vite + sidecar)
pnpm dev

# Or per-package
pnpm --filter @decision-forge/desktop dev
pnpm --filter @decision-forge/core test

# Build / test / lint all
pnpm build
pnpm test
pnpm lint
```

## Architecture

```
decision-forge/
├── packages/
│   ├── core/       # TS + Zod: Scenario, MCConfig, NegoConfig, Forecast schemas; path helpers
│   ├── desktop/    # Electron main + React renderer (Vite, Tailwind, framer-motion)
│   └── py-engine/  # FastAPI sidecar (uvicorn), pydantic settings
├── turbo.json      # build/test/dev/lint/clean pipeline
└── pnpm-workspace.yaml
```

Electron main spawns the Python sidecar on launch, waits for `/health`, then loads the renderer. Renderer → main via IPC (preload); main → sidecar via `http://localhost:<port>`. Scenarios persist as JSON under `~/DecisionForge/`. Anthropic API key is stored in the OS keychain via keytar (stub today; wired in Plan 4).

## Roadmap

See `ROADMAP.md` for details.

- [x] Plan 1 — Foundation (monorepo, Electron shell, Python sidecar supervisor, core schemas)
- [ ] Plan 2 — Forecast Journal (SQLite at `~/DecisionForge/forecasts.db`, calibration scoring)
- [ ] Plan 3 — Monte Carlo Sandbox (fill in `MCConfigSchema`, simulation engine, charts)
- [ ] Plan 4 — Negotiation Dojo (Anthropic integration via keytar, nego config + transcripts)
- [ ] Cross-module integration, polish, packaging/signing

## Known Bugs

See `BUGS.md`. None identified — foundation stage.
