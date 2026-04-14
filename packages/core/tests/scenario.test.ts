import { describe, it, expect } from "vitest";
import { ScenarioSchema } from "../src/schemas/scenario.js";

describe("ScenarioSchema", () => {
  it("parses a minimal valid scenario", () => {
    const input = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Test",
      created: "2026-04-13T10:00:00Z",
      tags: ["mining"],
      description: "",
      modules: {},
      runs: []
    };
    const parsed = ScenarioSchema.parse(input);
    expect(parsed.id).toBe(input.id);
    expect(parsed.tags).toEqual(["mining"]);
  });

  it("rejects a scenario with wrong id type", () => {
    expect(() =>
      ScenarioSchema.parse({
        id: 123,
        name: "x",
        created: "2026-04-13T10:00:00Z",
        tags: [],
        description: "",
        modules: {},
        runs: []
      })
    ).toThrow();
  });

  it("roundtrips through JSON", () => {
    const input = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Roundtrip",
      created: "2026-04-13T10:00:00Z",
      tags: ["bsec", "fx"],
      description: "multi-tag test",
      modules: {},
      runs: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          scenarioId: "22222222-2222-2222-2222-222222222222",
          timestamp: "2026-04-13T10:05:00Z",
          module: "mc",
          config: { placeholder: true },
          result: { placeholder: true },
          notes: ""
        }
      ]
    };
    const parsed = ScenarioSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(parsed).toEqual(input);
  });
});
