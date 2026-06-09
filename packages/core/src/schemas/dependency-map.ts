// packages/core/src/schemas/dependency-map.ts
import { z } from "zod";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

export const DependencyNodeSchema = z.object({
  id: uuid,
  label: z.string().min(1),
  note: z.string().optional(),
  /** Canvas position persisted so manual drags survive save/load. Optional so
   *  older maps without it still parse (dagre auto-layout fills the gap). */
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  /** v1.5 — drives the Decision Readout. Absent ≡ "factor". */
  role: z.enum(["objective", "lever", "uncertainty", "factor"]).optional()
});
export type DependencyNode = z.infer<typeof DependencyNodeSchema>;

export const DependencyEdgeSchema = z.object({
  id: uuid,
  from: uuid, // driver
  to: uuid,   // driven  (from → to means "from drives to")
  sign: z.enum(["+", "-"]).optional(),       // v1.1
  confidence: z.enum(["known", "assumption"]).optional() // v1.5; absent ≡ "known"
});
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const DependencyMapSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    createdAt: iso,
    updatedAt: iso,
    nodes: z.array(DependencyNodeSchema),
    edges: z.array(DependencyEdgeSchema)
  })
  .superRefine((map, ctx) => {
    const ids = new Set(map.nodes.map((n) => n.id));
    map.edges.forEach((e, i) => {
      if (e.from === e.to)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i], message: "self-loop not allowed" });
      if (!ids.has(e.from))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i, "from"], message: "edge.from references unknown node" });
      if (!ids.has(e.to))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", i, "to"], message: "edge.to references unknown node" });
    });
  });
export type DependencyMap = z.infer<typeof DependencyMapSchema>;
