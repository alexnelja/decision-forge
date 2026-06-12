// packages/core/tests/dependency-map.test.ts
import { describe, it, expect } from "vitest";
import { DependencyMapSchema as S } from "../src/index.js"; // surfaced via the index barrel

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const E = "33333333-3333-4333-8333-333333333333";

/** Factory — fresh deep-copy per call so mutations don't leak across tests. */
function base() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    name: "decision",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    nodes: [{ id: A, label: "demand" }, { id: B, label: "margin" }],
    edges: [{ id: E, from: A, to: B }]
  };
}

describe("DependencyMapSchema", () => {
  it("accepts a valid map", () => {
    expect(S.parse(base()).edges).toHaveLength(1);
  });
  it("rejects a dangling edge", () => {
    const bad = { ...base(), edges: [{ id: E, from: A, to: "99999999-9999-4999-8999-999999999999" }] };
    expect(() => S.parse(bad)).toThrow(/unknown node|to/i);
  });
  it("rejects a self-loop", () => {
    const bad = { ...base(), edges: [{ id: E, from: A, to: A }] };
    expect(() => S.parse(bad)).toThrow(/self-loop/i);
  });

  it("accepts a node WITH a saved position", () => {
    const m = base();
    m.nodes[0] = { id: A, label: "demand", position: { x: 120, y: 80 } } as any;
    const result = S.parse(m);
    expect(result.nodes[0]?.position).toEqual({ x: 120, y: 80 });
  });

  it("accepts a node WITHOUT a saved position (backward-compat)", () => {
    // base already has nodes without position — just verify it still parses cleanly
    const result = S.parse(base());
    expect(result.nodes[0]?.position).toBeUndefined();
  });

  // --- v1.5 role + confidence ---
  it("accepts role on nodes and sign/confidence on edges", () => {
    const m = base();
    (m.nodes[0] as any).role = "objective";
    (m.nodes[1] as any).role = "lever";
    (m.edges[0] as any).sign = "-";
    (m.edges[0] as any).confidence = "assumption";
    expect(S.safeParse(m).success).toBe(true);
  });

  it("rejects unknown role", () => {
    const m = base();
    (m.nodes[0] as any).role = "wildcard";
    expect(S.safeParse(m).success).toBe(false);
  });

  it("no longer accepts the reserved v1.1 trio as typed fields (stripped by zod)", () => {
    // zod objects are non-strict: unknown keys are stripped, not rejected.
    const m = base();
    (m.nodes[0] as any).controllability = "control";
    const parsed = S.parse(m);
    expect((parsed.nodes[0] as any).controllability).toBeUndefined();
  });
});

// --- v1.6 mc block ---
describe("DependencyMapSchema mc block", () => {
  it("accepts an mc block on a node and round-trips it", () => {
    const m = base();
    (m.nodes[0] as any).mc = {
      varName: "transnet_tender",
      distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
      summary: { p10: 14, p50: 26, p90: 44, mean: 27.5, definedAt: "2026-06-11T12:00:00Z" }
    };
    const parsed = S.parse(m);
    expect((parsed.nodes[0] as any).mc?.varName).toBe("transnet_tender");
  });

  it("rejects an mc block with an invalid varName", () => {
    const m = base();
    (m.nodes[0] as any).mc = {
      varName: "3rd_party", // must start with a letter
      distribution: { kind: "triangular", min: 0, mode: 0, max: 0 }
    };
    expect(S.safeParse(m).success).toBe(false);
  });

  it("mc block is optional and absent by default", () => {
    const parsed = S.parse(base());
    expect("mc" in parsed.nodes[0]!).toBe(false);
  });
});
