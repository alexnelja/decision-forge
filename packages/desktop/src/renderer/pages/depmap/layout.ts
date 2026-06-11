import dagre from "dagre";

/** Node width/height used for dagre layout calculations. */
const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;

/**
 * Pure layout function: given nodes and edges, return a Map of { x, y }
 * positions for each node id using dagre's top-down (TB) ranking.
 *
 * Positions are the top-left corner suitable for react-flow's node.position.
 */
export function layoutPositions(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) return new Map();

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    ranksep: 80,
    nodesep: 60,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const result = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      // dagre returns center-x, center-y; convert to top-left for react-flow
      result.set(node.id, {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      });
    }
  }

  return result;
}
