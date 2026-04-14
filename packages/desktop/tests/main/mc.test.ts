import { describe, it, expect, vi } from "vitest";
import { McClient } from "../../src/main/mc.js";

describe("McClient", () => {
  it("posts to /mc/run with the config body", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ samples: [1, 2, 3], stats: { mean: 2, sd: 1, min: 1, max: 3, p5: 1, p10: 1, p25: 1.5, p50: 2, p75: 2.5, p90: 3, p95: 3, p99: 3 }, iterations: 1000 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = new McClient("http://engine", fetchImpl as unknown as typeof fetch);
    const cfg = {
      variables: [{ name: "x", distribution: { kind: "normal" as const, mean: 0, sd: 1 } }],
      formula: "x",
      iterations: 1000
    };
    const result = await client.run(cfg);
    expect(result.iterations).toBe(1000);
    expect(result.stats.mean).toBe(2);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("http://engine/mc/run");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual(cfg);
  });

  it("throws on non-OK responses with a short reason", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("formula error: unknown name zzz", { status: 400 })
    );
    const client = new McClient("http://engine", fetchImpl as unknown as typeof fetch);
    await expect(
      client.run({
        variables: [{ name: "x", distribution: { kind: "normal", mean: 0, sd: 1 } }],
        formula: "zzz",
        iterations: 200
      })
    ).rejects.toThrow(/400/);
  });
});
