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

// ---------------------------------------------------------------------------
// Role radio — Task 7 TDD (tests written before implementation)
// ---------------------------------------------------------------------------

describe("NodeInspector — role radio", () => {
  it("renders role radio group with Factor, Objective, Lever, Uncertainty options", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    // All four role options should be present
    expect(screen.getByRole("radio", { name: /factor/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /objective/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /lever/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /uncertainty/i })).toBeInTheDocument();
  });

  it("Factor radio is selected by default when node has no role", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const factorRadio = screen.getByRole("radio", { name: /factor/i }) as HTMLInputElement;
    expect(factorRadio.checked).toBe(true);
  });

  it("Objective radio is checked when node.role is 'objective'", () => {
    const objNode = { ...node, role: "objective" as const };
    render(
      <NodeInspector node={objNode} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const objRadio = screen.getByRole("radio", { name: /objective/i }) as HTMLInputElement;
    expect(objRadio.checked).toBe(true);
  });

  it("Lever radio is checked when node.role is 'lever'", () => {
    const levNode = { ...node, role: "lever" as const };
    render(
      <NodeInspector node={levNode} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const levRadio = screen.getByRole("radio", { name: /lever/i }) as HTMLInputElement;
    expect(levRadio.checked).toBe(true);
  });

  it("Uncertainty radio is checked when node.role is 'uncertainty'", () => {
    const uncNode = { ...node, role: "uncertainty" as const };
    render(
      <NodeInspector node={uncNode} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    const uncRadio = screen.getByRole("radio", { name: /uncertainty/i }) as HTMLInputElement;
    expect(uncRadio.checked).toBe(true);
  });

  it("selecting Lever calls onUpdate with { role: 'lever' }", () => {
    const onUpdate = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("radio", { name: /lever/i }));
    expect(onUpdate).toHaveBeenCalledWith(node.id, { role: "lever" });
  });

  it("selecting Objective calls onUpdate with { role: 'objective' }", () => {
    const onUpdate = vi.fn();
    render(
      <NodeInspector node={node} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("radio", { name: /objective/i }));
    expect(onUpdate).toHaveBeenCalledWith(node.id, { role: "objective" });
  });

  it("selecting Factor clears the role (calls onUpdate with { role: 'factor' })", () => {
    const onUpdate = vi.fn();
    const levNode = { ...node, role: "lever" as const };
    render(
      <NodeInspector node={levNode} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    // Select factor — should call with role: "factor" so DependencyMap.handleSetRole can handle key removal
    fireEvent.click(screen.getByRole("radio", { name: /factor/i }));
    expect(onUpdate).toHaveBeenCalledWith(levNode.id, { role: "factor" });
  });
});

// ---------------------------------------------------------------------------
// Role descriptions — Fix 2: plain-language descriptions shown in inspector
// ---------------------------------------------------------------------------

describe("NodeInspector — role descriptions", () => {
  it("shows a description for the Objective role", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    // The description for objective must be in the DOM (somewhere in/near the radio group)
    expect(screen.getByText(/outcome you.re deciding for/i)).toBeInTheDocument();
  });

  it("shows a description for the Lever role", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/directly act on or change/i)).toBeInTheDocument();
  });

  it("shows a description for the Uncertainty role", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/unknown that will resolve/i)).toBeInTheDocument();
  });

  it("shows a description for the Factor role", () => {
    render(
      <NodeInspector node={node} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/thing that matters/i)).toBeInTheDocument();
  });
});
