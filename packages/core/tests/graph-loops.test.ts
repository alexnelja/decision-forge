// packages/core/tests/graph-loops.test.ts
import { describe, it, expect } from "vitest";
import { classifyLoops, loopValence } from "../src/graph/loops.js";

const n = (...ids: string[]) => ids.map((id) => ({ id }));

describe("classifyLoops", () => {
  it("all-positive cycle is reinforcing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a" }, // unsigned counts as +
    ]};
    expect(classifyLoops(g)).toEqual([{ nodes: expect.arrayContaining(["a", "b"]), class: "reinforcing" }]);
  });

  it("odd number of minus edges is balancing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "-" as const },
      { from: "b", to: "a", sign: "+" as const },
    ]};
    expect(classifyLoops(g)[0]!.class).toBe("balancing");
  });

  it("two minus edges is reinforcing", () => {
    const g = { nodes: n("a", "b"), edges: [
      { from: "a", to: "b", sign: "-" as const },
      { from: "b", to: "a", sign: "-" as const },
    ]};
    expect(classifyLoops(g)[0]!.class).toBe("reinforcing");
  });

  it("acyclic graph yields no loops", () => {
    expect(classifyLoops({ nodes: n("a", "b"), edges: [{ from: "a", to: "b" }] })).toEqual([]);
  });
});

describe("loopValence", () => {
  it("reinforcing loop with + path to objective is virtuous", () => {
    const g = { nodes: n("a", "b", "obj"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
      { from: "b", to: "obj", sign: "+" as const },
    ]};
    expect(loopValence(["a", "b"], g, "obj")).toBe("virtuous");
  });

  it("negative path to objective is vicious", () => {
    const g = { nodes: n("a", "b", "obj"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
      { from: "b", to: "obj", sign: "-" as const },
    ]};
    expect(loopValence(["a", "b"], g, "obj")).toBe("vicious");
  });

  it("no path or no objective → undefined", () => {
    const g = { nodes: n("a", "b", "x"), edges: [
      { from: "a", to: "b" }, { from: "b", to: "a" },
    ]};
    expect(loopValence(["a", "b"], g, "x")).toBeUndefined();
    expect(loopValence(["a", "b"], g, undefined)).toBeUndefined();
  });

  it("equal-length + and − paths → vicious, regardless of edge order", () => {
    // loop a↔b; two 2-hop paths b→x→obj (all +) and b→y→obj (one −).
    const loopEdges = [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
    ];
    const posPath = [
      { from: "b", to: "x", sign: "+" as const },
      { from: "x", to: "obj", sign: "+" as const },
    ];
    const negPath = [
      { from: "b", to: "y", sign: "+" as const },
      { from: "y", to: "obj", sign: "-" as const },
    ];
    const nodes = n("a", "b", "x", "y", "obj");
    // + path listed first
    expect(loopValence(["a", "b"], { nodes, edges: [...loopEdges, ...posPath, ...negPath] }, "obj")).toBe("vicious");
    // − path listed first
    expect(loopValence(["a", "b"], { nodes, edges: [...loopEdges, ...negPath, ...posPath] }, "obj")).toBe("vicious");
  });

  it("node reachable with both signs: − continuation to objective still found", () => {
    // m is reached with "+" first (b→m, listed first) and with "−" later
    // (b→y −, y→m +). Only the −-arrival composes to a negative path since
    // m→obj is "+". A seen-set keyed by id alone would block the − arrival.
    const g = { nodes: n("a", "b", "y", "m", "obj"), edges: [
      { from: "a", to: "b", sign: "+" as const },
      { from: "b", to: "a", sign: "+" as const },
      { from: "b", to: "m", sign: "+" as const },  // m seen with + first
      { from: "b", to: "y", sign: "-" as const },
      { from: "y", to: "m", sign: "+" as const },  // m again, now with −
      { from: "m", to: "obj", sign: "+" as const },
    ]};
    expect(loopValence(["a", "b"], g, "obj")).toBe("vicious");
  });
});
