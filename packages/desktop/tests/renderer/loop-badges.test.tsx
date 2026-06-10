/**
 * loop-badges.test.tsx — TDD tests for the loop badge overlay in LayeredView.
 *
 * Loop badges: for each classified loop, LayeredView renders a floating
 * pointer-events-none label at the loop centroid showing:
 *   "⟳ reinforcing" / "⟳ vicious" / "⟳ virtuous" / "⇋ balancing"
 *
 * Uses the same jsdom shims as edge-editing.test.tsx to make react-flow
 * actually render nodes in jsdom (ResizeObserver + DOMMatrixReadOnly +
 * offsetWidth/offsetHeight).
 */

import { it, expect, describe, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import { FITVIEW_DELAY_MS } from "../../src/renderer/pages/depmap/LayeredView";
import type { DependencyMap as DMap } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// jsdom layout shims (file-scoped — matches edge-editing.test.tsx)
// ---------------------------------------------------------------------------

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(el: Element) {
      this.cb([{ target: el } as ResizeObserverEntry], this as any);
    }
    unobserve() {}
    disconnect() {}
  } as any;

  (window as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22 = 1;
    constructor(_transform?: string) {}
  };

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() { return 100; },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() { return 40; },
  });
});

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
});
