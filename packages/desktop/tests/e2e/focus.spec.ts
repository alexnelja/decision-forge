import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

// Accessibility regression guard: buttons use Tailwind `focus:outline-none`, so
// keyboard users would have no visible focus without the global :focus-visible
// rule in index.css. This asserts that tabbing onto a button paints the ink ring.
test("keyboard focus paints a visible ring on buttons", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-focus-"));
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    env: e2eEnv({ HOME: tmpHome, DECISION_FORGE_DB_PATH: path.join(tmpHome, "f.db") })
  });
  try {
    const w = await app.firstWindow();
    await w.waitForLoadState("domcontentloaded");
    await w.getByRole("link", { name: /monte carlo/i }).first().click();
    await expect(w.getByRole("button", { name: /^run$/i })).toBeVisible();

    // Pressing Tab engages keyboard modality (:focus-visible). Walk focus until a
    // <button> is active, then read its computed outline.
    let info: { tag: string; color: string; width: string } | null = null;
    for (let i = 0; i < 40; i++) {
      await w.keyboard.press("Tab");
      info = await w.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, color: cs.outlineColor, width: cs.outlineWidth };
      });
      if (info?.tag === "BUTTON") break;
    }

    expect(info?.tag).toBe("BUTTON");
    expect(info?.color).toContain("241"); // --ink rgb(241, 236, 224)
    expect(info?.width).toBe("2px");
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
