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

    // After first push the node has mc → inspector now shows "Edit in § I" instead.
    // Second click via the new "Edit in § I" button — should navigate again, NOT change varName.
    const editInBtn = await screen.findByRole("button", { name: /edit in § i/i });
    fireEvent.click(editInBtn);
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

  it("simulate affordance carries the focus-ring class like its sibling row button", () => {
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

    const btn = screen.getByRole("button", {
      name: /simulate market demand in monte carlo/i,
    });
    expect(btn.className).toContain("focus-ring");
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

// ---------------------------------------------------------------------------
// B6 – Re-entrancy guard: a second push while a save is in flight is ignored
// ---------------------------------------------------------------------------
describe("B6 – Re-entrancy: second push during in-flight save is ignored", () => {
  /** Add a node via CapturePanel, select it, set role to uncertainty. */
  async function addUncertaintyNode(label: string) {
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: label } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: label }));
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);
  }

  it("only one save in flight; second push deferred until the first completes", async () => {
    // Deferred save: resolve manually so we control in-flight timing.
    const pendingResolves: Array<() => void> = [];
    const saveMock = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { pendingResolves.push(res); })
    );
    (window as any).api.maps.save = saveMock;

    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    await addUncertaintyNode("Alpha risk");
    await addUncertaintyNode("Beta risk");

    // Push Beta (currently selected) — save #1 starts and stays in flight.
    fireEvent.click(await screen.findByRole("button", { name: /simulate in § i/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));

    // Select Alpha and push while Beta's save is still in flight — must be IGNORED.
    fireEvent.click(screen.getByRole("button", { name: "Alpha risk" }));
    fireEvent.click(await screen.findByRole("button", { name: /simulate in § i/i }));

    // Still exactly one save; no link registered, no navigation yet.
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(getMcLinks()).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Resolve save #1 → Beta's push completes (link + navigate).
    pendingResolves[0]!();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/mc"));
    expect(getMcLinks().map((l) => l.varName)).toEqual(["beta_risk"]);
    expect(saveMock).toHaveBeenCalledTimes(1);

    // Now Alpha's push can proceed (Alpha still selected).
    fireEvent.click(await screen.findByRole("button", { name: /simulate in § i/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    pendingResolves[1]!();
    await waitFor(() => expect(getMcLinks()).toHaveLength(2));
    expect(getMcLinks().map((l) => l.varName).sort()).toEqual(["alpha_risk", "beta_risk"]);
  });
});

