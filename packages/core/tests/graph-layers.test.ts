import { describe, it, expect } from "vitest";
import { topoLayers } from "../src/graph/layers.js";

describe("topoLayers", () => {
  it("layers a simple chain", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] };
    const L = topoLayers(g);
    expect(L.get("a")).toBe(0);
    expect(L.get("b")).toBe(1);
    expect(L.get("c")).toBe(2);
  });
  it("places a diamond's join below both parents", () => {
    const g = { nodes: ["a","b","c","d"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"a",to:"c"},{from:"b",to:"d"},{from:"c",to:"d"}] };
    const L = topoLayers(g);
    expect(L.get("d")).toBe(2);
  });
  it("does not loop forever on a cycle (condenses SCCs)", () => {
    const g = { nodes: ["a","b","c"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"b",to:"a"},{from:"b",to:"c"}] };
    const L = topoLayers(g);
    expect(L.get("a")).toBe(L.get("b")); // same SCC → same layer
    expect(L.get("c")!).toBeGreaterThan(L.get("a")!);
  });
});
