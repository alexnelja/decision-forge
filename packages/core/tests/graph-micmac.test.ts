import { describe, it, expect } from "vitest";
import { micmac } from "../src/graph/micmac.js";

it("classifies a clear driver and a clear dependent", () => {
  // 'a' drives 3, depends on 0 → driver; 'sink' driven by 3, drives 0 → dependent
  const g = { nodes: ["a","b","c","sink"].map(id=>({id})),
    edges: [{from:"a",to:"b"},{from:"a",to:"c"},{from:"a",to:"sink"},{from:"b",to:"sink"},{from:"c",to:"sink"}] };
  const m = micmac(g);
  expect(m.get("a")!.influence).toBe(3);
  expect(m.get("a")!.dependence).toBe(0);
  expect(m.get("a")!.quadrant).toBe("driver");
  expect(m.get("sink")!.quadrant).toBe("dependent");
});
