import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Forecast from "../../src/renderer/pages/Forecast";

function stubApi(overrides: Partial<Window["api"]["forecast"]> = {}) {
  const list = vi.fn().mockResolvedValue([]);
  const calibration = vi.fn().mockResolvedValue({ count: 0, brier: 0, buckets: [] });
  const ask = vi.fn().mockResolvedValue({ ok: true });
  const resolve = vi.fn().mockResolvedValue({ ok: true });
  const predict = vi.fn().mockResolvedValue({ ok: true });
  const forecast = { list, calibration, ask, resolve, predict, ...overrides };
  // @ts-expect-error — attach a minimal api stub
  window.api = { sidecarUrl: () => "x", scenarios: {}, forecast };
  return forecast;
}

describe("Forecast page", () => {
  beforeEach(() => {
    stubApi();
  });

  it("shows the empty state and the seed button when no rows exist", async () => {
    render(
      <MemoryRouter initialEntries={["/forecast"]}>
        <Forecast />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByText(/ledger is ruled/i)).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: /seed 10 samples/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/no resolved questions yet/i)).toBeInTheDocument();
  });

  it("renders rows and reports brier when data is present", async () => {
    const forecast = stubApi({
      list: vi.fn().mockResolvedValue([
        {
          id: "q1",
          text: "Will it rain?",
          createdAt: "2026-04-14T10:00:00Z",
          resolveBy: "2026-04-20T10:00:00Z",
          resolutionCriteria: null,
          scenarioId: null,
          tags: ["weather"],
          latestProbability: 0.3,
          latestMadeAt: "2026-04-14T10:00:00Z",
          outcome: 0,
          resolvedAt: "2026-04-21T10:00:00Z",
          resolved: true
        }
      ]),
      calibration: vi.fn().mockResolvedValue({
        count: 1,
        brier: 0.09,
        buckets: [{ predicted: 0.3, actual: 0, n: 1 }]
      })
    });
    render(
      <MemoryRouter initialEntries={["/forecast"]}>
        <Forecast />
      </MemoryRouter>
    );
    await waitFor(() => expect(forecast.list).toHaveBeenCalled());
    expect(await screen.findByText(/will it rain/i)).toBeInTheDocument();
    // Brier 0.090 renders in both the calibration panel and the row's Brier column.
    const matches = await screen.findAllByText(/0\.090/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("asks via forecastApi when the form is submitted", async () => {
    const forecast = stubApi();
    render(
      <MemoryRouter initialEntries={["/forecast"]}>
        <Forecast />
      </MemoryRouter>
    );
    await waitFor(() => expect(forecast.list).toHaveBeenCalled());

    const inputs = screen.getAllByPlaceholderText(/Will …\?/);
    const input = inputs[0]!;
    fireEvent.change(input, { target: { value: "Will it snow?" } });
    const buttons = screen.getAllByRole("button", { name: /commit prediction/i });
    fireEvent.click(buttons[0]!);

    await waitFor(() => expect(forecast.ask).toHaveBeenCalledTimes(1));
    const askMock = forecast.ask as unknown as { mock: { calls: Array<[{ question: { text: string }; prediction: { probability: number } }]> } };
    const [body] = askMock.mock.calls[0]!;
    expect(body.question.text).toBe("Will it snow?");
    expect(body.prediction.probability).toBeCloseTo(0.5, 5);
  });
});
