import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { e2eEnv } from "./_env";

test("scenario save → list → load roundtrip via window.api", async () => {
  const tmpHome = mkdtempSync(path.join(os.tmpdir(), "df-e2e-"));
  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../dist/main/index.js")],
    // scenariosDir() resolves to $HOME/DecisionForge/scenarios
    env: e2eEnv({ HOME: tmpHome })
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    const id = "22222222-2222-2222-2222-222222222222";

    // Save a scenario via the real IPC
    const saveResult = await window.evaluate(async (id) => {
      const scenario = {
        id,
        name: "Acid Test",
        created: "2026-04-14T10:00:00Z",
        tags: ["roundtrip"],
        description: "Round-trip smoke for window.api.scenarios",
        modules: {},
        runs: []
      };
      await (window as any).api.scenarios.save(scenario);
      return "ok";
    }, id);
    expect(saveResult).toBe("ok");

    // List and assert it's there
    const list = await window.evaluate(async () =>
      (window as any).api.scenarios.list()
    );
    expect(list).toEqual([{ id, name: "Acid Test" }]);

    // Load and assert fidelity
    const loaded = await window.evaluate(async (id) =>
      (window as any).api.scenarios.load(id), id
    );
    expect(loaded).toMatchObject({
      id,
      name: "Acid Test",
      tags: ["roundtrip"]
    });
  } finally {
    await app.close();
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
