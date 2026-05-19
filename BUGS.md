# Decision Forge — Known Bugs

Log new issues below with date, area (core / desktop / py-engine), repro, and current status.

## Open

### 2026-05-19 — desktop main bundle throws on launch (e2e blocker)

- **Area:** desktop / build
- **Repro:** `pnpm --filter @decision-forge/desktop build:main` then
  `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist/main/index.js`
- **Expected:** Electron window opens; sidecar spawns.
- **Actual:** `TypeError: Cannot read properties of undefined (reading 'whenReady')`
  at `dist/main/index.js:~4635` — the bundled `import_electron5.app` is undefined.
- **Severity:** medium (unit tests still cover the wiring; only Playwright e2e is gated on this).
- **Notes:** esbuild collapses six `import … from "electron"` statements across
  `main/index.ts`, `main/scenarios.ts`, `main/forecast.ts`, `main/mc.ts`,
  `main/nego.ts`, `main/preload.ts`. The synthesised `import_electron5` is the
  only one that ends up undefined. Easiest fix: route every electron import
  through a single `main/electron.ts` re-export, or switch the main bundle to
  `--format=esm`. All current e2e specs (smoke, forecast, mc, nego, scenarios,
  nego-batna) are blocked on this.

## Resolved

_(none)_
