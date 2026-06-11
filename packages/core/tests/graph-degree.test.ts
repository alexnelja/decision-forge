// packages/core/tests/graph-degree.test.ts
import { describe, it, expect } from "vitest";
import { degrees, rootsAndLeaves } from "../src/graph/degree.js";

const g = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "iso" }],
  edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "c" }]
};

describe("degree", () => {
  it("counts in/out/total", () => {
    const d = degrees(g);
    expect(d.get("a")).toEqual({ id: "a", in: 0, out: 2, total: 2 });
    expect(d.get("c")).toEqual({ id: "c", in: 2, out: 0, total: 2 });
  });
  it("roots = drivers (in=0, out>0); leaves = outcomes (out=0, in>0); isolated excluded", () => {
    const { roots, leaves } = rootsAndLeaves(g);
    expect(roots).toEqual(["a"]);
    expect(leaves).toEqual(["c"]);
    expect(roots).not.toContain("iso");
    expect(leaves).not.toContain("iso");
  });
});
