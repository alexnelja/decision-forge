import { describe, it, expect } from "vitest";
import { layoutPositions } from "../../src/renderer/pages/depmap/layout";

describe("layoutPositions", () => {
  it("assigns y increasing with dependency depth", () => {
    const pos = layoutPositions(
      [{ id: "a" }, { id: "b" }],
      [{ from: "a", to: "b" }]
    );
    expect(pos.get("b")!.y).toBeGreaterThan(pos.get("a")!.y);
  });

  it("returns positions for all nodes", () => {
    const pos = layoutPositions(
      [{ id: "x" }, { id: "y" }, { id: "z" }],
      [{ from: "x", to: "y" }, { from: "y", to: "z" }]
    );
    expect(pos.has("x")).toBe(true);
    expect(pos.has("y")).toBe(true);
    expect(pos.has("z")).toBe(true);
  });

  it("handles an empty graph", () => {
    const pos = layoutPositions([], []);
    expect(pos.size).toBe(0);
  });
});
