import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReactFlowProvider } from "reactflow";
import DependencyMap from "../../src/renderer/pages/DependencyMap";
import { FactorNode } from "../../src/renderer/pages/depmap/FactorNode";

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
      // At least one node should show the second-call position. Verified
      // empirically: react-flow emits "translate(333px,444px)" in jsdom.
      expect(transforms.some((t) => t.includes("translate(333px"))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty-state hint
// ---------------------------------------------------------------------------
describe("Empty-state hint", () => {
  it("shows the double-click hint when map has no nodes", () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    expect(screen.getByText(/double-click to add your first factor/i)).toBeInTheDocument();
  });

  it("does not show the hint when there are nodes", async () => {
    render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "SomeFactor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.queryByText(/double-click to add your first factor/i)).not.toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// Helper: wrap FactorNode tests in ReactFlowProvider (required for Handle hooks)
// ---------------------------------------------------------------------------
function renderFactor(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

// ---------------------------------------------------------------------------
// FactorNode unit tests (rendered directly)
// ---------------------------------------------------------------------------
describe("FactorNode — role glyphs", () => {
  const baseProps = {
    id: "n1",
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    selected: false,
    dragging: false,
    type: "factor" as const,
    dragHandle: undefined,
  };

  it("renders ◎ for objective role", () => {
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "My Objective",
          role: "objective",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    expect(screen.getByText("◎")).toBeInTheDocument();
  });

  it("renders ◆ for lever role", () => {
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "My Lever",
          role: "lever",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    expect(screen.getByText("◆")).toBeInTheDocument();
  });

  it("renders ? for uncertainty role", () => {
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Unknown",
          role: "uncertainty",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders no glyph for plain factor role", () => {
    const { container } = renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Plain Factor",
          role: "factor",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    // No glyph characters should appear
    expect(container.textContent).not.toContain("◎");
    expect(container.textContent).not.toContain("◆");
  });

  it("renders no glyph when role is absent", () => {
    const { container } = renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Plain Factor",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    expect(container.textContent).not.toContain("◎");
  });
});

// ---------------------------------------------------------------------------
// FactorNode — hover mini-toolbar
// ---------------------------------------------------------------------------
describe("FactorNode — hover toolbar", () => {
  const baseProps = {
    id: "n1",
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    selected: false,
    dragging: false,
    type: "factor" as const,
    dragHandle: undefined,
  };

  it("fires onDuplicate when ⧉ is clicked", async () => {
    const onDuplicate = vi.fn();
    const { container } = renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Node",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate,
          onDelete: vi.fn(),
        }}
      />
    );
    // Hover to reveal toolbar — the FactorNode root div is the firstChild of the wrapper
    const nodeRoot = container.querySelector("div");
    fireEvent.mouseEnter(nodeRoot as Element);
    const dupBtn = screen.getByTitle(/duplicate/i);
    fireEvent.click(dupBtn);
    expect(onDuplicate).toHaveBeenCalledWith("n1");
  });

  it("fires onDelete when 🗑 is clicked", async () => {
    const onDelete = vi.fn();
    const { container } = renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Node",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete,
        }}
      />
    );
    // Hover to reveal toolbar
    const nodeRoot = container.querySelector("div");
    fireEvent.mouseEnter(nodeRoot as Element);
    const delBtn = screen.getByTitle(/delete/i);
    fireEvent.click(delBtn);
    expect(onDelete).toHaveBeenCalledWith("n1");
  });
});

