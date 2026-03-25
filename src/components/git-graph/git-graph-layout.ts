import type { GitGraphCommit, GraphEdge, GraphRowLayout } from "./git-graph.types";
import { LANE_COLORS } from "./git-graph.constants";

/**
 * Compute graph layout for a list of commits (newest-first order).
 *
 * The algorithm maintains an ordered array of "active lanes", where each slot
 * tracks the hash of the next expected commit in that lane.  For each commit:
 *   1. Find or allocate a lane for the commit.
 *   2. Generate edges from the commit to each of its parents.
 *   3. Update the active-lane bookkeeping.
 */
export function computeGraphLayout(commits: GitGraphCommit[]): GraphRowLayout[] {
  // Each slot holds the hash of the next commit expected in that lane, or null if free.
  const activeLanes: (string | null)[] = [];
  // Map lane index → color index for consistent coloring.
  const laneColorIndex: Map<number, number> = new Map();
  let nextColorIndex = 0;

  function allocateLane(hash: string): number {
    // Reuse the leftmost free lane.
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === null) {
        activeLanes[i] = hash;
        if (!laneColorIndex.has(i)) {
          laneColorIndex.set(i, nextColorIndex++);
        }
        return i;
      }
    }
    // No free lane — push a new one.
    const idx = activeLanes.length;
    activeLanes.push(hash);
    laneColorIndex.set(idx, nextColorIndex++);
    return idx;
  }

  function laneColor(laneIdx: number): string {
    const ci = laneColorIndex.get(laneIdx) ?? 0;
    return LANE_COLORS[ci % LANE_COLORS.length] ?? LANE_COLORS[0];
  }

  const rows: GraphRowLayout[] = [];

  for (const commit of commits) {
    // --- 1. Find the lane for this commit ---
    let commitColumn = activeLanes.indexOf(commit.hash);
    if (commitColumn === -1) {
      // First appearance (e.g. branch tip not yet tracked) — allocate.
      commitColumn = allocateLane(commit.hash);
    }

    // --- 2. Build edges ---
    const incomingEdges: GraphEdge[] = [];
    const outgoingEdges: GraphEdge[] = [];

    // Incoming: every active lane that passes through this row draws a vertical line,
    // except the commit's own lane (which terminates at the node).
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] !== null && i !== commitColumn) {
        incomingEdges.push({
          fromColumn: i,
          toColumn: i,
          color: laneColor(i),
          type: "straight",
        });
      }
    }

    // Handle parents.
    const parents = commit.parents;
    if (parents.length === 0) {
      // Root commit — just free the lane.
      activeLanes[commitColumn] = null;
    } else {
      // First parent takes over the commit's lane.
      activeLanes[commitColumn] = parents[0] ?? null;
      outgoingEdges.push({
        fromColumn: commitColumn,
        toColumn: commitColumn,
        color: laneColor(commitColumn),
        type: "straight",
      });

      // Additional parents (merge commit) — find or allocate lanes.
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p]!;
        // Check if any active lane already expects this parent.
        let parentLane = activeLanes.indexOf(parentHash);
        if (parentLane === -1) {
          // Allocate a new lane for this merge parent.
          parentLane = allocateLane(parentHash);
        }
        outgoingEdges.push({
          fromColumn: commitColumn,
          toColumn: parentLane,
          color: laneColor(parentLane),
          type: commitColumn !== parentLane ? "merge-in" : "straight",
        });
      }
    }

    // Trim trailing null lanes to keep the graph compact.
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    rows.push({
      commit,
      column: commitColumn,
      incomingEdges,
      outgoingEdges,
      laneCount: Math.max(activeLanes.length, commitColumn + 1),
    });
  }

  return rows;
}
