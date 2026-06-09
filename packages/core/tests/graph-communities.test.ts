import { describe, it, expect } from "vitest";
import { communities } from "../src/graph/communities.js";

describe("communities", () => {
  it("groups weakly-connected nodes, separate clusters get distinct ids", () => {
    const g = { nodes: ["a","b","c","d"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"c",to:"d"}] };
    const c = communities(g);
    expect(c.get("a")).toBe(c.get("b"));
    expect(c.get("c")).toBe(c.get("d"));
    expect(c.get("a")).not.toBe(c.get("c"));
  });
  it("unifies transitive chains (a→b→c all same community)", () => {
    const g = { nodes: ["a","b","c"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"b",to:"c"}] };
    const c = communities(g);
    expect(c.get("a")).toBe(c.get("b"));
    expect(c.get("b")).toBe(c.get("c"));
  });
  it("bidirectional links land in the same community (a→b, b→a)", () => {
    const g = { nodes: ["a","b"].map(id=>({id})),
      edges: [{from:"a",to:"b"},{from:"b",to:"a"}] };
    const c = communities(g);
    expect(c.get("a")).toBe(c.get("b"));
  });
});
