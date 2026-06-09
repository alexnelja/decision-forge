// packages/core/tests/graph-readout.test.ts
import { describe, it, expect } from "vitest";
import { decisionReadout } from "../src/graph/readout.js";
import type { DependencyMap } from "../src/schemas/dependency-map.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Stable uuids for tests (v4-like format). */
const ids = Array.from({ length: 20 }, (_, i) =>
  `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`
);

function makeMap(overrides: Partial<DependencyMap> & Pick<DependencyMap, "nodes" | "edges">): DependencyMap {
  return {
    id: ids[19]!,
    name: "test",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

function node(idx: number, label: string, role?: DependencyMap["nodes"][number]["role"]) {
  return { id: ids[idx]!, label, ...(role ? { role } : {}) };
}

function edge(idx: number, from: number, to: number, sign?: "+" | "-") {
  return { id: ids[idx]!, from: ids[from]!, to: ids[to]!, ...(sign ? { sign } : {}) };
}

// ── Test 1: guidance when no roles ───────────────────────────────────────────

describe("decisionReadout – no roles", () => {
  it("provides guidance; actFirst/resolveNext empty; loops still in planAround", () => {
    // a → b → c, and c → b (makes a b-c loop)
    const map = makeMap({
      nodes: [node(0, "a"), node(1, "b"), node(2, "c")],
      edges: [edge(10, 0, 1), edge(11, 1, 2), edge(12, 2, 1)],
    });
    const r = decisionReadout(map);
    expect(r.guidance).toBeTruthy();
    expect(r.actFirst).toHaveLength(0);
    expect(r.resolveNext).toHaveLength(0);
    // b-c cycle should appear in planAround
    expect(r.planAround.some((p) => p.kind === "loop")).toBe(true);
  });
});

// ── Test 2: actFirst ranking ──────────────────────────────────────────────────

describe("decisionReadout – actFirst", () => {
  it("ranks levers by downstream reach; annotates objective hit", () => {
    // Topology:
    //   lever0 → f1 → f2 → f3 → obj
    //   lever1 → f4
    // lever0 has reach {f1, f2, f3, obj} = 4; lever1 has reach {f4} = 1
    const map = makeMap({
      nodes: [
        node(0, "lever0", "lever"),
        node(1, "f1"),
        node(2, "f2"),
        node(3, "f3"),
        node(4, "obj", "objective"),
        node(5, "lever1", "lever"),
        node(6, "f4"),
      ],
      edges: [
        edge(10, 0, 1), edge(11, 1, 2), edge(12, 2, 3), edge(13, 3, 4),
        edge(14, 5, 6),
      ],
    });
    const r = decisionReadout(map);
    expect(r.actFirst[0]!.nodeId).toBe(ids[0]!); // lever0 ranks first
    // reason mentions the count (4 downstream) and objective hit
    expect(r.actFirst[0]!.reason).toMatch(/4/);
    expect(r.actFirst[0]!.reason).toMatch(/objective/i);
    // lever1 ranks second, no objective annotation
    expect(r.actFirst[1]!.nodeId).toBe(ids[5]!);
    expect(r.actFirst[1]!.reason).not.toMatch(/objective/i);
    expect(r.guidance).toBeNull();
  });
});

// ── Test 3: resolveNext ───────────────────────────────────────────────────────

describe("decisionReadout – resolveNext", () => {
  it("ranks uncertainties by downstream reach with 'hang on this' reason", () => {
    // unc0 → f1 → f2; unc1 → f3
    const map = makeMap({
      nodes: [
        node(0, "unc0", "uncertainty"),
        node(1, "f1"),
        node(2, "f2"),
        node(3, "unc1", "uncertainty"),
        node(4, "f3"),
        node(5, "obj", "objective"),
      ],
      edges: [
        edge(10, 0, 1), edge(11, 1, 2), edge(12, 2, 5),
        edge(13, 3, 4),
      ],
    });
    const r = decisionReadout(map);
    // unc0 has reach 3 (f1, f2, obj); unc1 has reach 1 (f3)
    expect(r.resolveNext[0]!.nodeId).toBe(ids[0]!);
    expect(r.resolveNext[0]!.reason).toMatch(/hang/i);
    expect(r.resolveNext[0]!.reason).toMatch(/3/);
    expect(r.resolveNext[1]!.nodeId).toBe(ids[3]!);
  });
});

// ── Test 4: planAround loops ──────────────────────────────────────────────────

describe("decisionReadout – planAround loops", () => {
  it("lists signed cycles with class; vicious before plain reinforcing", () => {
    // Reinforcing loop (a→b→a, all +), with b→obj via - edge (vicious)
    // Plus a plain balancing loop (c→d→c with one - edge)
    const map = makeMap({
      nodes: [
        node(0, "a", "lever"),
        node(1, "b"),
        node(2, "obj", "objective"),
        node(3, "c"),
        node(4, "d"),
      ],
      edges: [
        edge(10, 0, 1, "+"), edge(11, 1, 0, "+"), // reinforcing loop a-b
        edge(12, 1, 2, "-"),                         // b→obj via - → vicious
        edge(13, 3, 4, "-"), edge(14, 4, 3, "+"),    // balancing loop c-d
      ],
    });
    const r = decisionReadout(map);
    const loops = r.planAround.filter((p) => p.kind === "loop");
    // vicious reinforcing loop should come first
    const first = loops[0]!;
    expect(first.kind).toBe("loop");
    if (first.kind === "loop") {
      expect(first.class).toBe("reinforcing");
      expect(first.valence).toBe("vicious");
    }
    // balancing loop (no path to obj) should also appear
    const hasBalancing = loops.some((l) => l.kind === "loop" && l.class === "balancing");
    expect(hasBalancing).toBe(true);
  });
});

// ── Test 5: planAround external ──────────────────────────────────────────────

describe("decisionReadout – planAround external", () => {
  it("flags factor roots with ≥2 downstream and no lever upstream", () => {
    // ext → f1 → f2 → obj; lever → f1 (so f1 is not an external root)
    // ext2 → f3 → f4 (no lever upstream, 2 downstream → external)
    const map = makeMap({
      nodes: [
        node(0, "ext"),          // factor root
        node(1, "f1"),
        node(2, "f2"),
        node(3, "obj", "objective"),
        node(4, "lever", "lever"),
        node(5, "ext2"),         // another factor root
        node(6, "f3"),
        node(7, "f4"),
      ],
      edges: [
        edge(10, 0, 1), edge(11, 1, 2), edge(12, 2, 3),
        edge(13, 4, 1),  // lever drives f1 → ext is NOT fully uncontrolled (but ext itself has no lever upstream)
        edge(14, 5, 6), edge(15, 6, 7),
      ],
    });
    const r = decisionReadout(map);
    const externals = r.planAround.filter((p) => p.kind === "external");
    // ext2 (ids[5]) has no lever upstream and downstream = {f3, f4} = 2
    expect(externals.some((e) => e.kind === "external" && e.nodeId === ids[5]!)).toBe(true);
  });
});

// ── Test 6: top-3 cap ─────────────────────────────────────────────────────────

describe("decisionReadout – top-3 cap", () => {
  it("actFirst/resolveNext capped at 3", () => {
    // 5 levers and 5 uncertainties, each driving obj (non-zero downstream
    // so none are filtered out before the cap applies).
    const nodes = [
      node(0, "obj", "objective"),
      ...Array.from({ length: 5 }, (_, i) => node(i + 1, `lever${i}`, "lever")),
      ...Array.from({ length: 5 }, (_, i) => node(i + 6, `unc${i}`, "uncertainty")),
    ];
    // edge id indices 10..19 stay within the 20-entry ids pool
    const edges = Array.from({ length: 10 }, (_, i) => edge(i + 10, i + 1, 0));
    const map = makeMap({ nodes, edges });
    const r = decisionReadout(map);
    expect(r.actFirst).toHaveLength(3);
    expect(r.resolveNext).toHaveLength(3);
  });

  it("planAround capped at 3 with 4 loops present", () => {
    // 4 disjoint two-node loops: (1,2) (3,4) (5,6) (7,8)
    const nodes = [
      node(0, "obj", "objective"),
      ...Array.from({ length: 8 }, (_, i) => node(i + 1, `n${i + 1}`)),
    ];
    const edges = [
      edge(9, 1, 2), edge(10, 2, 1),
      edge(11, 3, 4), edge(12, 4, 3),
      edge(13, 5, 6), edge(14, 6, 5),
      edge(15, 7, 8), edge(16, 8, 7),
    ];
    const map = makeMap({ nodes, edges });
    const r = decisionReadout(map);
    expect(r.planAround).toHaveLength(3);
    expect(r.planAround.every((p) => p.kind === "loop")).toBe(true);
  });
});

// ── Test 7: zero-downstream filter ───────────────────────────────────────────

describe("decisionReadout – zero-downstream filter", () => {
  it("levers/uncertainties with no downstream are excluded from rankings", () => {
    // lever0 drives obj; lever1 and unc0 have NO outgoing edges.
    const map = makeMap({
      nodes: [
        node(0, "obj", "objective"),
        node(1, "lever0", "lever"),
        node(2, "lever1", "lever"),
        node(3, "unc0", "uncertainty"),
      ],
      edges: [edge(10, 1, 0)],
    });
    const r = decisionReadout(map);
    expect(r.actFirst).toHaveLength(1);
    expect(r.actFirst[0]!.nodeId).toBe(ids[1]!);
    expect(r.resolveNext).toHaveLength(0); // unc0 drives nothing
  });
});
