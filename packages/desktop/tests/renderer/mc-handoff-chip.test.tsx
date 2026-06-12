/**
 * mc-handoff-chip.test.tsx — Task 5 T5-B1: the FactorNode MC range chip in the
 * ACTUAL canvas DOM (full DependencyMap render via the reactflow-jsdom shim).
 *
 * Separate file from mc-handoff.test.tsx on purpose: the shim makes react-flow
 * nodes render with role="button", which would collide with that file's
 * CapturePanel getByRole("button", {name}) queries. The shim's per-file jsdom
 * isolation (beforeAll in the importing file) keeps the collision contained.
 *
 * Behaviours under test:
 *   - linked uncertainty node with mc.summary → chip "14 · 26 · 44" inside
 *     its .react-flow__node (p10 · p50 · p90, 3 significant digits)
 *   - linked but UNCONFIGURED (all-zero triangular, no summary) → chip "→ § I"
 *   - unlinked node → NO chip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
// Canvas-rendering shim: ResizeObserver + DOMMatrixReadOnly + offsetWidth/Height
// so react-flow v11 actually renders nodes in jsdom.
import "./helpers/reactflow-jsdom";
import { clearMcLinks } from "../../src/renderer/lib/mc-link-store";
import type { DependencyMap as DMap } from "@decision-forge/core";
import DependencyMap from "../../src/renderer/pages/DependencyMap";

// Mock useNavigate (DependencyMap calls it at mount)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock layout so dagre isn't needed for positioning in jsdom
vi.mock("../../src/renderer/pages/depmap/layout", () => ({
  layoutPositions: vi.fn((nodes: ReadonlyArray<{ id: string }>) => {
    const result = new Map<string, { x: number; y: number }>();
    for (const node of nodes) result.set(node.id, { x: 100, y: 100 });
    return result;
  }),
}));

afterEach(() => {
  cleanup();
  clearMcLinks();
  mockNavigate.mockReset();
});

beforeEach(() => {
  clearMcLinks();
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// ---------------------------------------------------------------------------
// Fixture: one linked-with-summary, one linked-unconfigured, one plain node
// ---------------------------------------------------------------------------

const CHIP_MAP_ID = "chip-map-id";

function makeChipMap(): DMap {
  return {
    id: CHIP_MAP_ID,
    name: "Chip map",
    createdAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
    nodes: [
      {
        id: "chip-linked",
        label: "Linked risk",
        role: "uncertainty",
        position: { x: 0, y: 0 },
        mc: {
          varName: "linked_risk",
          distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
          summary: { p10: 14, p50: 26, p90: 44, mean: 27.5, definedAt: "2026-06-11T00:00:00Z" },
        },
      },
      {
        id: "chip-unconf",
        label: "Unconfigured risk",
        role: "uncertainty",
        position: { x: 200, y: 0 },
        mc: {
          varName: "unconfigured_risk",
          distribution: { kind: "triangular", min: 0, mode: 0, max: 0 },
        },
      },
      { id: "chip-plain", label: "Plain factor", position: { x: 400, y: 0 } },
    ],
    edges: [],
  };
}

/** Render DependencyMap and load the fixture map via the Open dialog. */
async function renderWithLoadedMap() {
  (window as any).api.maps.list = vi.fn().mockResolvedValue([{ id: CHIP_MAP_ID, name: "Chip map" }]);
  (window as any).api.maps.load = vi.fn().mockResolvedValue(makeChipMap());
  const utils = render(
    <MemoryRouter>
      <DependencyMap />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /open map/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Chip map" }));
  await waitFor(() => {
    expect(utils.container.querySelectorAll(".react-flow__node").length).toBe(3);
  });
  return utils;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T5-B1 – FactorNode canvas chip (reactflow-jsdom)", () => {
  it("linked node with summary shows the '14 · 26 · 44' chip inside its canvas node", async () => {
    await renderWithLoadedMap();
    await waitFor(() => {
      const chips = screen.getAllByTestId("mc-chip");
      const rangeChip = chips.find((c) => c.textContent === "14 · 26 · 44");
      expect(rangeChip).toBeTruthy();
      // The chip must live inside an actual react-flow canvas node…
      const host = rangeChip!.closest(".react-flow__node");
      expect(host).not.toBeNull();
      // …and that node must be the linked one.
      expect(host!.textContent).toContain("Linked risk");
    });
  });

  it("linked-but-unconfigured node shows '→ § I' chip instead of a range", async () => {
    await renderWithLoadedMap();
    await waitFor(() => {
      const chips = screen.getAllByTestId("mc-chip");
      const hintChip = chips.find((c) => c.textContent === "→ § I");
      expect(hintChip).toBeTruthy();
      const host = hintChip!.closest(".react-flow__node");
      expect(host).not.toBeNull();
      expect(host!.textContent).toContain("Unconfigured risk");
    });
  });

  it("unlinked node renders NO chip (and only the two linked nodes carry chips)", async () => {
    const { container } = await renderWithLoadedMap();
    await waitFor(() => {
      // Exactly the two linked nodes have chips
      expect(screen.getAllByTestId("mc-chip")).toHaveLength(2);
    });
    const plainNode = Array.from(container.querySelectorAll(".react-flow__node")).find((n) =>
      n.textContent?.includes("Plain factor")
    );
    expect(plainNode).toBeTruthy();
    expect(plainNode!.querySelector('[data-testid="mc-chip"]')).toBeNull();
  });
});
