/**
 * edge-style.test.ts — TDD for the pure `edgeVisual` helper (Task 6).
 *
 * All tests are written FIRST and must FAIL before implementation.
 */

import { describe, it, expect } from "vitest";
import { edgeVisual } from "../../src/renderer/pages/depmap/edge-style";
import type { DependencyEdge } from "@decision-forge/core";

function makeEdge(overrides: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    id: "edge-1",
    from: "a",
    to: "b",
    ...overrides,
  };
}

describe("edgeVisual — stroke colour from sign", () => {
  it("sign '+' → stroke is var(--plus)", () => {
    const result = edgeVisual(makeEdge({ sign: "+" }), { isCycle: false, dimmed: false });
    expect(result.stroke).toBe("var(--plus)");
  });

  it("sign '-' → stroke is var(--minus)", () => {
    const result = edgeVisual(makeEdge({ sign: "-" }), { isCycle: false, dimmed: false });
    expect(result.stroke).toBe("var(--minus)");
  });

  it("no sign → stroke is var(--ink-dim)", () => {
    const result = edgeVisual(makeEdge(), { isCycle: false, dimmed: false });
    expect(result.stroke).toBe("var(--ink-dim)");
  });
});

describe("edgeVisual — confidence dashing", () => {
  it("confidence 'assumption' → strokeDasharray '6 4'", () => {
    const result = edgeVisual(makeEdge({ confidence: "assumption" }), { isCycle: false, dimmed: false });
    expect(result.strokeDasharray).toBe("6 4");
  });

  it("confidence 'known' → no strokeDasharray", () => {
    const result = edgeVisual(makeEdge({ confidence: "known" }), { isCycle: false, dimmed: false });
    expect(result.strokeDasharray).toBeUndefined();
  });

  it("confidence absent → no strokeDasharray", () => {
    const result = edgeVisual(makeEdge(), { isCycle: false, dimmed: false });
    expect(result.strokeDasharray).toBeUndefined();
  });
});

describe("edgeVisual — cycle width encoding (NOT hue)", () => {
  it("isCycle → strokeWidth 2.5", () => {
    const result = edgeVisual(makeEdge(), { isCycle: true, dimmed: false });
    expect(result.strokeWidth).toBe(2.5);
  });

  it("isCycle does NOT change stroke colour — hue stays free for polarity", () => {
    // Cycle edge with sign "+" should still be green, not overridden by cycle hue
    const result = edgeVisual(makeEdge({ sign: "+" }), { isCycle: true, dimmed: false });
    expect(result.stroke).toBe("var(--plus)");
  });

  it("non-cycle → strokeWidth 1.5", () => {
    const result = edgeVisual(makeEdge(), { isCycle: false, dimmed: false });
    expect(result.strokeWidth).toBe(1.5);
  });
});

describe("edgeVisual — dimmed opacity", () => {
  it("dimmed → opacity 0.1", () => {
    const result = edgeVisual(makeEdge(), { isCycle: false, dimmed: true });
    expect(result.opacity).toBe(0.1);
  });

  it("not dimmed → opacity 1", () => {
    const result = edgeVisual(makeEdge(), { isCycle: false, dimmed: false });
    expect(result.opacity).toBe(1);
  });
});

describe("edgeVisual — combined", () => {
  it("assumption + dimmed + cycle + minus → all properties set correctly", () => {
    const result = edgeVisual(
      makeEdge({ sign: "-", confidence: "assumption" }),
      { isCycle: true, dimmed: true }
    );
    expect(result.stroke).toBe("var(--minus)");
    expect(result.strokeDasharray).toBe("6 4");
    expect(result.strokeWidth).toBe(2.5);
    expect(result.opacity).toBe(0.1);
  });
});
