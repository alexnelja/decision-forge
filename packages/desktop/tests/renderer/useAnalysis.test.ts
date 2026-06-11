import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnalysis } from "../../src/renderer/pages/depmap/useAnalysis";

// Helper UUIDs for test fixtures
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const EA = "44444444-4444-4444-8444-444444444444";
const EB = "55555555-5555-4555-8555-555555555555";

function makeMap(
  nodes: Array<{ id: string; label: string }>,
  edges: Array<{ id: string; from: string; to: string }>
) {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    name: "test",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    nodes,
    edges,
  } as any;
}

describe("useAnalysis", () => {
  it("derives roots and leaves from a simple chain", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }],
      [{ id: EA, from: A, to: B }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    expect(result.current.roots).toContain(A);
    expect(result.current.leaves).toContain(B);
  });

  it("identifies no cycles in a DAG", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }, { id: C, label: "c" }],
      [{ id: EA, from: A, to: B }, { id: EB, from: B, to: C }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    expect(result.current.cycles).toHaveLength(0);
    expect(result.current.cycleNodeIds.size).toBe(0);
    expect(result.current.cycleEdgeIds.size).toBe(0);
  });

  it("identifies cycle nodes in a 2-cycle", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }],
      [{ id: EA, from: A, to: B }, { id: EB, from: B, to: A }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    expect(result.current.cycleNodeIds.has(A)).toBe(true);
    expect(result.current.cycleNodeIds.has(B)).toBe(true);
    expect(result.current.cycleEdgeIds.has(EA)).toBe(true);
    expect(result.current.cycleEdgeIds.has(EB)).toBe(true);
  });

  it("identifies cycle nodes in a 3-cycle", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }, { id: C, label: "c" }],
      [{ id: EA, from: A, to: B }, { id: EB, from: B, to: C }, { id: "cc-id", from: C, to: A }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    expect(result.current.cycleNodeIds.has(A)).toBe(true);
    expect(result.current.cycleNodeIds.has(B)).toBe(true);
    expect(result.current.cycleNodeIds.has(C)).toBe(true);
    expect(result.current.cycleEdgeIds.size).toBe(3);
  });

  it("excludes isolated nodes from roots and leaves", () => {
    const iso = "99999999-9999-4999-8999-999999999999";
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }, { id: iso, label: "iso" }],
      [{ id: EA, from: A, to: B }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    // Isolated node (no edges) is neither root nor leaf in the strict sense
    expect(result.current.roots).not.toContain(iso);
    expect(result.current.leaves).not.toContain(iso);
  });

  it("returns graphInput with stripped edge shape", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }],
      [{ id: EA, from: A, to: B }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    const gi = result.current.graphInput;
    expect(gi.edges[0]).toEqual({ from: A, to: B });
    expect(gi.nodes[0]).toMatchObject({ id: A });
  });

  it("returns MICMAC quadrant for each node", () => {
    const map = makeMap(
      [{ id: A, label: "a" }, { id: B, label: "b" }, { id: C, label: "c" }],
      [{ id: EA, from: A, to: B }, { id: EB, from: A, to: C }]
    );
    const { result } = renderHook(() => useAnalysis(map));
    expect(result.current.micmac.get(A)?.quadrant).toBeDefined();
    expect(result.current.micmac.get(B)?.quadrant).toBeDefined();
  });
});
