import { describe, it, expect } from "vitest";
import { NegoConfigSchema, NegoSeatSchema, NegoIssueSchema } from "../src/schemas/nego-config.js";

const baseIssue = {
  name: "price_per_ton",
  type: "continuous" as const,
  range: [100, 200] as [number, number],
  yourWeight: 0.7
};

const humanSeat = {
  id: "buyer",
  label: "Buyer",
  controlledBy: "you" as const,
  private: {
    batna: 150,
    reservationPrice: 160,
    utilityFn: [{ issue: "price_per_ton", weight: 1.0, shape: "linear" as const }],
    info: "I have a backup supplier at 170/ton."
  }
};

const aiSeat = {
  id: "supplier",
  label: "Supplier",
  controlledBy: "ai" as const,
  private: {
    batna: 140,
    reservationPrice: 130,
    utilityFn: [{ issue: "price_per_ton", weight: 1.0 }],
    info: "Production cost 120/ton."
  },
  persona: {
    style: "collaborative" as const,
    patience: 0.7,
    deceptiveness: 0.2,
    model: "gemini-2.5-pro" as const
  }
};

describe("NegoIssue schema", () => {
  it("accepts a continuous issue with a range", () => {
    expect(() => NegoIssueSchema.parse(baseIssue)).not.toThrow();
  });

  it("rejects continuous issue without range", () => {
    expect(() =>
      NegoIssueSchema.parse({ ...baseIssue, range: undefined })
    ).toThrow();
  });

  it("accepts a discrete issue with options", () => {
    expect(() =>
      NegoIssueSchema.parse({
        name: "payment_terms",
        type: "discrete",
        options: ["net30", "net60", "net90"],
        yourWeight: 0.3
      })
    ).not.toThrow();
  });

  it("rejects discrete issue without options", () => {
    expect(() =>
      NegoIssueSchema.parse({
        name: "x",
        type: "discrete",
        yourWeight: 0.5
      })
    ).toThrow();
  });
});

describe("NegoSeat schema", () => {
  it("accepts a human-controlled seat without persona", () => {
    expect(() => NegoSeatSchema.parse(humanSeat)).not.toThrow();
  });

  it("requires persona on AI seats", () => {
    expect(() =>
      NegoSeatSchema.parse({ ...aiSeat, persona: undefined })
    ).toThrow();
  });

  it("accepts an AI seat with persona", () => {
    expect(() => NegoSeatSchema.parse(aiSeat)).not.toThrow();
  });
});

describe("NegoConfig schema", () => {
  const cfg = {
    issues: [baseIssue],
    seats: [humanSeat, aiSeat],
    maxRounds: 8,
    discountFactor: 0.95,
    acceptanceThreshold: 0.05
  };

  it("accepts a minimal two-seat config", () => {
    expect(() => NegoConfigSchema.parse(cfg)).not.toThrow();
  });

  it("requires at least two seats", () => {
    expect(() =>
      NegoConfigSchema.parse({ ...cfg, seats: [humanSeat] })
    ).toThrow();
  });

  it("requires at least one issue", () => {
    expect(() =>
      NegoConfigSchema.parse({ ...cfg, issues: [] })
    ).toThrow();
  });

  it("defaults maxRounds and discountFactor when omitted", () => {
    const parsed = NegoConfigSchema.parse({
      issues: [baseIssue],
      seats: [humanSeat, aiSeat]
    });
    expect(parsed.maxRounds).toBeGreaterThan(0);
    expect(parsed.discountFactor).toBeGreaterThan(0);
  });
});

describe("refMCVar BATNA branch", () => {
  const seatWithMCBatna = (batna: unknown) => ({
    ...humanSeat,
    private: { ...humanSeat.private, batna }
  });

  it("accepts a bare {refMCVar} and defaults percentile to 50", () => {
    const parsed = NegoSeatSchema.parse(seatWithMCBatna({ refMCVar: "price" }));
    expect(parsed.private.batna).toEqual({ refMCVar: "price", percentile: 50 });
  });

  it("accepts {refMCVar, percentile} with an explicit percentile", () => {
    const parsed = NegoSeatSchema.parse(
      seatWithMCBatna({ refMCVar: "price", percentile: 90 })
    );
    expect(parsed.private.batna).toEqual({ refMCVar: "price", percentile: 90 });
  });

  it("rejects refMCVar with empty name", () => {
    expect(() =>
      NegoSeatSchema.parse(seatWithMCBatna({ refMCVar: "", percentile: 50 }))
    ).toThrow();
  });

  it("rejects percentile out of [1, 99]", () => {
    expect(() =>
      NegoSeatSchema.parse(seatWithMCBatna({ refMCVar: "price", percentile: 0 }))
    ).toThrow();
    expect(() =>
      NegoSeatSchema.parse(
        seatWithMCBatna({ refMCVar: "price", percentile: 100 })
      )
    ).toThrow();
  });

  it("rejects non-integer percentile", () => {
    expect(() =>
      NegoSeatSchema.parse(
        seatWithMCBatna({ refMCVar: "price", percentile: 50.5 })
      )
    ).toThrow();
  });

  it("still accepts a scalar BATNA", () => {
    const parsed = NegoSeatSchema.parse(seatWithMCBatna(175));
    expect(parsed.private.batna).toBe(175);
  });
});
