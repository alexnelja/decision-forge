import { describe, it, expect } from "vitest";
import { run } from "../src/index.js";
import type { CliDeps } from "../src/index.js";
import type { MCRunResult } from "@decision-forge/core";

const GOOD_CONFIG = {
  variables: [
    { name: "revenue", distribution: { kind: "normal", mean: 100, sd: 15 } },
    { name: "cost", distribution: { kind: "triangular", min: 40, mode: 50, max: 70 } }
  ],
  formula: "revenue - cost",
  iterations: 10_000,
  seed: 42
};

const FAKE_RESULT: MCRunResult = {
  samples: [1, 2, 3],
  iterations: 10_000,
  stats: {
    mean: 49.8,
    sd: 16,
    min: -5,
    max: 110,
    p5: 22,
    p10: 28,
    p25: 38,
    p50: 50,
    p75: 61,
    p90: 70,
    p95: 75,
    p99: 88
  },
  sensitivity: [
    { name: "revenue", index: 0.8, normalised: 0.72 },
    { name: "cost", index: 0.3, normalised: 0.28 }
  ]
};

function okFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(FAKE_RESULT), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as unknown as typeof fetch;
}

function deps(overrides: Partial<CliDeps> = {}): CliDeps {
  let n = 0;
  return {
    readFile: async (p: string) => {
      if (p.includes("good")) return JSON.stringify(GOOD_CONFIG);
      if (p.includes("bad")) return JSON.stringify({ variables: [], formula: "" });
      if (p.includes("notjson")) return "{ not valid json";
      throw new Error(`ENOENT: no such file '${p}'`);
    },
    fetchImpl: okFetch(),
    env: {},
    now: () => "2026-06-08T12:00:00.000Z",
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    ...overrides
  };
}

/** Capture a single POST: returns the recorded url + parsed body, plus an ok response. */
function capturePost(): { calls: Array<{ url: string; body: unknown }>; fetchImpl: typeof fetch } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "null")) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const A_UUID = "11111111-1111-4111-8111-111111111111";

describe("cli — base", () => {
  it("version prints 0.1.0", async () => {
    expect(await run(["version"], deps())).toBe("decision-forge 0.1.0");
  });

  it("unknown command returns usage", async () => {
    expect(await run(["banana"], deps())).toMatch(/usage/i);
  });

  it("bare `mc` lists its subcommands", async () => {
    const out = await run(["mc"], deps());
    expect(out).toMatch(/validate/i);
    expect(out).toMatch(/run/i);
  });
});

describe("cli — mc validate", () => {
  it("accepts a valid config and summarises it", async () => {
    const out = await run(["mc", "validate", "good.json"], deps());
    expect(out).toMatch(/valid/i);
    expect(out).toContain("revenue - cost");
    expect(out).toMatch(/2/); // variable count
  });

  it("rejects an invalid config with a helpful message", async () => {
    await expect(run(["mc", "validate", "bad.json"], deps())).rejects.toThrow(
      /variables|formula/i
    );
  });

  it("rejects malformed JSON", async () => {
    await expect(run(["mc", "validate", "notjson.json"], deps())).rejects.toThrow(
      /json/i
    );
  });

  it("requires a file path", async () => {
    await expect(run(["mc", "validate"], deps())).rejects.toThrow(/path|file|usage/i);
  });

  it("surfaces a missing file", async () => {
    await expect(run(["mc", "validate", "ghost.json"], deps())).rejects.toThrow(
      /ENOENT|no such file/i
    );
  });
});

