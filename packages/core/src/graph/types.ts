// packages/core/src/graph/types.ts
export interface GraphInput {
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<{ from: string; to: string }>;
}
