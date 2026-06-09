import { describe, it, expect } from "vitest";
import { reachDownstream, reachUpstream } from "../src/graph/reach.js";

const g = { nodes: ["a","b","c","d"].map(id=>({id})),
  edges: [{from:"a",to:"b"},{from:"b",to:"c"},{from:"x",to:"a"}] };

describe("reach", () => {
  it("downstream excludes the start, follows from→to transitively", () => {
    expect([...reachDownstream(g, "a")].sort()).toEqual(["b","c"]);
  });
  it("upstream follows to→from", () => {
    expect([...reachUpstream(g, "c")].sort()).toEqual(["a","b"]);
  });
  it("is cycle-safe", () => {
    const cyc = { nodes:["a","b"].map(id=>({id})), edges:[{from:"a",to:"b"},{from:"b",to:"a"}] };
    expect([...reachDownstream(cyc,"a")].sort()).toEqual(["a","b"]); // a reaches b, b reaches a
  });
});
