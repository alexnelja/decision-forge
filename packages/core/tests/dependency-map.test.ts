// packages/core/tests/dependency-map.test.ts
import { describe, it, expect } from "vitest";
import { DependencyMapSchema as S } from "../src/index.js"; // surfaced via the index barrel

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const E = "33333333-3333-4333-8333-333333333333";
const base = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "decision",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [{ id: A, label: "demand" }, { id: B, label: "margin" }],
  edges: [{ id: E, from: A, to: B }]
};

describe("DependencyMapSchema", () => {
  it("accepts a valid map", () => {
    expect(S.parse(base).edges).toHaveLength(1);
  });
  it("rejects a dangling edge", () => {
    const bad = { ...base, edges: [{ id: E, from: A, to: "99999999-9999-4999-8999-999999999999" }] };
    expect(() => S.parse(bad)).toThrow(/unknown node|to/i);
  });
  it("rejects a self-loop", () => {
    const bad = { ...base, edges: [{ id: E, from: A, to: A }] };
    expect(() => S.parse(bad)).toThrow(/self-loop/i);
  });
  it("accepts v1.1 optional fields (forward-compat)", () => {
    const fwd = { ...base,
      nodes: [{ id: A, label: "demand", type: "objective", controllability: "control", uncertainty: { flag: true, impact: "high" } }, { id: B, label: "margin" }],
      edges: [{ id: E, from: A, to: B, sign: "+" }] };
    expect(() => S.parse(fwd)).not.toThrow();
  });
});
