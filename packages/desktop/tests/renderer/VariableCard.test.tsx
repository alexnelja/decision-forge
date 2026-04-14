import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VariableCard } from "../../src/renderer/pages/mc/VariableCard";
import type { MCVariable } from "@decision-forge/core";

afterEach(cleanup);

const baseVar: MCVariable = {
  name: "revenue",
  distribution: { kind: "normal", mean: 100, sd: 15 }
};

describe("VariableCard", () => {
  it("renders the name and mini-histogram path", () => {
    const { container } = render(
      <VariableCard variable={baseVar} onChange={() => {}} onRemove={() => {}} />
    );
    expect(screen.getByDisplayValue("revenue")).toBeTruthy();
    const path = container.querySelector("svg path");
    expect(path).toBeTruthy();
    expect(path!.getAttribute("d")!.length).toBeGreaterThan(10);
  });

  it("calls onChange with updated sd when the sd input changes", () => {
    const onChange = vi.fn();
    render(<VariableCard variable={baseVar} onChange={onChange} onRemove={() => {}} />);
    const sdInput = screen.getByLabelText(/SD/i);
    fireEvent.change(sdInput, { target: { value: "25" } });
    expect(onChange).toHaveBeenCalled();
    const updated = onChange.mock.calls.at(-1)![0] as MCVariable;
    expect(updated.distribution.kind).toBe("normal");
    expect((updated.distribution as { sd: number }).sd).toBe(25);
  });

  it("calls onRemove when the X button is clicked", () => {
    const onRemove = vi.fn();
    render(<VariableCard variable={baseVar} onChange={() => {}} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalled();
  });
});
