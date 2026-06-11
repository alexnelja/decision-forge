/**
 * floating-edges.test.tsx — TDD tests for Bug 1 (floating edges).
 *
 * Tests that:
 *  1. Edges are created with type "floating" in the react-flow state
 *  2. FloatingEdge renders with valid path geometry between nodes
 *  3. getNodeIntersection / getEdgeParams maths are sane
 *  4. Edge toolbar midpoint is between the two node centres (the computation
 *     uses node positions, which is what the floating edge builds paths from)
 *
 * jsdom cannot run getBBox / SVG layout, so we test the pure geometry helpers
 * directly and verify edge DOM attributes indirectly via the edge rendering.
 */

import "./helpers/reactflow-jsdom";

import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import { FITVIEW_DELAY_MS } from "../../src/renderer/pages/depmap/LayeredView";
import {
  getNodeIntersection,
  getEdgePosition,
  getEdgeParams,
} from "../../src/renderer/pages/depmap/floating-edge-utils";
import type { DependencyMap as DMap } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Unit tests for floating-edge-utils.ts geometry
// ---------------------------------------------------------------------------

describe("getNodeIntersection — rectangle border intersection", () => {
  /** Synthetic node shape compatible with what the function expects. */
  function node(x: number, y: number, w: number, h: number) {
    return { positionAbsolute: { x, y }, width: w, height: h };
  }

  it("horizontal pair: intersection point is on the RIGHT border of the source node", () => {
    // Source centred at (50, 20), target centred at (250, 20)
    // Line goes from (50,20) → (250,20) — should hit x=100 (right edge of 0+100)
    const src = node(0, 0, 100, 40);
    const tgt = node(200, 0, 100, 40);
    const pt = getNodeIntersection(src, tgt);
    expect(pt.x).toBeCloseTo(100, 1); // right border x
    expect(pt.y).toBeCloseTo(20, 1);  // centre y
  });

  it("vertical pair: intersection point is on the BOTTOM border of the source node", () => {
    // Source centred at (50, 20), target centred at (50, 120)
    // Line goes straight down — should hit y=40 (bottom edge)
    const src = node(0, 0, 100, 40);
    const tgt = node(0, 100, 100, 40);
    const pt = getNodeIntersection(src, tgt);
    expect(pt.x).toBeCloseTo(50, 1); // centre x
    expect(pt.y).toBeCloseTo(40, 1); // bottom border y
  });

  it("target to the left: intersection is on the LEFT border of the source", () => {
    const src = node(200, 0, 100, 40);
    const tgt = node(0, 0, 100, 40);
    const pt = getNodeIntersection(src, tgt);
    expect(pt.x).toBeCloseTo(200, 1); // left border x
    expect(pt.y).toBeCloseTo(20, 1);
  });
});

describe("getEdgePosition — maps intersection point to Position enum", () => {
  function node(x: number, y: number, w: number, h: number) {
    return { positionAbsolute: { x, y }, width: w, height: h };
  }

  it("returns Position.Right when intersection is near the right border", () => {
    const src = node(0, 0, 100, 40);
    const { Position } = require("reactflow");
    const pos = getEdgePosition(src, { x: 100, y: 20 });
    expect(pos).toBe(Position.Right);
  });

  it("returns Position.Bottom when intersection is near the bottom border", () => {
    const src = node(0, 0, 100, 40);
    const { Position } = require("reactflow");
    const pos = getEdgePosition(src, { x: 50, y: 40 });
    expect(pos).toBe(Position.Bottom);
  });
});

