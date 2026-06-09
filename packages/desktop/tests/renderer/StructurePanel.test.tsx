import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StructurePanel } from "../../src/renderer/pages/depmap/StructurePanel";

afterEach(cleanup);

const map = {
  id: "x",
  name: "m",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  nodes: [
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "c", label: "c" },
  ],
  edges: [
    { id: "1", from: "a", to: "b" },
    { id: "2", from: "b", to: "c" },
  ],
} as any;

describe("StructurePanel", () => {
  it("shows factor and connection counts", () => {
    render(<StructurePanel map={map} selectedId={null} />);
    expect(screen.getByText(/factors/i)).toBeInTheDocument();
    // "3" for nodes
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows selection reach when a node is selected", () => {
    render(<StructurePanel map={map} selectedId="a" />);
    // "a" drives b → c: downstream = 2, upstream = 0
    expect(screen.getByText(/affects/i)).toBeInTheDocument();
  });

  it("shows roots (drivers) and leaves (outcomes) counts", () => {
    render(<StructurePanel map={map} selectedId={null} />);
    expect(screen.getByText(/drivers/i)).toBeInTheDocument();
    expect(screen.getByText(/outcomes/i)).toBeInTheDocument();
  });

  it("shows cycle count = 0 without warning when no cycles", () => {
    render(<StructurePanel map={map} selectedId={null} />);
    expect(screen.getByText(/cycles/i)).toBeInTheDocument();
    // 0 cycles → no ⚠ symbol
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument();
  });

  it("shows ⚠ warning when cycles exist", () => {
    const cyclicMap = {
      ...map,
      edges: [
        { id: "1", from: "a", to: "b" },
        { id: "2", from: "b", to: "a" }, // creates a 2-cycle
      ],
    } as any;
    render(<StructurePanel map={cyclicMap} selectedId={null} />);
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });

  it("renders the MICMAC scatter SVG", () => {
    render(<StructurePanel map={map} selectedId={null} />);
    expect(screen.getByRole("img", { name: /micmac/i })).toBeInTheDocument();
  });

  it("shows empty state message when no factors", () => {
    const empty = { ...map, nodes: [], edges: [] } as any;
    render(<StructurePanel map={empty} selectedId={null} />);
    expect(screen.getByText(/add factors/i)).toBeInTheDocument();
  });
});
