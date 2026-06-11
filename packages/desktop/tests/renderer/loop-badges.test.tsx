/**
 * loop-badges.test.tsx — TDD tests for the loop badge overlay in LayeredView.
 *
 * Loop badges: for each classified loop, LayeredView renders a floating
 * pointer-events-none label at the loop centroid showing:
 *   "⟳ reinforcing" / "⟳ vicious" / "⟳ virtuous" / "⇋ balancing"
 *
 * Uses the shared react-flow jsdom shims (ResizeObserver + DOMMatrixReadOnly +
 * offsetWidth/offsetHeight) — see helpers/reactflow-jsdom.ts.
 */

import "./helpers/reactflow-jsdom";

import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import { FITVIEW_DELAY_MS } from "../../src/renderer/pages/depmap/LayeredView";
import type { DependencyMap as DMap } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NODE_A = "aa000000-0000-4000-8000-000000000001";
const NODE_B = "bb000000-0000-4000-8000-000000000002";
const NODE_C = "cc000000-0000-4000-8000-000000000003";
const NODE_OBJ = "dd000000-0000-4000-8000-000000000004";
const MAP_ID = "ee000000-0000-4000-8000-000000000005";

/** Map with a reinforcing cycle (no minus edges). */
function makeReinforcingMap(): DMap {
  return {
    id: MAP_ID,
    name: "Reinforcing map",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Price",   role: "factor",    position: { x: 0,   y: 0   } },
      { id: NODE_B, label: "Volume",  role: "factor",    position: { x: 200, y: 0   } },
      { id: NODE_C, label: "Revenue", role: "factor",    position: { x: 100, y: 150 } },
    ],
    edges: [
      { id: "e1", from: NODE_A, to: NODE_B },
      { id: "e2", from: NODE_B, to: NODE_A }, // reinforcing 2-cycle
      { id: "e3", from: NODE_B, to: NODE_C },
    ],
  };
}

/** Map with a balancing cycle (one minus edge). */
function makeBalancingMap(): DMap {
  return {
    id: MAP_ID,
    name: "Balancing map",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Supply", role: "factor", position: { x: 0,   y: 0 } },
      { id: NODE_B, label: "Demand", role: "factor", position: { x: 200, y: 0 } },
    ],
    edges: [
      { id: "e1", from: NODE_A, to: NODE_B, sign: "-" as const },
      { id: "e2", from: NODE_B, to: NODE_A },
    ],
  };
}

/** Map with no cycles — badges must NOT appear. */
function makeAcyclicMap(): DMap {
  return {
    id: MAP_ID,
    name: "Acyclic map",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Input",  role: "factor", position: { x: 0,   y: 0   } },
      { id: NODE_B, label: "Output", role: "factor", position: { x: 200, y: 200 } },
    ],
    edges: [
      { id: "e1", from: NODE_A, to: NODE_B },
    ],
  };
}

function mockMapsApi(map: DMap) {
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([{ id: MAP_ID, name: map.name }]),
      load: vi.fn().mockResolvedValue(map),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

async function renderWithMap(map: DMap) {
  mockMapsApi(map);
  const utils = render(
    <MemoryRouter>
      <DependencyMap />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTitle(/open a saved map/i));
  fireEvent.click(await screen.findByText(map.name));
  await waitFor(() => {
    expect(utils.container.querySelectorAll(".react-flow__node").length).toBe(map.nodes.length);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, FITVIEW_DELAY_MS + 30)));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loop badge rendering
// ---------------------------------------------------------------------------

describe("Loop badges — overlay on canvas", () => {
  it("renders a '⟳ reinforcing' badge when a reinforcing loop is present", async () => {
    const { container } = await renderWithMap(makeReinforcingMap());

    // Badge element must be in the canvas (data-testid="loop-badge-0")
    await waitFor(() => {
      const badge = container.querySelector("[data-testid='loop-badge-0']");
      expect(badge).toBeInTheDocument();
      expect(badge!.textContent).toMatch(/⟳/);
      expect(badge!.textContent).toMatch(/reinforcing/i);
    });
  });

  it("renders a '⇋ balancing' badge when a balancing loop is present", async () => {
    const { container } = await renderWithMap(makeBalancingMap());

    await waitFor(() => {
      const badge = container.querySelector("[data-testid='loop-badge-0']");
      expect(badge).toBeInTheDocument();
      expect(badge!.textContent).toMatch(/⇋/);
      expect(badge!.textContent).toMatch(/balancing/i);
    });
  });

  it("does NOT render any badge when the map is acyclic", async () => {
    await renderWithMap(makeAcyclicMap());

    // After settling, no badge glyphs should appear
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByText(/⟳/)).not.toBeInTheDocument();
    expect(screen.queryByText(/⇋/)).not.toBeInTheDocument();
  });

  it("badge position derives from the CURRENT viewport transform (tracks pan/zoom)", async () => {
    // The reinforcing-map loop nodes sit at (0,0) and (200,0); with the mocked
    // 100x40 dimensions their centres are (50,20) and (250,20) → flow-space
    // centroid (150, 20). The badge overlay position must equal
    // centroid*zoom + viewport offset, read from the LIVE transform on the
    // .react-flow__viewport element. Pan the canvas via wheel (panOnScroll is
    // enabled), then assert the badge tracked the new transform — pre-fix the
    // badge was computed via flowToScreenPosition at render time and nothing
    // re-rendered on transform change, so it sat at the stale position.
    // NOTE: if jsdom's d3-zoom wheel path doesn't move the transform, this
    // degrades to a derivation-consistency check at identity transform; the
    // interactive pan/zoom behaviour is also covered by the Task 9 e2e sweep.
    const { container } = await renderWithMap(makeReinforcingMap());

    // Pan the viewport via wheel scroll on the pane (panOnScroll=true).
    const pane = container.querySelector(".react-flow__pane")!;
    fireEvent.wheel(pane, { deltaX: 40, deltaY: 80 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));

    await waitFor(() => {
      const viewportEl = container.querySelector(".react-flow__viewport") as HTMLElement;
      expect(viewportEl).toBeInTheDocument();
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/.exec(
        viewportEl.style.transform
      );
      expect(m).not.toBeNull();
      const vx = parseFloat(m![1]!);
      const vy = parseFloat(m![2]!);
      const zoom = parseFloat(m![3]!);

      const CENTROID = { x: 150, y: 20 };
      const expected = { x: CENTROID.x * zoom + vx, y: CENTROID.y * zoom + vy };

      const badge = container.querySelector("[data-testid='loop-badge-0']") as HTMLElement;
      expect(badge).toBeInTheDocument();
      expect(parseFloat(badge.style.left)).toBeCloseTo(expected.x, 1);
      expect(parseFloat(badge.style.top)).toBeCloseTo(expected.y, 1);
    });
  });
});
