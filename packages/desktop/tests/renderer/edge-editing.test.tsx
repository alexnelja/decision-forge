/**
 * edge-editing.test.tsx — integration tests for Task 6 edge editing through
 * the real DependencyMap + LayeredView (react-flow) stack.
 *
 * jsdom cannot measure layout, so react-flow never renders edge DOM elements
 * by default (edges require both endpoint nodes to have non-zero dimensions).
 * Two shims fix that, scoped to THIS file (vitest isolates jsdom per file):
 *   1. A ResizeObserver mock that invokes its callback on observe() — this is
 *      how react-flow v11's NodeRenderer learns node dimensions.
 *   2. offsetWidth/offsetHeight overridden on HTMLElement.prototype so
 *      updateNodeDimensions sees non-zero size (it reads offsetWidth/Height).
 *
 * With those in place, `.react-flow__edge` groups render and we can drive
 * onEdgeClick / onEdgeContextMenu with fireEvent — covering the edge.data
 * threading and the flip/sign guard behaviours end-to-end.
 */

import { it, expect, describe, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import { FITVIEW_DELAY_MS } from "../../src/renderer/pages/depmap/LayeredView";
import type { DependencyMap as DMap } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// jsdom layout shims (file-scoped; vitest gives each test file a fresh jsdom)
// ---------------------------------------------------------------------------

beforeAll(() => {
  // ResizeObserver that fires immediately on observe — react-flow's
  // NodeRenderer callback maps entries to { nodeElement: entry.target, ... }.
  global.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb([{ target: el } as ResizeObserverEntry], this as any);
    }
    unobserve() {}
    disconnect() {}
  } as any;

  // react-flow reads the viewport zoom via `new window.DOMMatrixReadOnly(
  // style.transform).m22` — jsdom has no DOMMatrixReadOnly, so stub one
  // that reports identity zoom.
  (window as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22 = 1;
    constructor(_transform?: string) {}
  };

  // Non-zero dimensions so updateNodeDimensions accepts the node.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 100;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 40;
    },
  });
});

// ---------------------------------------------------------------------------
// Fixture map + mocked persistence API
// ---------------------------------------------------------------------------

const NODE_A = "11111111-1111-4111-8111-111111111111";
const NODE_B = "22222222-2222-4222-8222-222222222222";
const NODE_C = "55555555-5555-4555-8555-555555555555";
const EDGE_AB = "33333333-3333-4333-8333-333333333333";
const EDGE_BA = "66666666-6666-4666-8666-666666666666";
const MAP_ID = "44444444-4444-4444-8444-444444444444";

function makeMap(edges: DMap["edges"]): DMap {
  return {
    id: MAP_ID,
    name: "Edge map",
    createdAt: "2026-06-10T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Alpha", position: { x: 0, y: 0 } },
      { id: NODE_B, label: "Beta", position: { x: 250, y: 120 } },
      { id: NODE_C, label: "Gamma", position: { x: 0, y: 240 } },
    ],
    edges,
  };
}

