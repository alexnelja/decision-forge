import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

/**
 * End-to-end with a scripted driver (no Anthropic calls, no API key needed).
 * The sidecar reads DECISION_FORGE_NEGO_SCRIPT and feeds the ScriptedDriver
 * the provided actions in order.
 */
test("Nego Dojo full flow (scripted): key prompt → setup → offer → AI accepts → debrief", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-nego-e2e-"));

  const script = JSON.stringify([
    { kind: "accept", speech: "That works." }
  ]);

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

    // Nav to § II
    await window.getByRole("link", { name: /negotiation/i }).first().click();
    await expect(window.getByRole("heading", { name: /negotiation dojo/i })).toBeVisible();

    // Either key prompt appears (no key yet) or setup does. If key prompt shows,
    // enter any dummy value — the sidecar uses the ScriptedDriver anyway.
    const keyField = window.locator("#anthropic-key");
    if (await keyField.isVisible().catch(() => false)) {
      await keyField.fill("sk-ant-dummy-for-e2e");
      await window.getByRole("button", { name: /raise curtain/i }).click();
    }

    // Setup — click BEGIN with defaults
    await window.getByRole("button", { name: /^BEGIN$/ }).click();

    // Session view — submit an offer
    await expect(window.getByText(/^Act I · Scene 1$/i)).toBeVisible();
    await window.getByRole("button", { name: /^Offer$/ }).click();

    // Scripted driver replies ACCEPT on supplier's turn → debrief
    await expect(window.getByRole("heading", { name: /a handshake/i })).toBeVisible({
      timeout: 5_000
    });

    // Terms should include the offered price_per_ton
    await expect(window.getByText(/price_per_ton/)).toBeVisible();

    // Replay scrubber is visible
    await expect(window.getByRole("slider", { name: /replay scrubber/i })).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
