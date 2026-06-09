import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

test("§ IV Dependency Map — navigate, add factors, toggle views", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-depmap-e2e-"));
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: e2eEnv({ HOME: tmpHome })
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Navigate to § IV via the sidebar nav link.
    await window.getByRole("link", { name: /dependency map/i }).first().click();

    // The module heading must be visible.
    await expect(
      window.getByRole("heading", { name: /dependency map/i })
    ).toBeVisible({ timeout: 10_000 });

    // The CapturePanel input is visible with the expected placeholder.
    const input = window.getByPlaceholder(/add a factor/i);
    await expect(input).toBeVisible();

    // Add three factors via the capture input (type + Enter each).
    for (const label of ["Demand", "Supply", "Price"]) {
      await input.fill(label);
      await input.press("Enter");
    }

    // All three factor labels must appear in the CapturePanel list.
    // Use `exact: true` and narrow to `type="button"` to avoid colliding with
    // react-flow nodes which also carry role="button" but no `type` attribute.
    await expect(window.locator('button[type="button"]', { hasText: "Demand" }).first()).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('button[type="button"]', { hasText: "Supply" }).first()).toBeVisible();
    await expect(window.locator('button[type="button"]', { hasText: "Price" }).first()).toBeVisible();

    // The input should have been cleared ready for the next entry.
    await expect(input).toHaveValue("");

    // The view toggle — switch to 3D.
    const btn3d = window.getByRole("button", { name: /^3d$/i });
    await expect(btn3d).toBeVisible();
    await btn3d.click();

    // After toggling to 3D the button should be aria-pressed=true.
    await expect(btn3d).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

    // Switch back to Layered.
    const btnLayered = window.getByRole("button", { name: /^layered$/i });
    await expect(btnLayered).toBeVisible();
    await btnLayered.click();

    await expect(btnLayered).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

    // Verify factor labels are still present after view-mode round-trip.
    await expect(window.locator('button[type="button"]', { hasText: "Demand" }).first()).toBeVisible();
    await expect(window.locator('button[type="button"]', { hasText: "Supply" }).first()).toBeVisible();
    await expect(window.locator('button[type="button"]', { hasText: "Price" }).first()).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
