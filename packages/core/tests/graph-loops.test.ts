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
});
