import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DependencyMap from "../../src/renderer/pages/DependencyMap";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Mock layoutPositions so Tidy produces visibly different positions from the
// structural-sync calls that run on every node-add.
//
// Strategy: a latching flag (`tidyPhase`) starts false.  Structural-sync calls
// (triggered by topology changes on each node add) return {x:111, y:222}.
// After both nodes are rendered we flip the flag; the Tidy-button call then
// returns {x:333, y:444}.  This ensures:
//   - Pre-fix: Tidy only calls onRelayout (no setRfNodes), so rendered nodes
//     stay at 111 → assert for 333 FAILS  ✓
//   - Post-fix: Tidy also calls setRfNodes, so rendered nodes move to 333 →
//     assert PASSES  ✓
// ---------------------------------------------------------------------------
const layoutMockState = { tidyPhase: false };

vi.mock("../../src/renderer/pages/depmap/layout", () => ({
  layoutPositions: vi.fn(
    (nodes: ReadonlyArray<{ id: string }>) => {
      const result = new Map<string, { x: number; y: number }>();
      const pos = layoutMockState.tidyPhase ? { x: 333, y: 444 } : { x: 111, y: 222 };
      for (const node of nodes) {
        result.set(node.id, pos);
      }
      return result;
    }
  ),
}));

// Mock window.api.maps so we can test persistence without Electron IPC.
beforeEach(() => {
  layoutMockState.tidyPhase = false;
  (window as any).api = {
    maps: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("DependencyMap page", () => {
  it("renders the § IV heading", () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /dependency map/i })).toBeInTheDocument();
  });

  it("clicking Save calls window.api.maps.save with the current map", async () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const saveBtn = screen.getByTestId("map-save");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect((window as any).api.maps.save).toHaveBeenCalledTimes(1);
    });

    // Verify the argument is a DependencyMap-shaped object (has id, name, nodes, edges).
    const arg = (window as any).api.maps.save.mock.calls[0][0];
    expect(arg).toMatchObject({
      name: expect.any(String),
      nodes: expect.any(Array),
      edges: expect.any(Array),
    });
    expect(typeof arg.id).toBe("string");
  });

  it("Tidy button re-lays out rendered nodes (second dagre call coordinates appear in DOM)", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Add two nodes via the CapturePanel (Enter-key driven).
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "FactorA" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "FactorB" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Wait for the structural sync to fire (tidyPhase=false → positions 111,222).
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(2);
    });

    // Flip the flag so the next layoutPositions call (from Tidy) returns 333,444.
    layoutMockState.tidyPhase = true;

    // Click Tidy — this should call layoutPositions (tidyPhase=true → positions 333,444)
    // and update the rendered react-flow nodes via setRfNodes.
    const tidyBtn = screen.getByTitle(/re-run auto-layout/i);
    fireEvent.click(tidyBtn);

    // After the fix, rfNodes are updated with the second-call positions (x:333, y:444).
    // react-flow renders each node with style.transform = "translate(333px,444px)".
    await waitFor(() => {
      const nodes = container.querySelectorAll(".react-flow__node");
      expect(nodes.length).toBeGreaterThanOrEqual(2);
      const transforms = Array.from(nodes).map(
        (n) => (n as HTMLElement).style.transform
      );
      // At least one node should show the second-call x-coordinate (333).
      expect(transforms.some((t) => t.includes("333"))).toBe(true);
    });
  });
});