describe("cli — mc run", () => {
  it("validates then prints a human stats table", async () => {
    const out = await run(["mc", "run", "good.json"], deps());
    expect(out).toContain("revenue - cost");
    expect(out).toMatch(/mean/i);
    expect(out).toMatch(/p50/i);
    expect(out).toContain("49.8"); // mean
    expect(out).toContain("50"); // p50
    expect(out).toMatch(/sensitivity/i);
    expect(out).toMatch(/revenue/);
  });

  it("--json emits the raw MCRunResult", async () => {
    const out = await run(["mc", "run", "good.json", "--json"], deps());
    expect(JSON.parse(out)).toEqual(FAKE_RESULT);
  });

  it("posts to the default sidecar url", async () => {
    let captured: string | undefined;
    const spy = (async (url: string | URL) => {
      captured = String(url);
      return new Response(JSON.stringify(FAKE_RESULT), { status: 200 });
    }) as unknown as typeof fetch;
    await run(["mc", "run", "good.json"], deps({ fetchImpl: spy }));
    expect(captured).toBe("http://127.0.0.1:8765/mc/run");
  });

  it("honours --url", async () => {
    let captured: string | undefined;
    const spy = (async (url: string | URL) => {
      captured = String(url);
      return new Response(JSON.stringify(FAKE_RESULT), { status: 200 });
    }) as unknown as typeof fetch;
    await run(["mc", "run", "good.json", "--url", "http://10.0.0.1:9000"], deps({ fetchImpl: spy }));
    expect(captured).toBe("http://10.0.0.1:9000/mc/run");
  });

  it("accepts --url before the config path", async () => {
    let captured: string | undefined;
    let body: string | undefined;
    const spy = (async (url: string | URL, init?: RequestInit) => {
      captured = String(url);
      body = String(init?.body ?? "");
      return new Response(JSON.stringify(FAKE_RESULT), { status: 200 });
    }) as unknown as typeof fetch;
    await run(["mc", "run", "--url", "http://10.0.0.1:9000", "good.json"], deps({ fetchImpl: spy }));
    expect(captured).toBe("http://10.0.0.1:9000/mc/run");
    // The config — not the URL — must be the body that was posted.
    expect(JSON.parse(body!).formula).toBe("revenue - cost");
  });

  it("falls back to $SIDECAR_URL", async () => {
    let captured: string | undefined;
    const spy = (async (url: string | URL) => {
      captured = String(url);
      return new Response(JSON.stringify(FAKE_RESULT), { status: 200 });
    }) as unknown as typeof fetch;
    await run(["mc", "run", "good.json"], deps({ fetchImpl: spy, env: { SIDECAR_URL: "http://host:1234" } }));
    expect(captured).toBe("http://host:1234/mc/run");
  });

  it("surfaces a sidecar error", async () => {
    const errFetch = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;
    await expect(
      run(["mc", "run", "good.json"], deps({ fetchImpl: errFetch }))
    ).rejects.toThrow(/500|mc\/run/i);
  });

  it("does not call the sidecar when the config is invalid", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      run(["mc", "run", "bad.json"], deps({ fetchImpl: spy }))
    ).rejects.toThrow(/variables|formula/i);
    expect(called).toBe(false);
  });
});

const FAKE_QUESTIONS = [
  {
    id: "q1",
    text: "Will revenue exceed 50?",
    latestProbability: 0.72,
    resolved: true,
    outcome: 1,
    tags: ["monte-carlo"]
  },
  {
    id: "q2",
    text: "Will the deal close by Q3?",
    latestProbability: 0.3,
    resolved: false,
    outcome: null,
    tags: []
  }
];

const FAKE_CALIB = {
  count: 12,
  brier: 0.184,
  buckets: [
    { predicted: 0.7, actual: 0.66, n: 5 },
    { predicted: 0.3, actual: 0.25, n: 4 }
  ]
};

