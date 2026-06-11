/**
 * edge-repoint.test.tsx — guard tests for DependencyMap's handleRepointEdge.
 *
 * handleRepointEdge is invoked from react-flow's onEdgeUpdate (endpoint drag),
 * which jsdom cannot drive. Instead we mock LayeredView to CAPTURE the props
 * DependencyMap passes down, then call `onRepointEdge` directly — this tests
 * the real handler (with its self-loop and duplicate guards) inside the real
 * component, asserting the persisted result via the Save flow.
 *
 * The endpoint-drag gesture itself remains e2e territory (depmap.spec.ts).
 */

import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import type { LayeredViewProps } from "../../src/renderer/pages/depmap/LayeredView";
import type { DependencyMap as DMap } from "@decision-forge/core";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Mock LayeredView: render nothing, capture the latest props.
// ---------------------------------------------------------------------------

let capturedProps: LayeredViewProps | null = null;

vi.mock("../../src/renderer/pages/depmap/LayeredView", () => ({
  LayeredView: (props: LayeredViewProps) => {
    capturedProps = props;
    return <div data-testid="mock-layered-view" />;
  },
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const NODE_A = "11111111-1111-4111-8111-111111111111";
const NODE_B = "22222222-2222-4222-8222-222222222222";
const NODE_C = "55555555-5555-4555-8555-555555555555";
const EDGE_AB = "33333333-3333-4333-8333-333333333333";
const EDGE_AC = "77777777-7777-4777-8777-777777777777";
const MAP_ID = "44444444-4444-4444-8444-444444444444";

function makeMap(edges: DMap["edges"]): DMap {
  return {
    id: MAP_ID,
    name: "Repoint map",
    createdAt: "2026-06-10T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
    nodes: [
      { id: NODE_A, label: "Alpha" },
      { id: NODE_B, label: "Beta" },
      { id: NODE_C, label: "Gamma" },
    ],
    edges,
  };
}

async function renderWithMap(map: DMap) {
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([{ id: MAP_ID, name: "Repoint map" }]),
      load: vi.fn().mockResolvedValue(map),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
  render(
    <MemoryRouter>
      <DependencyMap />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTitle(/open a saved map/i));
  fireEvent.click(await screen.findByText("Repoint map"));
  // The mocked LayeredView re-renders with the loaded map
  await waitFor(() => {
    expect(capturedProps?.map.edges.length).toBe(map.edges.length);
  });
}

/** Click Save and return the persisted map. */
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
  capturedProps = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// handleRepointEdge
// ---------------------------------------------------------------------------

describe("handleRepointEdge — guards + positive case", () => {
  it("re-points A→B to A→C when no conflict exists (positive case)", async () => {
    await renderWithMap(makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }]));

    act(() => {
      capturedProps!.onRepointEdge(EDGE_AB, { source: NODE_A, target: NODE_C });
    });

    const saved = await lastSavedMap();
    const edge = saved.edges.find((e) => e.id === EDGE_AB)!;
    expect(edge.from).toBe(NODE_A);
    expect(edge.to).toBe(NODE_C);
  });

  it("refuses a self-loop (source === target) — edge unchanged", async () => {
    await renderWithMap(makeMap([{ id: EDGE_AB, from: NODE_A, to: NODE_B }]));

    act(() => {
      capturedProps!.onRepointEdge(EDGE_AB, { source: NODE_A, target: NODE_A });
    });

    const saved = await lastSavedMap();
    const edge = saved.edges.find((e) => e.id === EDGE_AB)!;
    expect(edge.from).toBe(NODE_A);
    expect(edge.to).toBe(NODE_B);
  });

  it("refuses re-pointing onto an existing edge (duplicate) — both edges unchanged", async () => {
    await renderWithMap(
      makeMap([
        { id: EDGE_AB, from: NODE_A, to: NODE_B },
        { id: EDGE_AC, from: NODE_A, to: NODE_C },
      ])
    );

    // Try to re-point A→C onto A→B, which already exists
    act(() => {
      capturedProps!.onRepointEdge(EDGE_AC, { source: NODE_A, target: NODE_B });
    });

    const saved = await lastSavedMap();
    const ab = saved.edges.find((e) => e.id === EDGE_AB)!;
    const ac = saved.edges.find((e) => e.id === EDGE_AC)!;
    expect(ab.from).toBe(NODE_A);
    expect(ab.to).toBe(NODE_B);
    expect(ac.from).toBe(NODE_A);
    expect(ac.to).toBe(NODE_C);
    expect(saved.edges.length).toBe(2);
  });
});
