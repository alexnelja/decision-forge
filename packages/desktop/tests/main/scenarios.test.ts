import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ScenarioStore } from "../../src/main/scenarios.js";
import type { Scenario } from "@decision-forge/core";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "df-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const sample = (id: string, name: string): Scenario => ({
  id,
  name,
  created: "2026-04-13T10:00:00Z",
  tags: ["test"],
  description: "",
  modules: {},
  runs: []
});

describe("ScenarioStore", () => {
  it("saves, lists, and loads a scenario", async () => {
    const store = new ScenarioStore(tmp);
    const s = sample("11111111-1111-1111-1111-111111111111", "alpha");
    await store.save(s);
    const list = await store.list();
    expect(list).toEqual([{ id: s.id, name: "alpha" }]);
    const loaded = await store.load(s.id);
    expect(loaded).toEqual(s);
  });

  it("rejects invalid scenarios on save", async () => {
    const store = new ScenarioStore(tmp);
    await expect(store.save({ bogus: true } as unknown as Scenario)).rejects.toThrow();
  });
});
