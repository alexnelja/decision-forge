import { describe, it, expect, beforeEach } from "vitest";
import { setMcLinks, getMcLinks, addMcLink, clearMcLinks } from "../../src/renderer/lib/mc-link-store";
import { computeMcSummary } from "../../src/renderer/lib/mc-summary";

beforeEach(() => clearMcLinks());

describe("mc-link-store", () => {
  it("registers and lists bindings, deduping by nodeId", () => {
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" });
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" }); // re-register = replace
    addMcLink({ mapId: "m1", nodeId: "n2", varName: "price" });
    expect(getMcLinks()).toHaveLength(2);
  });
  it("setMcLinks replaces the whole set", () => {
    addMcLink({ mapId: "m1", nodeId: "n1", varName: "demand" });
    setMcLinks([]);
    expect(getMcLinks()).toEqual([]);
  });
});

describe("computeMcSummary", () => {
  it("returns ordered percentiles and a sane mean for a triangular", () => {
    const s = computeMcSummary({ kind: "triangular", min: 10, mode: 25, max: 50 });
    expect(s.p10).toBeGreaterThan(10); expect(s.p10).toBeLessThan(s.p50);
    expect(s.p50).toBeLessThan(s.p90); expect(s.p90).toBeLessThan(50);
    expect(s.mean).toBeGreaterThan(20); expect(s.mean).toBeLessThan(35);
    expect(typeof s.definedAt).toBe("string");
  });
});
