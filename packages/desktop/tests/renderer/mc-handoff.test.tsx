/**
 * mc-handoff.test.tsx — Task 3 TDD: "→ Simulate" push action
 *
 * Behaviours under test:
 *   B1  NodeInspector shows "→ Simulate in § I" for uncertainty nodes; clicking it:
 *         - seeds node.mc = {varName, distribution:{kind:"triangular",0,0,0}}
 *         - saves the map (maps.save called with mc block in payload)
 *         - registers binding in mc-link-store
 *         - navigates to "/mc"
 *   B2  Second click on an already-linked node does NOT re-seed but still navigates.
 *   B3  ReadoutPanel Resolve-next rows render "→ Simulate" affordance
 *       (aria-label "Simulate <label> in Monte Carlo") firing the same path.
 *   B4  ContextMenu: uncertainty node → has "→ Simulate"; factor node → does NOT.
 *   B5  Role change away from uncertainty REMOVES the mc key
 *       (assert via save: "mc" in savedNode === false).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { clearMcLinks, getMcLinks } from "../../src/renderer/lib/mc-link-store";
import { NodeInspector } from "../../src/renderer/pages/depmap/NodeInspector";
import { ReadoutPanel } from "../../src/renderer/pages/depmap/ReadoutPanel";
import { ContextMenu } from "../../src/renderer/pages/depmap/ContextMenu";
import type { DependencyNode, DependencyMap as DMap } from "@decision-forge/core";
import { decisionReadout } from "@decision-forge/core";
import DependencyMap from "../../src/renderer/pages/DependencyMap";

// ---------------------------------------------------------------------------
// Mock useNavigate — must be before imports that use react-router-dom
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Mock layout so react-flow nodes render quickly in jsdom
// ---------------------------------------------------------------------------
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
// Helpers
// ---------------------------------------------------------------------------

const UNCERTAINTY_ID = "unc-node-id-1234";
const FACTOR_ID = "fac-node-id-5678";

const uncertaintyNode: DependencyNode = {
  id: UNCERTAINTY_ID,
  label: "Market demand",
  role: "uncertainty",
};

const factorNode: DependencyNode = {
  id: FACTOR_ID,
  label: "Production cost",
};

// Fixture uncertainty node with mc already seeded
const linkedUncertaintyNode: DependencyNode = {
  id: UNCERTAINTY_ID,
  label: "Market demand",
  role: "uncertainty",
  mc: {
    varName: "market_demand",
    distribution: { kind: "triangular", min: 0, mode: 0, max: 0 },
  },
};

// Minimal map with one uncertainty node and one lever (to produce a readout with resolveNext)
const MAP_ID = "test-map-id-abc";
function makeMapWithUncertainty(): DMap {
  return {
    id: MAP_ID,
    name: "Test map",
    createdAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
    nodes: [
      { id: "obj-id", label: "Outcome", role: "objective" },
      { id: UNCERTAINTY_ID, label: "Market demand", role: "uncertainty" },
      { id: "lev-id", label: "My lever", role: "lever" },
    ],
    edges: [
      { id: "e1", from: UNCERTAINTY_ID, to: "obj-id" },
      { id: "e2", from: "lev-id", to: "obj-id" },
    ],
  };
}

// ---------------------------------------------------------------------------
// B1 – NodeInspector: uncertainty node shows "→ Simulate in § I",
//      clicking seeds mc, saves, registers binding, navigates
// ---------------------------------------------------------------------------
describe("B1 – NodeInspector: → Simulate push for uncertainty node", () => {
  it("shows '→ Simulate in § I' button for an uncertainty node", () => {
    const onPushToMC = vi.fn();
    render(
      <NodeInspector
        node={uncertaintyNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={onPushToMC}
      />
    );
    expect(
      screen.getByRole("button", { name: /simulate in § i/i })
    ).toBeInTheDocument();
  });

  it("does NOT show '→ Simulate' button for a factor node", () => {
    render(
      <NodeInspector
        node={factorNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /simulate in § i/i })
    ).not.toBeInTheDocument();
  });

  it("clicking → Simulate calls onPushToMC with the node id", () => {
    const onPushToMC = vi.fn();
    render(
      <NodeInspector
        node={uncertaintyNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={onPushToMC}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /simulate in § i/i }));
    expect(onPushToMC).toHaveBeenCalledWith(UNCERTAINTY_ID);
  });
});

// ---------------------------------------------------------------------------
// B1/B2 – Full DependencyMap integration: seed + save + mc-link-store + navigate
// ---------------------------------------------------------------------------
describe("B1/B2 – DependencyMap integration: handlePushToMC", () => {
  async function setupUncertaintyNode() {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    // Add a node via CapturePanel
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Market demand" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });
    // Select the node via CapturePanel button
    fireEvent.click(screen.getByRole("button", { name: "Market demand" }));
    // Set role to Uncertainty via the inspector radio
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);
    return container;
  }

  it("seeds node.mc block on first → Simulate click", async () => {
    await setupUncertaintyNode();
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      const calls = (window as any).api.maps.save.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const lastMap = calls[calls.length - 1][0] as DMap;
      const node = lastMap.nodes.find((n: DependencyNode) => n.label === "Market demand");
      expect(node).toBeDefined();
      expect(node!.mc).toBeDefined();
      const dist = node!.mc!.distribution;
      expect(dist.kind).toBe("triangular");
      if (dist.kind === "triangular") {
        expect(dist.min).toBe(0);
        expect(dist.mode).toBe(0);
        expect(dist.max).toBe(0);
      }
    });
  });

  it("varName in mc block is slugified from the node label", async () => {
    await setupUncertaintyNode();
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      const calls = (window as any).api.maps.save.mock.calls;
      const lastMap = calls[calls.length - 1][0] as DMap;
      const node = lastMap.nodes.find((n: DependencyNode) => n.label === "Market demand");
      expect(node!.mc!.varName).toBe("market_demand");
    });
  });

  it("maps.save is called with the mc block", async () => {
    await setupUncertaintyNode();
    const callsBefore = (window as any).api.maps.save.mock.calls.length;
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect((window as any).api.maps.save.mock.calls.length).toBeGreaterThan(callsBefore);
      const lastMap = (window as any).api.maps.save.mock.calls[(window as any).api.maps.save.mock.calls.length - 1][0] as DMap;
      const node = lastMap.nodes.find((n: DependencyNode) => n.label === "Market demand");
      expect(node!.mc).toBeDefined();
    });
  });

  it("mc-link-store contains {mapId, nodeId, varName} after push", async () => {
    await setupUncertaintyNode();
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      const links = getMcLinks();
      expect(links.length).toBeGreaterThanOrEqual(1);
      const link = links.find((l) => l.varName === "market_demand");
      expect(link).toBeDefined();
      expect(link!.nodeId).toBeTruthy();
      expect(link!.mapId).toBeTruthy();
    });
  });

  it("navigates to /mc after push", async () => {
    await setupUncertaintyNode();
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/mc");
    });
  });
});

// ---------------------------------------------------------------------------
// B2 – Second click does NOT re-seed (keeps existing definition), still navigates
// ---------------------------------------------------------------------------
describe("B2 – Second click does not re-seed but still navigates", () => {
  it("second → Simulate click preserves existing mc definition", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Price risk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Price risk" }));
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);

    // First click — seeds mc
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/mc");
    });

    const firstSaveCallCount = (window as any).api.maps.save.mock.calls.length;
    mockNavigate.mockReset();

    // Second click — should navigate again, NOT change varName
    fireEvent.click(simulateBtn);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/mc");
    });

    // The varName must remain the same (not get _2 suffix)
    const latestMap = (window as any).api.maps.save.mock.calls[(window as any).api.maps.save.mock.calls.length - 1][0] as DMap;
    const node = latestMap.nodes.find((n: DependencyNode) => n.label === "Price risk");
    expect(node!.mc!.varName).toBe("price_risk");
    // save count should be firstSaveCallCount + 1 (re-registers but doesn't re-seed)
    expect((window as any).api.maps.save.mock.calls.length).toBeGreaterThanOrEqual(firstSaveCallCount + 1);
  });
});

// ---------------------------------------------------------------------------
// B3 – ReadoutPanel: Resolve-next rows have "→ Simulate" affordance
// ---------------------------------------------------------------------------
describe("B3 – ReadoutPanel: Resolve-next rows show → Simulate affordance", () => {
  it("renders a '→ Simulate' button for an uncertainty entry in Resolve Next", () => {
    const map = makeMapWithUncertainty();
    const readout = decisionReadout(map);
    const onPushToMC = vi.fn();

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
        onPushToMC={onPushToMC}
      />
    );

    // Must have at least one Simulate button for the uncertainty entry
    const simulateBtn = screen.getByRole("button", {
      name: /simulate market demand in monte carlo/i,
    });
    expect(simulateBtn).toBeInTheDocument();
  });

  it("clicking the → Simulate affordance calls onPushToMC with the nodeId", () => {
    const map = makeMapWithUncertainty();
    const readout = decisionReadout(map);
    const onPushToMC = vi.fn();

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
        onPushToMC={onPushToMC}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /simulate market demand in monte carlo/i,
      })
    );
    expect(onPushToMC).toHaveBeenCalledWith(UNCERTAINTY_ID);
  });

  it("does not show a Simulate affordance for lever entries in Act First", () => {
    const map = makeMapWithUncertainty();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );

    // "Simulate My lever in Monte Carlo" must NOT exist
    expect(
      screen.queryByRole("button", { name: /simulate my lever in monte carlo/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// B4 – ContextMenu: uncertainty node has "→ Simulate"; factor/lever/objective don't
// ---------------------------------------------------------------------------
describe("B4 – ContextMenu: → Simulate item visibility by role", () => {
  it("uncertainty node context menu shows → Simulate", () => {
    render(
      <ContextMenu
        type="node"
        x={100}
        y={100}
        nodeId={UNCERTAINTY_ID}
        role="uncertainty"
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onSetRole={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(screen.getByRole("menuitem", { name: /→ simulate/i })).toBeInTheDocument();
  });

  it("factor node context menu does NOT show → Simulate", () => {
    render(
      <ContextMenu
        type="node"
        x={100}
        y={100}
        nodeId={FACTOR_ID}
        role="factor"
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onSetRole={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(screen.queryByRole("menuitem", { name: /→ simulate/i })).not.toBeInTheDocument();
  });

  it("lever node context menu does NOT show → Simulate", () => {
    render(
      <ContextMenu
        type="node"
        x={100}
        y={100}
        nodeId="lev-id"
        role="lever"
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onSetRole={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(screen.queryByRole("menuitem", { name: /→ simulate/i })).not.toBeInTheDocument();
  });

  it("objective node context menu does NOT show → Simulate", () => {
    render(
      <ContextMenu
        type="node"
        x={100}
        y={100}
        nodeId="obj-id"
        role="objective"
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onSetRole={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(screen.queryByRole("menuitem", { name: /→ simulate/i })).not.toBeInTheDocument();
  });

  it("clicking → Simulate in context menu calls onPushToMC with nodeId", () => {
    const onPushToMC = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        type="node"
        x={100}
        y={100}
        nodeId={UNCERTAINTY_ID}
        role="uncertainty"
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onSetRole={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
        onPushToMC={onPushToMC}
      />
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /→ simulate/i }));
    expect(onPushToMC).toHaveBeenCalledWith(UNCERTAINTY_ID);
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B5 – Role change away from uncertainty removes mc key
// ---------------------------------------------------------------------------
describe("B5 – Role change away from uncertainty removes mc key", () => {
  async function lastSavedMap(): Promise<DMap> {
    const saveMock = (window as any).api.maps.save;
    return saveMock.mock.calls[saveMock.mock.calls.length - 1][0] as DMap;
  }

  it("changing from uncertainty to factor removes mc key from saved node", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Demand" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });

    // Select the node
    fireEvent.click(screen.getByRole("button", { name: "Demand" }));

    // Set role to Uncertainty
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);

    // Push to MC to seed the mc block
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/mc");
    });

    // Verify mc is in the saved map
    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Demand");
      expect(node!.mc).toBeDefined();
    });

    // Now change role to Factor
    const factorRadio = screen.getByRole("radio", { name: /factor/i });
    fireEvent.click(factorRadio);

    // Save the map explicitly
    fireEvent.click(screen.getByTestId("map-save"));

    // mc key must be absent
    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Demand");
      expect(node).toBeDefined();
      expect("mc" in node!).toBe(false);
    });
  });

  it("changing from uncertainty to lever also removes mc key", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Supply" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Supply" }));
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);

    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/mc"));

    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Supply");
      expect(node!.mc).toBeDefined();
    });

    // Change to lever
    const leverRadio = screen.getByRole("radio", { name: /lever/i });
    fireEvent.click(leverRadio);
    fireEvent.click(screen.getByTestId("map-save"));

    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Supply");
      expect("mc" in node!).toBe(false);
    });
  });
});
