import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveAppDataDir, scenariosDir, forecastsDbPath } from "../src/paths.js";

describe("paths", () => {
  it("returns override when provided", () => {
    expect(resolveAppDataDir("/tmp/df")).toBe("/tmp/df");
  });
  it("scenariosDir joins properly", () => {
    expect(scenariosDir("/tmp/df")).toBe(path.join("/tmp/df", "scenarios"));
  });
  it("forecastsDbPath joins properly", () => {
    expect(forecastsDbPath("/tmp/df")).toBe(path.join("/tmp/df", "forecasts.db"));
  });
});
