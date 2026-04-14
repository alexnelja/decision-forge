import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SimulationPanel } from "../../src/renderer/pages/mc/SimulationPanel";
import type { MCConfig, MCRunResult } from "@decision-forge/core";

afterEach(cleanup);

const config: MCConfig = {
  variables: [{ name: "x", distribution: { kind: "normal", mean: 0, sd: 1 } }],
  formula: "x",
  iterations: 1000
};

const fakeResult: MCRunResult = {
  samples: Array.from({ length: 100 }, (_, i) => i - 50),
  stats: {
    mean: 0,
    sd: 1,
    min: -50,
    max: 49,
    p5: -45,
    p10: -40,
    p25: -25,
    p50: 0,
    p75: 25,
    p90: 40,
    p95: 45,
    p99: 48
  },
  iterations: 1000
};

describe("SimulationPanel", () => {
  it("calls onRun(config) with the current formula and iterations when Run is clicked", async () => {
    const onRun = vi.fn(async () => fakeResult);
    render(<SimulationPanel config={config} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    await waitFor(() => expect(onRun).toHaveBeenCalledOnce());
    const call = onRun.mock.calls[0] as unknown as [{ formula: string }];
    expect(call[0].formula).toBe("x");
  });

  it("renders the outcome histogram and stats after a run", async () => {
    const onRun = vi.fn(async () => fakeResult);
    const { container } = render(<SimulationPanel config={config} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: /run/i }));
    await waitFor(() => {
      expect(container.querySelector("svg.outcome-histogram")).toBeTruthy();
    });
    // P50 appears both as an SVG marker and in the stats strip
    expect(screen.getAllByText(/P50/i).length).toBeGreaterThan(0);
  });
});