function mockMapsApi(map: DMap) {
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([{ id: MAP_ID, name: "Edge map" }]),
      load: vi.fn().mockResolvedValue(map),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/** Render the page, load the fixture map via Open, wait for nodes + edges. */
async function renderWithMap(map: DMap) {
  mockMapsApi(map);
  const utils = render(
    <MemoryRouter>
      <DependencyMap />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTitle(/open a saved map/i));
  fireEvent.click(await screen.findByText("Edge map"));
  await waitFor(() => {
    expect(utils.container.querySelectorAll(".react-flow__node").length).toBe(
      map.nodes.length
    );
    expect(utils.container.querySelectorAll(".react-flow__edge").length).toBe(
      map.edges.length
    );
  });
  // Let the deferred fitView fire BEFORE the test opens a menu/toolbar: the
  // programmatic viewport change triggers onMove, which intentionally closes
  // open context menus and the edge toolbar (pan-closes-overlays behaviour).
  // Without this settle, overlays opened by a test race the timer and are
  // sporadically closed underneath the assertions.
  await act(() => new Promise((resolve) => setTimeout(resolve, FITVIEW_DELAY_MS + 30)));
  return utils;
}

/** Click Save and return the map object passed to the save mock. */
async function lastSavedMap(): Promise<DMap> {
  const saveMock = (window as any).api.maps.save;
  const before = saveMock.mock.calls.length;
  fireEvent.click(screen.getByTestId("map-save"));
  await waitFor(() => {
    expect(saveMock.mock.calls.length).toBe(before + 1);
  });
  return saveMock.mock.calls[saveMock.mock.calls.length - 1][0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// onEdgeContextMenu wiring — edge menu reflects sign/confidence from edge.data
// ---------------------------------------------------------------------------

describe("Edge context menu — wiring + state reflection", () => {
  it("right-click on the edge opens the EDGE menu reflecting sign '-' and confidence 'assumption'", async () => {
    const { container } = await renderWithMap(
      makeMap([
        { id: EDGE_AB, from: NODE_A, to: NODE_B, sign: "-", confidence: "assumption" },
      ])
    );

    const edgeEl = container.querySelector(".react-flow__edge")!;
    fireEvent.contextMenu(edgeEl);

    // Edge menu appears with edge-specific items
    expect(await screen.findByText(/flip direction/i)).toBeInTheDocument();
    // Current sign "-" reflected (rendered as "− dampens")
    expect(screen.getByText(/dampens/i)).toBeInTheDocument();
    // Current confidence "assumption" reflected
    expect(screen.getByText(/assumption \(dashed\)/i)).toBeInTheDocument();
  });

  it("right-click on an unsigned/known edge shows 'none' sign and 'known (solid)'", async () => {
    const { container } = await renderWithMap(
      makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }])
    );

    fireEvent.contextMenu(container.querySelector(".react-flow__edge")!);

    expect(await screen.findByText(/flip direction/i)).toBeInTheDocument();
    expect(screen.getByText(/none/i)).toBeInTheDocument();
    expect(screen.getByText(/known \(solid\)/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// handleFlipEdge — positive flip + reversed-duplicate guard
// ---------------------------------------------------------------------------

describe("handleFlipEdge", () => {
  it("flips a single edge A→B to B→A via the context menu", async () => {
    const { container } = await renderWithMap(
      makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }])
    );

    fireEvent.contextMenu(container.querySelector(".react-flow__edge")!);
    fireEvent.click(await screen.findByText(/flip direction/i));

    const saved = await lastSavedMap();
    const edge = saved.edges.find((e) => e.id === EDGE_AB)!;
    expect(edge.from).toBe(NODE_B);
    expect(edge.to).toBe(NODE_A);
  });

  it("no-ops when the reversed edge already exists (A→B + B→A, flip A→B)", async () => {
    const { container } = await renderWithMap(
      makeMap([
        { id: EDGE_AB, from: NODE_A, to: NODE_B },
        { id: EDGE_BA, from: NODE_B, to: NODE_A },
      ])
    );

    // Right-click specifically the A→B edge (react-flow sets data-testid="rf__edge-<id>")
    const edgeAB = container.querySelector(`[data-testid="rf__edge-${EDGE_AB}"]`)!;
    expect(edgeAB).toBeTruthy();
    fireEvent.contextMenu(edgeAB);
    fireEvent.click(await screen.findByText(/flip direction/i));

    const saved = await lastSavedMap();
    // Both edges unchanged — flip refused because B→A already exists
    const ab = saved.edges.find((e) => e.id === EDGE_AB)!;
    const ba = saved.edges.find((e) => e.id === EDGE_BA)!;
    expect(ab.from).toBe(NODE_A);
    expect(ab.to).toBe(NODE_B);
    expect(ba.from).toBe(NODE_B);
    expect(ba.to).toBe(NODE_A);
    expect(saved.edges.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// handleCycleEdgeSign — undefined → "+" → "-" → undefined via the EdgeToolbar
// ---------------------------------------------------------------------------

describe("handleCycleEdgeSign — order undefined→'+'→'-'→undefined", () => {
  it("three clicks of the ± toolbar button cycle the persisted sign", async () => {
    const { container } = await renderWithMap(
      makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }])
    );

    // Click the edge → EdgeToolbar appears
    fireEvent.click(container.querySelector(".react-flow__edge")!);
    await screen.findByTestId("edge-toolbar");

    const signBtn = () => screen.getByRole("button", { name: "Cycle edge sign" });

    // 1st click: undefined → "+"
    fireEvent.click(signBtn());
    let saved = await lastSavedMap();
    expect(saved.edges[0]!.sign).toBe("+");

    // 2nd click: "+" → "-"
    fireEvent.click(signBtn());
    saved = await lastSavedMap();
    expect(saved.edges[0]!.sign).toBe("-");

    // 3rd click: "-" → none. The sign KEY must be REMOVED from the persisted
    // edge (not merely set to undefined) so saved JSON stays clean.
    fireEvent.click(signBtn());
    saved = await lastSavedMap();
    expect("sign" in saved.edges[0]!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EdgeToolbar lifecycle — closes on viewport movement; Escape scoping
// ---------------------------------------------------------------------------

describe("EdgeToolbar — closes on pan/zoom (viewport move)", () => {
  it("toolbar disappears when the viewport moves (Tidy → fitView → onMove)", async () => {
    const { container } = await renderWithMap(
      makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }])
    );

    // Open the toolbar
    fireEvent.click(container.querySelector(".react-flow__edge")!);
    await screen.findByTestId("edge-toolbar");

    // Tidy schedules a deferred fitView; the resulting programmatic viewport
    // change fires onMove — the toolbar must close (otherwise it floats
    // detached from the edge it annotates).
    fireEvent.click(screen.getByTitle(/re-run auto-layout/i));

    await waitFor(() => {
      expect(screen.queryByTestId("edge-toolbar")).not.toBeInTheDocument();
    });
  });
});

describe("EdgeToolbar — Escape scoping vs context menu", () => {
  it("first Escape closes only the context menu; second Escape closes the toolbar", async () => {
    const { container } = await renderWithMap(
      makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }])
    );

    const edgeEl = container.querySelector(".react-flow__edge")!;

    // Open toolbar (edge click), then the edge context menu on top of it
    fireEvent.click(edgeEl);
    await screen.findByTestId("edge-toolbar");
    fireEvent.contextMenu(edgeEl);
    await screen.findByText(/flip direction/i);

    // First Escape: menu closes, toolbar SURVIVES
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText(/flip direction/i)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("edge-toolbar")).toBeInTheDocument();

    // Second Escape: toolbar closes
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("edge-toolbar")).not.toBeInTheDocument();
    });
  });
});

// NOTE: handleRepointEdge guards (self-loop / duplicate refusal) are covered in
// edge-repoint.test.tsx by capturing the onRepointEdge prop — jsdom cannot
// drive react-flow's onEdgeUpdate endpoint-drag interaction. The full drag
// gesture itself remains e2e territory (depmap.spec.ts).
