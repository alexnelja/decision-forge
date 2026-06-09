import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { CapturePanel } from "../../src/renderer/pages/depmap/CapturePanel";

const map = {
  id: "x",
  name: "m",
  createdAt: "",
  updatedAt: "",
  nodes: [{ id: "a", label: "demand" }],
  edges: []
} as any;

describe("CapturePanel", () => {
  it("adds a node on Enter and lists existing", () => {
    const onAddNode = vi.fn();
    render(
      <CapturePanel map={map} onAddNode={onAddNode} selectedId={null} onSelect={() => {}} />
    );
    expect(screen.getByText("demand")).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "supply" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddNode).toHaveBeenCalledWith("supply");
  });

  it("clears the input after Enter", () => {
    const onAddNode = vi.fn();
    render(
      <CapturePanel map={map} onAddNode={onAddNode} selectedId={null} onSelect={() => {}} />
    );
    const input = screen.getByPlaceholderText(/add a factor/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "supply" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
  });

  it("ignores empty or whitespace-only input", () => {
    const onAddNode = vi.fn();
    render(
      <CapturePanel map={map} onAddNode={onAddNode} selectedId={null} onSelect={() => {}} />
    );
    const input = screen.getByPlaceholderText(/add a factor/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddNode).not.toHaveBeenCalled();
  });

  it("calls onSelect when a node label is clicked", () => {
    const onSelect = vi.fn();
    render(
      <CapturePanel map={map} onAddNode={() => {}} selectedId={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("demand"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("marks the selected node", () => {
    const { container } = render(
      <CapturePanel map={map} onAddNode={() => {}} selectedId="a" onSelect={() => {}} />
    );
    const item = screen.getByText("demand").closest("[data-selected]");
    expect(item).not.toBeNull();
    expect(item?.getAttribute("data-selected")).toBe("true");
  });
});
