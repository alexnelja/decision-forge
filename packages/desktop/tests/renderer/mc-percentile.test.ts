import { describe, it, expect } from "vitest";
import {
  percentileFromSorted,
  variablePercentile
} from "../../src/renderer/lib/mc-percentile";
import type { MCVariable } from "@decision-forge/core";

describe("percentileFromSorted", () => {
  it("returns the min for p<=0", () => {
    expect(percentileFromSorted([1, 5, 10], 0)).toBe(1);
  });

  it("returns the max for p>=100", () => {
    expect(percentileFromSorted([1, 5, 10], 100)).toBe(10);
  });

  it("linearly interpolates between samples", () => {
    // 5 samples, P50 should be the middle one
    expect(percentileFromSorted([0, 10, 20, 30, 40], 50)).toBe(20);
  });

  it("computes P90 correctly", () => {
    // [0..100], p90 = 90
    const xs: number[] = [];
    for (let i = 0; i <= 100; i++) xs.push(i);
    expect(percentileFromSorted(xs, 90)).toBeCloseTo(90, 1);
  });

  it("handles empty array safely", () => {
    expect(percentileFromSorted([], 50)).toBe(0);
  });

  it("handles single-element array", () => {
    expect(percentileFromSorted([42], 50)).toBe(42);
  });
});

describe("variablePercentile", () => {
  it("computes a stable P50 from a uniform distribution", () => {
    const v: MCVariable = {
      name: "price",
      distribution: { kind: "uniform", min: 100, max: 200 }
    };
    const p50 = variablePercentile(v, 50, 5000);
    // P50 of Uniform(100, 200) → ~150 with stochastic noise
    expect(p50).toBeGreaterThan(140);
    expect(p50).toBeLessThan(160);
  });

  it("returns higher value for higher percentile", () => {
    const v: MCVariable = {
      name: "x",
      distribution: { kind: "normal", mean: 100, sd: 10 }
    };
    const p10 = variablePercentile(v, 10, 5000);
    const p90 = variablePercentile(v, 90, 5000);
    expect(p90).toBeGreaterThan(p10);
  });

  it("returns the expected percentile from a triangular distribution", () => {
    const v: MCVariable = {
      name: "x",
      distribution: { kind: "triangular", min: 0, mode: 50, max: 100 }
    };
    const p50 = variablePercentile(v, 50, 5000);
    // Mode-centered triangular: P50 sits near the mode for symmetric case
    expect(p50).toBeGreaterThan(40);
    expect(p50).toBeLessThan(60);
  });
});
