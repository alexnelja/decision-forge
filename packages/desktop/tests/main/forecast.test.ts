import { describe, it, expect, vi } from "vitest";
import { ForecastClient } from "../../src/main/forecast.js";

describe("ForecastClient", () => {
  it("posts ask with correct url and method", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = new ForecastClient("http://127.0.0.1:8765", fetchMock as unknown as typeof fetch);
    await client.ask({ question: { id: "q" } as any, prediction: { id: "p" } as any });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/forecast/question",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok status with helpful message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    const client = new ForecastClient("http://127.0.0.1:8765", fetchMock as unknown as typeof fetch);
    await expect(client.list()).rejects.toThrow(/forecast.*404/i);
  });

  it("returns parsed calibration body on success", async () => {
    const payload = { count: 3, brier: 0.12, buckets: [] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })
    );
    const client = new ForecastClient("http://127.0.0.1:8765", fetchMock as unknown as typeof fetch);
    const out = await client.calibration();
    expect(out).toEqual(payload);
  });
});
