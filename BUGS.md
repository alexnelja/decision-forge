# Decision Forge — Known Bugs

Log new issues below with date, area (core / desktop / py-engine), repro, and current status.

## Open

### 2026-06-12 — Playwright reports the kinetic h1 intercepting canvas right-clicks (§ IV)

- **Area:** desktop / renderer (`components/ModuleFrame.tsx` h1 + `index.css` `.headline-kinetic`)
- **Repro:** e2e `setRoleViaContextMenu` in `tests/e2e/depmap.spec.ts` — right-clicking
  a canvas node times out with "h1 intercepts pointer events" unless `force: true`.
- **Suspicion (unconfirmed):** `.headline-kinetic`'s `unspace` animation uses
  `animation-fill-mode: both` — during the 800ms mount the h1 is hit-testable while
  invisible, and afterwards the pinned `filter: blur(0)` keeps a stacking context on
  it. Static layout reading says the h1 shouldn't overlap the canvas, so this may be
  transient-during-animation or a misattributed `elementFromPoint` during scroll.
  Possibly related to the user-reported "new node needs a second click to focus".
- **Next step:** reproduce headed (`PWDEBUG=1`), capture the real intercepting
  element. Cheap hardening either way: `pointer-events: none` on the non-interactive
  h1 and/or drop `fill-mode: both` so the filter clears after the animation.

## Resolved

### 2026-06-08 — log-forecast dialog spilled off the right viewport edge

- **Area:** desktop / renderer (`pages/mc/LogForecastButton.tsx`)
- **Repro:** Monte Carlo → Run → "Log P90 as forecast" → the slip popover.
- **Symptom:** the dialog was `absolute right-0 top-full` anchored to the narrow
  rightmost marginalia column, which itself sits partly past the window edge on a
  1400px-wide window. Measured dialog rect `right=1507` vs viewport `1400`, leaving
  the **Commit** button only ~13px on-screen. A real user saw Commit/Cancel clipped;
  Playwright's `mc.spec` flaked with "element was detached from the DOM, retrying"
  because it had to scroll a mostly-offscreen, `fade-up`-animating target into view.
- **Fix:** render the dialog as a centered, viewport-clamped modal (`fixed inset-0
  flex items-center justify-center p-6`, slip `max-w-[calc(100vw-3rem)]
  max-h-[calc(100vh-3rem)] overflow-auto`). It was already `aria-modal` with a
  full-screen backdrop, so this is the semantically correct form. Regression guard
  added to `tests/e2e/mc.spec.ts` (asserts the dialog rect is fully within the
  viewport). `mc.spec` now passes 6/6 repeats.

### 2026-05-19 → 2026-06-08 — "desktop main bundle throws on launch" was a misdiagnosis

- **Area:** desktop / launch environment (NOT the esbuild bundle)
- **Original report:** `TypeError: Cannot read properties of undefined (reading
  'whenReady')` at `dist/main/index.js`, blamed on esbuild collapsing the six
  `import … from "electron"` statements so that `import_electron5` "ends up
  undefined."
- **Actual root cause:** the crash only occurs when `ELECTRON_RUN_AS_NODE=1` is in
  the environment (some tool runners / worker contexts leak it). Under that flag
  Electron runs as plain Node, where `require("electron")` returns the **binary path
  string** instead of the API object — so `import_electron5.app` (and every other
  `import_electronN.ipcMain`) is undefined; `whenReady` just throws first because
  it's the first top-level access. Proven: `typeof require('electron')` is `'string'`
  in node mode, and the app boots cleanly when the var is unset. The proposed bundle
  fixes (single `electron.ts` re-export, `--format=esm`) would NOT have helped — ESM
  `import { app }` under RUN_AS_NODE binds to the same string.
- **Fix:** already in place — `tests/e2e/_env.ts` strips `ELECTRON_RUN_AS_NODE` from
  every Electron launch (commit `930c319`). All six e2e specs now boot and pass.
  Note: this is an environment concern, not a code defect; a packaged production
  app launched normally never sets the flag.
