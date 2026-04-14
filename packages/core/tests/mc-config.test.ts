import { describe, it, expect } from "vitest";
import { MCConfigSchema } from "../src/schemas/mc-config.js";

const baseVariable = {
  name: "revenue",
  distribution: { kind: "normal", mean: 100, sd: 15 }
};

describe("MCConfig schema", () => {
  it("accepts a minimal config", () => {
    expect(() =>
      MCConfigSchema.parse({
        variables: [baseVariable],
        formula: "revenue",
        iterations: 10_000
      })
    ).not.toThrow();
  });

  it("defaults iterations to 10_000 when omitted", () => {
    const parsed = MCConfigSchema.parse({
      variables: [baseVariable],
      formula: "revenue"
    });
    expect(parsed.iterations).toBe(10_000);
  });

  it("rejects iterations below 100", () => {
    expect(() =>
      MCConfigSchema.parse({
        variables: [baseVariable],
        formula: "revenue",
        iterations: 50
      })
    ).toThrow();
  });

  it("rejects iterations above 1_000_000", () => {
    expect(() =>
      MCConfigSchema.parse({
        variables: [baseVariable],
        formula: "revenue",
        iterations: 2_000_000
      })
    ).toThrow();
  });

  it("rejects empty formula", () => {
    expect(() =>
      MCConfigSchema.parse({
        variables: [baseVariable],
        formula: "",
        iterations: 10_000
      })
    ).toThrow();
  });

  it("accepts each supported distribution kind", () => {
    const kinds: Array<Record<string, unknown>> = [
      { kind: "normal", mean: 0, sd: 1 },
      { kind: "lognormal", meanlog: 0, sdlog: 1 },
      { kind: "triangular", min: 0, mode: 1, max: 2 },
      { kind: "uniform", min: 0, max: 1 },
      { kind: "pert", min: 0, mode: 1, max: 2 },
      {
        kind: "empirical",
        samples: [0.1, 0.2, 0.3, 0.4]
      }
    ];
    for (const distribution of kinds) {
      expect(() =>
        MCConfigSchema.parse({
          variables: [{ name: "x", distribution }],
          formula: "x",
          iterations: 10_000
        })
      ).not.toThrow();
    }
  });

  it("accepts an optional seed", () => {
    const parsed = MCConfigSchema.parse({
      variables: [baseVariable],
      formula: "revenue",
      iterations: 10_000,
      seed: 42
    });
    expect(parsed.seed).toBe(42);
  });
});
