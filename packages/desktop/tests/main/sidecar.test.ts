import { describe, it, expect, vi } from "vitest";
import { waitForHealth } from "../../src/main/sidecar.js";

describe("waitForHealth", () => {
  it("resolves when /health returns 200", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );
    await waitForHealth("http://127.0.0.1:8765", {
      timeoutMs: 1000,
      intervalMs: 10,
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects after timeout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      waitForHealth("http://127.0.0.1:1", {
        timeoutMs: 50,
        intervalMs: 10,
        fetchImpl: fetchMock as unknown as typeof fetch
      })
    ).rejects.toThrow(/timeout/i);
  });
});
