import { describe, it, expect } from "vitest";
import { run } from "../src/index.js";

describe("cli", () => {
  it("version prints 0.1.0", async () => {
    const out = await run(["version"]);
    expect(out).toBe("decision-forge 0.1.0");
  });
  it("unknown command returns usage", async () => {
    const out = await run(["banana"]);
    expect(out).toMatch(/usage/i);
  });
});