// ---------------------------------------------------------------------------
// B7 – Failure contract: save rejection → no link, no navigate, console.error;
//      a retry push after the failure succeeds.
// ---------------------------------------------------------------------------
describe("B7 – Failure contract: save rejection", () => {
  it("rejected save → no addMcLink, no navigate, console.error; retry succeeds", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const saveMock = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    (window as any).api.maps.save = saveMock;

    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Flaky risk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Flaky risk" }));
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);

    // First push — save rejects.
    fireEvent.click(await screen.findByRole("button", { name: /simulate in § i/i }));
    await waitFor(() => expect(errSpy).toHaveBeenCalled());

    // Failure contract: nothing registered, no navigation.
    expect(getMcLinks()).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();

    // Retry — the node now has mc seeded (Phase 1 ran before save failed),
    // so the inspector shows "Edit in § I". Save resolves this time.
    fireEvent.click(await screen.findByRole("button", { name: /edit in § i/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/mc"));
    expect(getMcLinks().map((l) => l.varName)).toEqual(["flaky_risk"]);

    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Task 5 — § IV display side
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T5-B1 – FactorNode renders mc range chip via LayeredView data flags
//   (tested indirectly via NodeInspector for the linked node state,
//    and directly via the DependencyMap integration for the chip text)
// ---------------------------------------------------------------------------

// T5-B2 – NodeInspector shows distribution summary + Edit in § I + Unlink
// ---------------------------------------------------------------------------
describe("T5-B2 – NodeInspector: linked node shows distribution summary + actions", () => {
  const linkedNode: DependencyNode = {
    id: "linked-node-id",
    label: "Market demand",
    role: "uncertainty",
    mc: {
      varName: "market_demand",
      distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
      summary: { p10: 14, p50: 26, p90: 44, mean: 27.5, definedAt: "2026-06-11T00:00:00Z" },
    },
  };

  const linkedUnconfigured: DependencyNode = {
    id: "linked-node-id",
    label: "Market demand",
    role: "uncertainty",
    mc: {
      varName: "market_demand",
      distribution: { kind: "triangular", min: 0, mode: 0, max: 0 },
    },
  };

  it("shows distribution kind and parameters for a linked uncertainty node", () => {
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    // Should show the distribution kind
    expect(screen.getByText(/triangular/i)).toBeInTheDocument();
    // Should show parameter values — look for the params string with min value
    expect(screen.getByText(/min 10/i)).toBeInTheDocument();
  });

  it("shows the range p10·p50·p90 when summary exists", () => {
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    // Range line: 14 · 26 · 44
    expect(screen.getByText(/14/)).toBeInTheDocument();
    expect(screen.getByText(/44/)).toBeInTheDocument();
  });

  it("shows 'Edit in § I' button for a linked uncertainty node", () => {
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /edit in § i/i })
    ).toBeInTheDocument();
  });

  it("'Edit in § I' calls onPushToMC with the node id (re-register + navigate)", () => {
    const onPushToMC = vi.fn();
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={onPushToMC}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit in § i/i }));
    expect(onPushToMC).toHaveBeenCalledWith("linked-node-id");
  });

  it("shows 'Unlink' button for a linked uncertainty node", () => {
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
        onUnlinkMC={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /unlink/i })
    ).toBeInTheDocument();
  });

  it("'Unlink' calls onUnlinkMC with the node id", () => {
    const onUnlinkMC = vi.fn();
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
        onUnlinkMC={onUnlinkMC}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /unlink/i }));
    expect(onUnlinkMC).toHaveBeenCalledWith("linked-node-id");
  });

  it("does NOT show 'Unlink' when onUnlinkMC prop is absent", () => {
    render(
      <NodeInspector
        node={linkedNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
        // no onUnlinkMC
      />
    );
    expect(
      screen.queryByRole("button", { name: /unlink/i })
    ).not.toBeInTheDocument();
  });

  it("shows '→ § I' hint when linked but unconfigured (no summary)", () => {
    render(
      <NodeInspector
        node={linkedUnconfigured}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );
    // Unconfigured: distribution is all-zeros → show hint to configure
    expect(screen.getByText(/→ § i/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T5-B3 – ReadoutPanel Resolve-next rows append range suffix
// ---------------------------------------------------------------------------
describe("T5-B3 – ReadoutPanel: Resolve-next rows with mc.summary append range suffix", () => {
  function makeMapWithLinkedUncertainty(): DMap {
    return {
      id: "test-map-range",
      name: "Range test",
      createdAt: "2026-06-11T00:00:00Z",
      updatedAt: "2026-06-11T00:00:00Z",
      nodes: [
        { id: "obj-id-r", label: "Outcome", role: "objective" },
        {
          id: "unc-id-r",
          label: "Market demand",
          role: "uncertainty",
          mc: {
            varName: "market_demand",
            distribution: { kind: "triangular", min: 10, mode: 25, max: 50 },
            summary: { p10: 14, p50: 26, p90: 44, mean: 27.5, definedAt: "2026-06-11T00:00:00Z" },
          },
        },
        { id: "lev-id-r", label: "My lever", role: "lever" },
      ],
      edges: [
        { id: "e1", from: "unc-id-r", to: "obj-id-r" },
        { id: "e2", from: "lev-id-r", to: "obj-id-r" },
      ],
    };
  }

  it("appends p10–p90 range suffix to Resolve-next row reason when summary exists", () => {
    const map = makeMapWithLinkedUncertainty();
    const readout = decisionReadout(map);

    render(
      <ReadoutPanel
        map={map}
        readout={readout}
        onSelect={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );

    // The range suffix "14–44" should appear in the resolve-next row
    expect(screen.getByText(/14.{1,5}44/)).toBeInTheDocument();
  });

  it("does NOT append range suffix for Resolve-next rows without mc.summary", () => {
    const map = makeMapWithLinkedUncertainty();
    // Strip summary from the node
    const mapNoSummary: DMap = {
      ...map,
      nodes: map.nodes.map((n) =>
        n.id === "unc-id-r"
          ? { ...n, mc: { varName: "market_demand", distribution: { kind: "triangular", min: 10, mode: 25, max: 50 } } }
          : n
      ),
    };
    const readout = decisionReadout(mapNoSummary);

    render(
      <ReadoutPanel
        map={mapNoSummary}
        readout={readout}
        onSelect={vi.fn()}
        onPushToMC={vi.fn()}
      />
    );

    // No summary → no range suffix
    expect(screen.queryByText(/14.{1,5}44/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T5-B4 – handleUnlinkMC in DependencyMap strips mc key (save round-trip)
// ---------------------------------------------------------------------------
describe("T5-B4 – DependencyMap handleUnlinkMC: strips mc key from saved node", () => {
  async function lastSavedMap(): Promise<DMap> {
    const saveMock = (window as any).api.maps.save;
    return saveMock.mock.calls[saveMock.mock.calls.length - 1][0] as DMap;
  }

  it("after unlinking, saved node has no 'mc' key", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Add node via CapturePanel
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Linked risk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });

    // Select + set uncertainty
    fireEvent.click(screen.getByRole("button", { name: "Linked risk" }));
    const uncRadio = await screen.findByRole("radio", { name: /uncertainty/i });
    fireEvent.click(uncRadio);

    // Push to MC (seeds mc block)
    const simulateBtn = await screen.findByRole("button", { name: /simulate in § i/i });
    fireEvent.click(simulateBtn);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/mc"));

    // Confirm mc is present in the saved map
    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Linked risk");
      expect(node!.mc).toBeDefined();
    });

    // Now click Unlink
    const unlinkBtn = await screen.findByRole("button", { name: /unlink/i });
    fireEvent.click(unlinkBtn);

    // Save explicitly
    fireEvent.click(screen.getByTestId("map-save"));

    // mc key must be absent
    await waitFor(async () => {
      const saved = await lastSavedMap();
      const node = saved.nodes.find((n: DependencyNode) => n.label === "Linked risk");
      expect(node).toBeDefined();
      expect("mc" in node!).toBe(false);
    });
  });
});