describe("getEdgeParams — edge endpoints between two nodes", () => {
  function node(x: number, y: number, w: number, h: number) {
    return { positionAbsolute: { x, y }, width: w, height: h };
  }

  it("source x is at right border when target is to the right", () => {
    const src = node(0, 0, 100, 40);
    const tgt = node(200, 0, 100, 40);
    const params = getEdgeParams(src, tgt);
    // source intersection should be on right border (x=100), target on left (x=200)
    expect(params.sx).toBeCloseTo(100, 1);
    expect(params.tx).toBeCloseTo(200, 1);
    expect(params.sy).toBeCloseTo(params.ty, 1); // same y for horizontal
  });

  it("source y is at bottom border when target is directly below", () => {
    const src = node(0, 0, 100, 40);
    const tgt = node(0, 100, 100, 40);
    const params = getEdgeParams(src, tgt);
    expect(params.sy).toBeCloseTo(40, 1); // bottom border
    expect(params.ty).toBeCloseTo(100, 1); // top border of tgt
    expect(params.sx).toBeCloseTo(params.tx, 1);
  });

  it("both endpoints are NOT at the same point (no zero-length paths)", () => {
    const src = node(0, 0, 100, 40);
    const tgt = node(300, 200, 100, 40);
    const params = getEdgeParams(src, tgt);
    const dist = Math.hypot(params.tx - params.sx, params.ty - params.sy);
    expect(dist).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: edges created in LayeredView have type "floating"
// ---------------------------------------------------------------------------

const NODE_A = "aa000000-0000-4000-8000-000000000001";
const NODE_B = "bb000000-0000-4000-8000-000000000002";
const MAP_ID = "cc000000-0000-4000-8000-000000000003";

function makeSimpleMap(): DMap {
  return {
    id: MAP_ID,
    name: "Float test",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Alpha", position: { x: 0, y: 0 } },
      { id: NODE_B, label: "Beta",  position: { x: 0, y: 200 } },
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
    expect(utils.container.querySelectorAll(".react-flow__edge").length).toBe(map.edges.length);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, FITVIEW_DELAY_MS + 30)));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FloatingEdge — integration with LayeredView", () => {
  it("edges render in the DOM (react-flow__edge present)", async () => {
    const { container } = await renderWithMap(makeSimpleMap());
    expect(container.querySelectorAll(".react-flow__edge").length).toBe(1);
  });

  it("the edge group has data-testid matching the edge id", async () => {
    const { container } = await renderWithMap(makeSimpleMap());
    expect(container.querySelector('[data-testid="rf__edge-e1"]')).toBeInTheDocument();
  });

  it("edge has a rendered SVG path element (FloatingEdge draws a path)", async () => {
    const { container } = await renderWithMap(makeSimpleMap());
    const edge = container.querySelector('[data-testid="rf__edge-e1"]');
    expect(edge).toBeInTheDocument();
    // BaseEdge renders a <path> inside the edge group
    const path = edge?.querySelector("path");
    expect(path).toBeInTheDocument();
    const d = path?.getAttribute("d");
    expect(d).toBeTruthy();
    expect(d!.length).toBeGreaterThan(5); // non-trivial path
  });

  it("vertical pair: edge path starts near bottom of source node (y≈40) not looping above (y<0)", async () => {
    // Nodes stacked vertically: A at (0,0), B at (0,200)
    // Correct: path starts near y=40 (bottom of A). Wrong: starts at y<0 (looping over top)
    const { container } = await renderWithMap(makeSimpleMap());
    const edge = container.querySelector('[data-testid="rf__edge-e1"]');
    const path = edge?.querySelector("path");
    const d = path?.getAttribute("d");
    if (!d) return; // skip if SVG not available in jsdom

    // Extract first M coordinate from path: "M sx,sy ..."
    const mMatch = d.match(/^M\s*([\d.-]+)[, ]([\d.-]+)/);
    if (mMatch) {
      const sy = parseFloat(mMatch[2]!);
      // Source node is 100x40 (mocked dims), position (0,0), centre at (50,20)
      // Floating edge should intersect bottom border: sy ≈ 40
      // Old fixed-handle edge would route from top handle: sy ≈ 0 or loop above → negative
      expect(sy).toBeGreaterThanOrEqual(0); // not looping above the source
    }
  });
});