// ---------------------------------------------------------------------------
// FactorNode — inline rename mode
// ---------------------------------------------------------------------------
describe("FactorNode — inline rename", () => {
  const baseProps = {
    id: "n1",
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    selected: false,
    dragging: false,
    type: "factor" as const,
    dragHandle: undefined,
  };

  it("shows an input when renaming=true", () => {
    const onRename = vi.fn();
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Original",
          renaming: true,
          onRename,
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    const input = screen.getByDisplayValue("Original");
    expect(input.tagName).toBe("INPUT");
  });

  it("commits new label on Enter", () => {
    const onRename = vi.fn();
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Old",
          renaming: true,
          onRename,
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    const input = screen.getByDisplayValue("Old");
    fireEvent.change(input, { target: { value: "NewName" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("n1", "NewName");
  });

  it("calls onCancelRename on Esc", () => {
    const onCancelRename = vi.fn();
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Old",
          renaming: true,
          onRename: vi.fn(),
          onCancelRename,
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    const input = screen.getByDisplayValue("Old");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancelRename).toHaveBeenCalledWith("n1");
  });

  it("commits on blur", () => {
    const onRename = vi.fn();
    renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Old",
          renaming: true,
          onRename,
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    const input = screen.getByDisplayValue("Old");
    fireEvent.change(input, { target: { value: "AfterBlur" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("n1", "AfterBlur");
  });
});

// ---------------------------------------------------------------------------
// DependencyMap handlers — handleDuplicateNode, handleRenameNode, handleSetRole
// ---------------------------------------------------------------------------
describe("DependencyMap — duplicate / rename / role handlers", () => {
  it("adds a node via CapturePanel and it appears in the canvas", async () => {
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
  });

  it("⌘D on wrapper duplicates the selected node", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    // Add a node via capture panel
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "AlphaNode" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Wait for node to appear in the canvas
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBeGreaterThanOrEqual(1);
    });

    // Click the node button in the capture panel list (type=button, not the canvas span)
    const nodeBtn = screen.getByRole("button", { name: "AlphaNode" });
    fireEvent.click(nodeBtn);

    // Fire Cmd+D on the outer canvas wrapper div (which has tabIndex=-1 and onKeyDown)
    const canvasWrapper = container.querySelector("[tabindex='-1']");
    if (canvasWrapper) {
      fireEvent.keyDown(canvasWrapper, { key: "d", metaKey: true });
    }

    // A "(copy)" node should eventually appear (in CapturePanel list and/or canvas)
    await waitFor(() => {
      expect(screen.queryAllByText(/alphanode.*copy/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Cancel-by-empty rename scoping: empty commit deletes FRESH nodes only.
// Existing nodes snap back to their previous label (no data loss).
// ---------------------------------------------------------------------------
describe("Rename — cancel-by-empty scoping", () => {
  it("fresh node (double-click pane) + empty label + Enter → node is removed", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Double-click the empty pane → new node in rename mode
    const pane = container.querySelector(".react-flow__pane")!;
    fireEvent.doubleClick(pane);

    // Rename input appears inside the canvas node
    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).toBeInTheDocument();
    });

    // Clear the label and commit
    const renameInput = container.querySelector(".react-flow__node input")!;
    fireEvent.change(renameInput, { target: { value: "" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    // The fresh node is deleted (cancel-by-empty)
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(0);
    });
  });

  it("EXISTING node: double-click → clear input → Enter → node survives with original label", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Add an existing node via the CapturePanel
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "KeepMe" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
    });

    // Double-click the node itself → inline rename mode (NOT a new node)
    const node = container.querySelector(".react-flow__node")!;
    fireEvent.doubleClick(node);

    await waitFor(() => {
      const renameInput = container.querySelector(
        ".react-flow__node input"
      ) as HTMLInputElement | null;
      expect(renameInput).toBeInTheDocument();
      expect(renameInput!.value).toBe("KeepMe");
    });
    // Double-clicking a node must NOT have created a second node
    expect(container.querySelectorAll(".react-flow__node").length).toBe(1);

    // Clear the label and commit — existing node must NOT be deleted
    const renameInput = container.querySelector(".react-flow__node input")!;
    fireEvent.change(renameInput, { target: { value: "" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    // Node survives with its ORIGINAL label (rename mode exits, label snaps back)
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
      expect(container.querySelector(".react-flow__node input")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "KeepMe" })).toBeInTheDocument(); // CapturePanel list
  });

  it("fresh node (double-click pane) + Esc → node is removed (never mind)", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Double-click the empty pane → new node in rename mode
    const pane = container.querySelector(".react-flow__pane")!;
    fireEvent.doubleClick(pane);

    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).toBeInTheDocument();
    });

    // Esc during initial naming = "never mind" → fresh node removed
    const renameInput = container.querySelector(".react-flow__node input")!;
    fireEvent.keyDown(renameInput, { key: "Escape" });

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(0);
    });
  });

  it("EXISTING node: double-click → Esc → node survives with original label", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    // Add an existing node via the CapturePanel
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Survivor" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
    });

    // Enter rename mode via double-click on the node, type a draft, then Esc
    const node = container.querySelector(".react-flow__node")!;
    fireEvent.doubleClick(node);

    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).toBeInTheDocument();
    });

    const renameInput = container.querySelector(".react-flow__node input")!;
    fireEvent.change(renameInput, { target: { value: "discarded draft" } });
    fireEvent.keyDown(renameInput, { key: "Escape" });

    // Node survives, rename mode exits, original label intact
    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).not.toBeInTheDocument();
    });
    expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
    expect(screen.getByRole("button", { name: "Survivor" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
describe("ContextMenu — pane right-click shows Add node here", () => {
  it("right-click on pane triggers pane context menu with Add node here", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const pane = container.querySelector(".react-flow__pane");
    if (pane) {
      fireEvent.contextMenu(pane);
    }
    await waitFor(() => {
      expect(screen.getByText(/add node here/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Duplicate — position: a copy must land offset from the SOURCE's rendered
// position, even when the source has no schema position (CapturePanel-added
// nodes are positioned by dagre only).
// ---------------------------------------------------------------------------
describe("Duplicate — position", () => {
  it("copy of a CapturePanel-added node lands at source+24/+24, not at 24/24", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "Orig" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
    });

    // Source sits at the mocked dagre position {111,222}. Duplicate it via
    // the node context menu.
    const node = container.querySelector(".react-flow__node")!;
    fireEvent.contextMenu(node);
    const dupItem = await screen.findByText("Duplicate");
    fireEvent.click(dupItem);

    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(2);
    });
    const transforms = Array.from(container.querySelectorAll(".react-flow__node")).map(
      (n) => (n as HTMLElement).style.transform
    );
    // Copy must be at source+24/+24 = {135,246} — NOT the fixed {24,24} corner.
    expect(transforms.some((t) => t.includes("translate(135px,246px)"))).toBe(true);
    expect(transforms.some((t) => t.includes("translate(24px"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ContextMenu — keyboard accessibility + viewport clamping
// ---------------------------------------------------------------------------
describe("ContextMenu — keyboard accessibility", () => {
  it("opens as role=menu with menuitems, focuses the first item, arrows cycle", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "KeyNav" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(container.querySelectorAll(".react-flow__node").length).toBe(1);
    });

    fireEvent.contextMenu(container.querySelector(".react-flow__node")!);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.length).toBeGreaterThanOrEqual(4); // Rename/Duplicate/roles/Delete

    // First item focused on open
    await waitFor(() => {
      expect(document.activeElement).toBe(items[0]);
    });

    // ArrowDown / ArrowUp move focus, cycling at the ends
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("clamps the menu position to the viewport at extreme coordinates", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );
    const pane = container.querySelector(".react-flow__pane")!;
    fireEvent.contextMenu(pane, { clientX: 5000, clientY: 5000 });

    const menu = await screen.findByRole("menu");
    await waitFor(() => {
      const left = parseFloat((menu as HTMLElement).style.left);
      const top = parseFloat((menu as HTMLElement).style.top);
      expect(left).toBeLessThanOrEqual(window.innerWidth);
      expect(top).toBeLessThanOrEqual(window.innerHeight);
    });
  });
});

// ---------------------------------------------------------------------------
// FactorNode — toolbar on focus-within (Tab + Enter accessibility)
// ---------------------------------------------------------------------------
describe("FactorNode — toolbar on focus-within", () => {
  const baseProps = {
    id: "n1",
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    selected: false,
    dragging: false,
    type: "factor" as const,
    dragHandle: undefined,
  };

  it("shows the toolbar with aria-labelled buttons when the node receives focus", () => {
    const { container } = renderFactor(
      <FactorNode
        {...baseProps}
        data={{
          label: "Focusable",
          onRename: vi.fn(),
          onCancelRename: vi.fn(),
          onDuplicate: vi.fn(),
          onDelete: vi.fn(),
        }}
      />
    );
    const root = container.querySelector("div")!;
    fireEvent.focusIn(root);
    expect(screen.getByRole("button", { name: "Duplicate node" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete node" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Focus returns to the canvas wrapper after rename ends (so ⌘D works again)
// ---------------------------------------------------------------------------
describe("Rename — focus return", () => {
  it("rename commit moves focus back to the canvas wrapper", async () => {
    const { container } = render(
      <MemoryRouter>
        <DependencyMap />
      </MemoryRouter>
    );

    const pane = container.querySelector(".react-flow__pane")!;
    fireEvent.doubleClick(pane);
    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).toBeInTheDocument();
    });

    const renameInput = container.querySelector(".react-flow__node input")!;
    fireEvent.change(renameInput, { target: { value: "Named" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelector(".react-flow__node input")).not.toBeInTheDocument();
    });
    const wrapper = container.querySelector("[data-testid='depmap-canvas']");
    expect(wrapper).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(wrapper);
    });
  });
});
