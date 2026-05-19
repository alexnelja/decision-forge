import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BatnaPicker } from "../../src/renderer/pages/nego/BatnaPicker";
import { setLatestMCVariables } from "../../src/renderer/lib/mc-store";
import type { MCVariable } from "@decision-forge/core";

afterEach(() => {
  cleanup();
  // Reset the shared store between tests
  setLatestMCVariables([]);
});

const sampleVars: MCVariable[] = [
  { name: "price", distribution: { kind: "uniform", min: 100, max: 200 } },
  { name: "shipping", distribution: { kind: "normal", mean: 20, sd: 5 } }
];

describe("BatnaPicker", () => {
  beforeEach(() => {
    setLatestMCVariables(sampleVars);
  });

  it("renders a number input in scalar mode by default", () => {
    const onChange = vi.fn();
    render(<BatnaPicker value={150} onChange={onChange} />);
    const input = screen.getByLabelText(/BATNA/i) as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.value).toBe("150");
  });

  it("emits a numeric value when the scalar input changes", () => {
    const onChange = vi.fn();
    render(<BatnaPicker value={150} onChange={onChange} />);
    const input = screen.getByLabelText(/BATNA/i);
    fireEvent.change(input, { target: { value: "175" } });
    expect(onChange).toHaveBeenCalledWith(175);
  });

  it("switches to MC-link mode when the toggle is clicked", () => {
    const onChange = vi.fn();
    render(<BatnaPicker value={150} onChange={onChange} />);
    const linkBtn = screen.getByRole("button", { name: /link to mc/i });
    fireEvent.click(linkBtn);
    // Once linked, a variable dropdown appears
    expect(screen.getByLabelText(/variable/i)).toBeTruthy();
    expect(screen.getByLabelText(/percentile/i)).toBeTruthy();
  });

  it("emits a {refMCVar, percentile} object when linking", () => {
    const onChange = vi.fn();
    render(<BatnaPicker value={150} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /link to mc/i }));
    // The default selection should auto-emit once linked (variable[0] + 50)
    expect(onChange).toHaveBeenCalledWith({ refMCVar: "price", percentile: 50 });
  });

  it("emits the picked variable + percentile when changed", () => {
    const onChange = vi.fn();
    render(
      <BatnaPicker
        value={{ refMCVar: "price", percentile: 50 }}
        onChange={onChange}
      />
    );
    const varSelect = screen.getByLabelText(/variable/i) as HTMLSelectElement;
    fireEvent.change(varSelect, { target: { value: "shipping" } });
    expect(onChange).toHaveBeenLastCalledWith({
      refMCVar: "shipping",
      percentile: 50
    });
    const pctSelect = screen.getByLabelText(/percentile/i) as HTMLSelectElement;
    fireEvent.change(pctSelect, { target: { value: "90" } });
    expect(onChange).toHaveBeenLastCalledWith({
      refMCVar: "shipping",
      percentile: 90
    });
  });

  it("shows resolved scalar preview when in MC-link mode", () => {
    render(
      <BatnaPicker
        value={{ refMCVar: "price", percentile: 50 }}
        onChange={() => {}}
      />
    );
    // Uniform(100, 200) P50 ≈ 150 (with stochastic noise from sampling)
    const preview = screen.getByTestId("batna-preview").textContent ?? "";
    const previewNum = parseFloat(preview.replace(/[^\d.-]/g, ""));
    expect(previewNum).toBeGreaterThan(130);
    expect(previewNum).toBeLessThan(170);
  });

  it("renders empty state when no MC variables exist", () => {
    setLatestMCVariables([]);
    render(<BatnaPicker value={150} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /link to mc/i }));
    // Should NOT immediately switch — should show an empty-state hint
    expect(screen.queryByLabelText(/variable/i)).toBeNull();
    expect(screen.getByText(/run a monte carlo/i)).toBeTruthy();
  });

  it("switches back to scalar mode when toggle is clicked again", () => {
    const onChange = vi.fn();
    render(
      <BatnaPicker
        value={{ refMCVar: "price", percentile: 50 }}
        onChange={onChange}
      />
    );
    const unlinkBtn = screen.getByRole("button", { name: /static/i });
    fireEvent.click(unlinkBtn);
    expect(onChange).toHaveBeenCalledWith(expect.any(Number));
    // After switching back, the scalar input should be visible
    expect((screen.getByLabelText(/BATNA/i) as HTMLInputElement).type).toBe(
      "number"
    );
  });
});
