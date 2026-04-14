import { describe, it, expect } from "vitest";
import {
  QuestionSchema,
  PredictionSchema,
  ResolutionSchema,
  CalibrationReportSchema
} from "../src/schemas/forecast.js";

describe("forecast schemas", () => {
  it("accepts a minimal question", () => {
    expect(() =>
      QuestionSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
        text: "Will copper close > $9k on 2026-12-31?",
        createdAt: "2026-04-14T10:00:00Z",
        resolveBy: "2026-12-31T23:59:59Z",
        tags: ["mining"]
      })
    ).not.toThrow();
  });

  it("rejects probability outside [0,1]", () => {
    expect(() =>
      PredictionSchema.parse({
        id: "22222222-2222-2222-2222-222222222222",
        questionId: "11111111-1111-1111-1111-111111111111",
        probability: 1.2,
        madeAt: "2026-04-14T10:00:00Z"
      })
    ).toThrow();
  });

  it("accepts resolution with outcome 0 or 1", () => {
    expect(() =>
      ResolutionSchema.parse({
        questionId: "11111111-1111-1111-1111-111111111111",
        outcome: 1,
        resolvedAt: "2027-01-02T09:00:00Z"
      })
    ).not.toThrow();
  });

  it("accepts a calibration report shape", () => {
    const parsed = CalibrationReportSchema.parse({
      count: 10,
      brier: 0.18,
      buckets: [
        { predicted: 0.1, actual: 0.0, n: 1 },
        { predicted: 0.9, actual: 1.0, n: 2 }
      ]
    });
    expect(parsed.count).toBe(10);
  });
});
