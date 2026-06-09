// packages/core/src/schemas/dependency-map.ts
import { z } from "zod";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

export const DependencyNodeSchema = z.object({
  id: uuid,
  label: z.string().min(1),
  note: z.string().optional(),
  // --- v1.1 reserved (optional; absent in v1) ---
  type: z.enum(["objective", "factor"]).optional(),
  controllability: z.enum(["control", "influence", "concern"]).optional(),
  uncertainty: z.object({ flag: z.boolean(), impact: z.enum(["low", "high"]).optional() }).optional()
});
export type DependencyNode = z.infer<typeof DependencyNodeSchema>;

export const DependencyEdgeSchema = z.object({
  id: uuid,
  from: uuid, // driver
  to: uuid,   // driven  (from → to means "from drives to")
  sign: z.enum(["+", "-"]).optional() // v1.1
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
