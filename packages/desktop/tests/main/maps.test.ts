import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { MapStore } from "../../src/main/maps.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "df-maps-")); });

const map = {
  id: "44444444-4444-4444-8444-444444444444", name: "m",
  createdAt: "2026-06-09T00:00:00.000Z", updatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [{ id: "11111111-1111-4111-8111-111111111111", label: "x" }], edges: []
};

describe("MapStore", () => {
  it("save → load round-trips", async () => {
    const s = new MapStore(dir);
    await s.save(map);
    expect((await s.load(map.id))?.name).toBe("m");
  });
  it("list returns id+name", async () => {
    const s = new MapStore(dir); await s.save(map);
    expect(await s.list()).toEqual([{ id: map.id, name: "m" }]);
  });
  it("load missing → null", async () => {
    expect(await new MapStore(dir).load("nope")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
