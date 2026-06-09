import { describe, it, expect } from "vitest";
import { communities } from "../src/graph/communities.js";

it("groups weakly-connected nodes, separate clusters get distinct ids", () => {
  const g = { nodes: ["a","b","c","d"].map(id=>({id})),
    edges: [{from:"a",to:"b"},{from:"c",to:"d"}] };
  const c = communities(g);
  expect(c.get("a")).toBe(c.get("b"));
  expect(c.get("c")).toBe(c.get("d"));
  expect(c.get("a")).not.toBe(c.get("c"));
});
