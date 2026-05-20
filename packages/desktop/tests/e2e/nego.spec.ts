import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

/**
 * End-to-end with a scripted driver (no Gemini calls, no API key needed).
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
    env: e2eEnv({
      HOME: tmpHome,
      DECISION_FORGE_NEGO_DIR: path.join(tmpHome, "nego"),
      DECISION_FORGE_NEGO_SCRIPT: script,
      // Fake the keychain so the key gate is satisfied without a real macOS
      // Keychain write (which blocks on an access prompt headless). The
      // sidecar uses the ScriptedDriver regardless of this value.
      DECISION_FORGE_FAKE_KEYCHAIN: "AIza-dummy-for-e2e"
    })
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // Nav to § II
    await window.getByRole("link", { name: /negotiation/i }).first().click();
    await expect(window.getByRole("heading", { name: /negotiation dojo/i })).toBeVisible();

    // Key gate is pre-satisfied via DECISION_FORGE_FAKE_KEYCHAIN → straight to Setup.
    await window.getByRole("button", { name: /^BEGIN$/ }).click();

    // Session view — submit an offer
    await expect(window.getByText(/^Act I · Scene 1$/i)).toBeVisible();
    await window.getByRole("button", { name: /^Offer$/ }).click();

    // Scripted driver replies ACCEPT on supplier's turn → debrief
    await expect(window.getByRole("heading", { name: /a handshake/i })).toBeVisible({
      timeout: 5_000
    });

    // Terms should include the offered price_per_ton (appears in both the
    // deal summary and the replay transcript — match the first).
    await expect(window.getByText(/price_per_ton/).first()).toBeVisible();

    // Replay scrubber is visible
    await expect(window.getByRole("slider", { name: /replay scrubber/i })).toBeVisible();
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
