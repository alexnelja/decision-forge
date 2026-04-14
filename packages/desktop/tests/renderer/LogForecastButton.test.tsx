import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { LogForecastButton } from "../../src/renderer/pages/mc/LogForecastButton";
import type { MCRunResult } from "@decision-forge/core";

afterEach(cleanup);

const result: MCRunResult = {
  samples: Array.from({ length: 100 }, (_, i) => i),  // 0..99
  stats: {
    mean: 49.5,
    sd: 28,
    min: 0,
    max: 99,
    p5: 4,
    p10: 9,
    p25: 24,
    p50: 49,
    p75: 74,
    p90: 89,
    p95: 94,
    p99: 98
  },
  iterations: 10000
};

describe("LogForecastButton", () => {
  it("opens a popover with the P90 value prefilled and calls forecastApi.ask on commit", async () => {
    const ask = vi.fn(async () => ({ ok: true as const }));
    render(
      <LogForecastButton
        result={result}
        formula="revenue - cost"
        askImpl={ask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /log p90/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Question text prefilled with formula + threshold
    const textField = screen.getByLabelText(/question/i) as HTMLTextAreaElement;
    expect(textField.value).toContain("revenue - cost");
    expect(textField.value).toContain("89");

    fireEvent.click(screen.getByRole("button", { name: /commit/i }));

    await waitFor(() => expect(ask).toHaveBeenCalledOnce());
    const call = ask.mock.calls[0] as unknown as [{ text: string }, unknown];
    expect(call[0].text).toContain("89");
    // Question text concerns exceeding a value — probability should be low (P90 → ~10%)
  });

  it("is hidden when result is null", () => {
    const { container } = render(
      <LogForecastButton result={null} formula="x" askImpl={vi.fn()} />
    );
    expect(container.querySelector("button")).toBeNull();
  });
});
