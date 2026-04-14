import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

test("ask → resolve → calibration roundtrip via the UI", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-forecast-e2e-"));
  const dbPath = path.join(tmpHome, "forecasts.db");
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOME: tmpHome,
      DECISION_FORGE_DB_PATH: dbPath
    }
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Navigate to the Forecast section (use the sidebar rail link).
    await window.getByRole("link", { name: /forecast/i }).first().click();
    await expect(window.getByRole("heading", { name: /forecast journal/i })).toBeVisible();

    // Sanity: empty-state copy shows on first load.
    await expect(window.getByText(/ledger is ruled/i)).toBeVisible();

    // Ask a question at p = 80%.
    const textInput = window.getByPlaceholder(/Will …\?/).first();
    await textInput.fill("Will the e2e test pass?");

    // Set probability to 80. Native range slider — evaluate to set value and dispatch input.
    await window.evaluate(() => {
      const r = document.querySelector('input[type="range"]') as HTMLInputElement;
      if (r) {
        const proto = Object.getPrototypeOf(r);
        const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
        setter.call(r, "80");
        r.dispatchEvent(new Event("input", { bubbles: true }));
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await window.getByRole("button", { name: /commit prediction/i }).first().click();

    // The new row should appear.
    await expect(window.getByText(/will the e2e test pass\?/i)).toBeVisible();

    // Resolve as "It happened".
    await window.getByRole("button", { name: /^Resolve$/ }).first().click();
    await expect(window.getByRole("dialog")).toBeVisible();
    await window.getByRole("button", { name: /it happened/i }).click();
    // Dialog closes, row flips to resolved state.
    await expect(window.getByText(/✓ HAPPENED/)).toBeVisible();

    // Calibration panel updates. Brier for p=0.8, outcome=1 = 0.04.
    await expect(window.getByText(/^0\.040$/).first()).toBeVisible();
    await expect(window.getByText(/1 RESOLVED/).first()).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
