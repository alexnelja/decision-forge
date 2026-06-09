import { describe, it, expect } from "vitest";
import { analyze } from "../src/index.js";

it("bundles structural analysis for a map", () => {
  const g = { nodes: ["a","b","c"].map(id=>({id})), edges:[{from:"a",to:"b"},{from:"b",to:"c"}] };
  const r = analyze(g);
  expect(r.roots).toEqual(["a"]);
  expect(r.leaves).toEqual(["c"]);
  expect(r.cycles).toEqual([]);
  expect(r.layers.get("c")).toBe(2);
  expect(r.micmac.get("a")!.quadrant).toBeDefined();
});
