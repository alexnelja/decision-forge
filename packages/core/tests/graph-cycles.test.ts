import { describe, it, expect } from "vitest";
import { stronglyConnectedComponents, findCycles } from "../src/graph/cycles.js";

describe("cycles", () => {
  it("a DAG has no cycles", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }] };
    expect(findCycles(g)).toEqual([]);
  });
  it("detects a 3-cycle", () => {
    const g = { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }] };
    const cy = findCycles(g);
    expect(cy).toHaveLength(1);
    expect([...cy[0]].sort()).toEqual(["a", "b", "c"]);
  });
  it("ranks shorter cycles first", () => {
    const g = { nodes: ["a","b","c","d","e"].map(id => ({ id })),
      edges: [
        { from: "a", to: "b" }, { from: "b", to: "a" },           // 2-cycle
        { from: "c", to: "d" }, { from: "d", to: "e" }, { from: "e", to: "c" } // 3-cycle
      ] };
    const cy = findCycles(g);
    expect(cy.map(c => c.length)).toEqual([2, 3]);
  });
});
