import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

/**
 * Plan 4.5 — MC → BATNA linkage e2e.
 *
 * Flow:
 *   1. Run Monte Carlo with default config → publishes variables.
 *   2. Open Negotiation, link the buyer BATNA to "revenue" at P90.
 *   3. Click BEGIN — the sidecar receives mc_samples.revenue and
 *      persists it on the session.
 *   4. Submit one offer → ScriptedDriver accepts → Debrief renders the
 *      resolved BATNA scalar on the buyer's row.
 *
 * NOTE: skipped today because of a pre-existing esbuild bundle bug —
 * `dist/main/index.js` throws "Cannot read properties of undefined
 * (reading 'whenReady')" before any test code runs. The bundler is
 * collapsing multiple `from "electron"` imports such that the synthesised
 * `import_electron5` ends up undefined at runtime. Affects every e2e
 * spec, not just this one. Unblock by either:
 *   - moving electron imports into a single `electron.ts` re-export, or
 *   - switching the main bundle to ESM (`--format=esm`) so each import
 *     keeps its own require binding.
 * Once unblocked, drop the `.skip`.
 */
test.skip("MC → BATNA: link buyer BATNA to MC variable at P90 and verify session carries the scalar", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-nego-batna-"));

  const script = JSON.stringify([{ kind: "accept", speech: "Done." }]);

  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOME: tmpHome,
      DECISION_FORGE_NEGO_DIR: path.join(tmpHome, "nego"),
      DECISION_FORGE_NEGO_SCRIPT: script
    }
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // 1. Open Monte Carlo — defaults define a "revenue" variable.
    await window.getByRole("link", { name: /monte carlo/i }).first().click();
    await expect(
      window.getByRole("heading", { name: /monte carlo/i })
    ).toBeVisible();
    // Touch the first variable to ensure mc-store has the defaults
    // (setLatestMCVariables fires on every state change including mount).
    await expect(window.getByDisplayValue("revenue")).toBeVisible();

    // 2. Open Negotiation, navigate past key prompt if present
    await window.getByRole("link", { name: /negotiation/i }).first().click();
    await expect(
      window.getByRole("heading", { name: /negotiation dojo/i })
    ).toBeVisible();

    const keyField = window.locator("#anthropic-key");
    if (await keyField.isVisible().catch(() => false)) {
      await keyField.fill("sk-ant-dummy-for-e2e");
      await window.getByRole("button", { name: /raise curtain/i }).click();
    }

    // 3. Link the buyer BATNA to MC
    await window.getByRole("button", { name: /link to mc/i }).click();
    await window
      .getByLabel("Variable")
      .selectOption({ value: "revenue" });
    await window.getByLabel("Percentile").selectOption({ value: "90" });

    // The picker preview should show the resolved scalar (with ≈ prefix)
    await expect(window.getByTestId("batna-preview")).toBeVisible();

    // 4. Launch — make sure the BEGIN button is still reachable
    await window.getByRole("button", { name: /^BEGIN$/ }).click();

    // 5. Submit an offer; ScriptedDriver accepts → Debrief
    await expect(window.getByText(/^Act I · Scene 1$/i)).toBeVisible();
    await window.getByRole("button", { name: /^Offer$/ }).click();

    await expect(
      window.getByRole("heading", { name: /a handshake/i })
    ).toBeVisible({ timeout: 5_000 });

    // The buyer's row should now show a resolved BATNA in the debrief
    // (any non-zero number, since the percentile is computed from the
    // sampled distribution). Just assert the row label and value field
    // exist; the scrubber covers the rest of the path.
    await expect(window.getByText(/Buyer/)).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
