import { describe, it, expect } from "vitest";
import { mcVarName, isUnconfiguredDistribution } from "../src/lib/mc-link.js";

describe("mcVarName", () => {
  it("slugifies a label", () => expect(mcVarName("Transnet tender", new Set())).toBe("transnet_tender"));
  it("prepends v_ when the label starts with a non-letter", () =>
    expect(mcVarName("3rd party risk", new Set())).toBe("v_3rd_party_risk"));
  it("strips symbols and collapses runs", () =>
    expect(mcVarName("Rooibos — price/kg (net)", new Set())).toBe("rooibos_price_kg_net"));
  it("dedups with _2, _3 …", () => {
    const taken = new Set(["demand", "demand_2"]);
    expect(mcVarName("Demand", taken)).toBe("demand_3");
  });
  it("falls back to v for an all-symbol label", () =>
    expect(mcVarName("???", new Set())).toBe("v"));
  it("always satisfies the MCVariable name regex", () => {
    for (const label of ["3rd", "—", "a b", "_x", "9", "Ünïcode label"])
      expect(mcVarName(label, new Set())).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  // Reserved words — Python keywords and the py-engine evaluator's safe
  // globals would break or shadow formula evaluation; suffix with _.
  it("suffixes Python keywords (Lambda → lambda_)", () =>
    expect(mcVarName("Lambda", new Set())).toBe("lambda_"));
  it("suffixes evaluator safe globals (max → max_)", () =>
    expect(mcVarName("max", new Set())).toBe("max_"));
  it("dedups a reserved name correctly when taken", () => {
    const taken = new Set(["lambda_"]);
    expect(mcVarName("Lambda", taken)).toBe("lambda__2");
  });
});

describe("isUnconfiguredDistribution", () => {
  it("true for the all-zero triangular seed", () =>
    expect(isUnconfiguredDistribution({ kind: "triangular", min: 0, mode: 0, max: 0 })).toBe(true));
  it("false once any parameter is set", () =>
    expect(isUnconfiguredDistribution({ kind: "triangular", min: 0, mode: 5, max: 10 })).toBe(false));
  it("false for non-triangular kinds", () =>
    expect(isUnconfiguredDistribution({ kind: "normal", mean: 0, sd: 1 })).toBe(false));
});
