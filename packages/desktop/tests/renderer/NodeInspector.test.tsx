import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NodeInspector } from "../../src/renderer/pages/depmap/NodeInspector";
import type { DependencyNode } from "@decision-forge/core";

afterEach(cleanup);

const node: DependencyNode = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  label: "Demand",
  note: "Initial note",
};

describe("NodeInspector", () => {
  it("renders nothing when node is null", () => {
    const { container } = render(
      <NodeInspector node={null} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    // Should either be empty or show a hint — no label input
    expect(container.querySelector("input[aria-label='Label']")).toBeNull();
  });

  it("shows the truncated node id in monospace", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    // First 8 chars of the id
    expect(screen.getByText(/a1b2c3d4/)).toBeInTheDocument();
  });

  it("shows the label in an editable input", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByRole("textbox", { name: /label/i }) as HTMLInputElement;
    expect(input.value).toBe("Demand");
  });

  it("shows the note in an editable textarea", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const ta = screen.getByRole("textbox", { name: /note/i }) as HTMLTextAreaElement;
    expect(ta.value).toBe("Initial note");
  });

  it("calls onUpdate with new label on blur", () => {
    const onUpdate = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByRole("textbox", { name: /label/i });
    fireEvent.change(input, { target: { value: "New Demand" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith(node.id, { label: "New Demand" });
  });

  it("does not call onUpdate with an empty label", () => {
    const onUpdate = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByRole("textbox", { name: /label/i });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("calls onUpdate with new note on blur", () => {
    const onUpdate = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const ta = screen.getByRole("textbox", { name: /note/i });
    fireEvent.change(ta, { target: { value: "Updated note" } });
    fireEvent.blur(ta);
    expect(onUpdate).toHaveBeenCalledWith(node.id, { note: "Updated note" });
  });

  it("calls onDelete with the node id when Delete factor is clicked", () => {
    const onDelete = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /delete factor/i }));
    expect(onDelete).toHaveBeenCalledWith(node.id);
  });

  it("calls onClose when Close/× button is clicked", () => {
    const onClose = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
