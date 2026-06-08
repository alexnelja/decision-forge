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
  return {
    readFile: async (p: string) => {
      if (p.includes("good")) return JSON.stringify(GOOD_CONFIG);
      if (p.includes("bad")) return JSON.stringify({ variables: [], formula: "" });
      if (p.includes("notjson")) return "{ not valid json";
      throw new Error(`ENOENT: no such file '${p}'`);
    },
    fetchImpl: okFetch(),
    env: {},
    ...overrides
  };
}

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
