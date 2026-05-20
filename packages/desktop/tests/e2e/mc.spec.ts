import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

test("MC run → log P90 → appears in Forecast journal", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-mc-e2e-"));
  const dbPath = path.join(tmpHome, "forecasts.db");
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: e2eEnv({ HOME: tmpHome, DECISION_FORGE_DB_PATH: dbPath })
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Navigate to § I — Monte Carlo.
    await window.getByRole("link", { name: /monte carlo/i }).first().click();
    await expect(window.getByRole("heading", { name: /monte carlo/i })).toBeVisible();

    // Click Run — the default config is revenue - cost.
    await window.getByRole("button", { name: /^run$/i }).click();

    // Wait for the outcome histogram to render. P50 label appears in the stats column.
    await expect(window.locator("svg.outcome-histogram")).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(/P50/i).first()).toBeVisible();

    // Log P90 as forecast.
    await window.getByRole("button", { name: /log p90 as forecast/i }).click();
    await expect(window.getByRole("dialog")).toBeVisible();

    // Commit the popover.
    await window.getByRole("button", { name: /^commit$/i }).click();

    // Confirmation stamp appears ("Logged → § III Forecast"); popover closes.
    await expect(window.getByText("Logged", { exact: true })).toBeVisible();

    // Navigate to § III — Forecast and verify the question landed.
    await window.getByRole("link", { name: /forecast/i }).first().click();
    await expect(window.getByRole("heading", { name: /forecast journal/i })).toBeVisible();
    await expect(window.getByText(/revenue - cost/i).first()).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