/** A fetch that answers the two forecast GET endpoints by path. */
function forecastFetch(): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.endsWith("/forecast/questions"))
      return new Response(JSON.stringify(FAKE_QUESTIONS), { status: 200 });
    if (u.endsWith("/forecast/calibration"))
      return new Response(JSON.stringify(FAKE_CALIB), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("cli — forecast", () => {
  it("bare `forecast` lists its subcommands", async () => {
    const out = await run(["forecast"], deps({ fetchImpl: forecastFetch() }));
    expect(out).toMatch(/list/i);
    expect(out).toMatch(/calibration/i);
  });

  it("list prints a journal table", async () => {
    const out = await run(["forecast", "list"], deps({ fetchImpl: forecastFetch() }));
    expect(out).toContain("Will revenue exceed 50?");
    expect(out).toContain("Will the deal close by Q3?");
    expect(out).toContain("72%");
    expect(out).toMatch(/true/i); // resolved outcome of q1
    expect(out).toMatch(/open/i); // q2 still open
  });

  it("list --json emits the raw array", async () => {
    const out = await run(["forecast", "list", "--json"], deps({ fetchImpl: forecastFetch() }));
    expect(JSON.parse(out)).toEqual(FAKE_QUESTIONS);
  });

  it("list handles an empty journal", async () => {
    const empty = (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
    const out = await run(["forecast", "list"], deps({ fetchImpl: empty }));
    expect(out).toMatch(/0 question|none/i);
  });

  it("list GETs the questions endpoint", async () => {
    let captured: string | undefined;
    let method: string | undefined;
    const spy = (async (url: string | URL, init?: RequestInit) => {
      captured = String(url);
      method = init?.method ?? "GET";
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    await run(["forecast", "list", "--url", "http://host:1234"], deps({ fetchImpl: spy }));
    expect(captured).toBe("http://host:1234/forecast/questions");
    expect(method).toBe("GET");
  });

  it("calibration prints the Brier score and buckets", async () => {
    const out = await run(["forecast", "calibration"], deps({ fetchImpl: forecastFetch() }));
    expect(out).toMatch(/brier/i);
    expect(out).toContain("0.184");
    expect(out).toMatch(/12/); // count
  });

  it("calibration --json emits the raw report", async () => {
    const out = await run(["forecast", "calibration", "--json"], deps({ fetchImpl: forecastFetch() }));
    expect(JSON.parse(out)).toEqual(FAKE_CALIB);
  });

  it("surfaces a sidecar error", async () => {
    const errFetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(
      run(["forecast", "list"], deps({ fetchImpl: errFetch }))
    ).rejects.toThrow(/503|forecast/i);
  });
});

describe("cli — forecast ask", () => {
  it("posts a question + prediction with injected id/clock", async () => {
    const { calls, fetchImpl } = capturePost();
    const out = await run(
      ["forecast", "ask", "Will revenue exceed 50?", "--prob", "0.7", "--by", "2026-09-01"],
      deps({ fetchImpl })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:8765/forecast/question");
    const body = calls[0]!.body as {
      question: Record<string, unknown>;
      prediction: Record<string, unknown>;
    };
    expect(body.question.text).toBe("Will revenue exceed 50?");
    expect(body.question.createdAt).toBe("2026-06-08T12:00:00.000Z");
    expect(body.question.resolveBy).toBe("2026-09-01T23:59:59Z"); // date-only normalised to end of day
    expect(body.prediction.probability).toBe(0.7);
    expect(body.prediction.questionId).toBe(body.question.id); // server requires this match
    expect(out).toMatch(/asked/i);
  });

  it("splits --tags on commas", async () => {
    const { calls, fetchImpl } = capturePost();
    await run(
      ["forecast", "ask", "Q?", "--prob", "0.5", "--by", "2026-09-01", "--tags", "mc, deal ,risk"],
      deps({ fetchImpl })
    );
    const body = calls[0]!.body as { question: { tags: string[] } };
    expect(body.question.tags).toEqual(["mc", "deal", "risk"]);
  });

  it("passes a full ISO --by through unchanged", async () => {
    const { calls, fetchImpl } = capturePost();
    await run(
      ["forecast", "ask", "Q?", "--prob", "0.5", "--by", "2026-09-01T10:00:00Z"],
      deps({ fetchImpl })
    );
    const body = calls[0]!.body as { question: { resolveBy: string } };
    expect(body.question.resolveBy).toBe("2026-09-01T10:00:00Z");
  });

  it("--json reports the new ids", async () => {
    const { fetchImpl } = capturePost();
    const out = await run(
      ["forecast", "ask", "Q?", "--prob", "0.5", "--by", "2026-09-01", "--json"],
      deps({ fetchImpl })
    );
    const parsed = JSON.parse(out);
    expect(parsed.questionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.predictionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("requires question text", async () => {
    const { calls, fetchImpl } = capturePost();
    await expect(
      run(["forecast", "ask", "--prob", "0.5", "--by", "2026-09-01"], deps({ fetchImpl }))
    ).rejects.toThrow(/text|usage/i);
    expect(calls).toHaveLength(0);
  });

  it("requires --prob", async () => {
    const { fetchImpl } = capturePost();
    await expect(
      run(["forecast", "ask", "Q?", "--by", "2026-09-01"], deps({ fetchImpl }))
    ).rejects.toThrow(/prob/i);
  });

  it("rejects an out-of-range probability before posting", async () => {
    const { calls, fetchImpl } = capturePost();
    await expect(
      run(["forecast", "ask", "Q?", "--prob", "5", "--by", "2026-09-01"], deps({ fetchImpl }))
    ).rejects.toThrow(/probab|invalid/i);
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-numeric probability before posting", async () => {
    const { calls, fetchImpl } = capturePost();
    await expect(
      run(["forecast", "ask", "Q?", "--prob", "abc", "--by", "2026-09-01"], deps({ fetchImpl }))
    ).rejects.toThrow(/prob/i);
    expect(calls).toHaveLength(0);
  });
});

describe("cli — forecast resolve", () => {
  it("posts a resolution with outcome 1 for true", async () => {
    const { calls, fetchImpl } = capturePost();
    const out = await run(["forecast", "resolve", A_UUID, "true"], deps({ fetchImpl }));
    expect(calls[0]!.url).toBe("http://127.0.0.1:8765/forecast/resolve");
    const body = calls[0]!.body as Record<string, unknown>;
    expect(body.questionId).toBe(A_UUID);
    expect(body.outcome).toBe(1);
    expect(body.resolvedAt).toBe("2026-06-08T12:00:00.000Z");
    expect(out).toMatch(/true/i);
  });

  it("maps false/0 to outcome 0", async () => {
    const { calls, fetchImpl } = capturePost();
    await run(["forecast", "resolve", A_UUID, "0"], deps({ fetchImpl }));
    expect((calls[0]!.body as Record<string, unknown>).outcome).toBe(0);
  });

  it("rejects a non-boolean outcome", async () => {
    const { calls, fetchImpl } = capturePost();
    await expect(
      run(["forecast", "resolve", A_UUID, "maybe"], deps({ fetchImpl }))
    ).rejects.toThrow(/outcome|true|false/i);
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-uuid question id before posting", async () => {
    const { calls, fetchImpl } = capturePost();
    await expect(
      run(["forecast", "resolve", "not-a-uuid", "true"], deps({ fetchImpl }))
    ).rejects.toThrow(/questionId|invalid|uuid/i);
    expect(calls).toHaveLength(0);
  });

  it("requires both arguments", async () => {
    const { fetchImpl } = capturePost();
    await expect(
      run(["forecast", "resolve", A_UUID], deps({ fetchImpl }))
    ).rejects.toThrow(/usage|outcome/i);
  });
});
