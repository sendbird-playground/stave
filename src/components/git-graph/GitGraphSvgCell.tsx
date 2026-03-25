import { memo } from "react";
import type { GraphRowLayout } from "./git-graph.types";
import { LANE_WIDTH, ROW_HEIGHT, NODE_RADIUS, LANE_COLORS } from "./git-graph.constants";

function laneX(column: number): number {
  return column * LANE_WIDTH + LANE_WIDTH / 2;
}

const midY = ROW_HEIGHT / 2;

function GitGraphSvgCellInner({ row }: { row: GraphRowLayout }) {
  const svgWidth = Math.max(row.laneCount, row.column + 1) * LANE_WIDTH + LANE_WIDTH;
  const commitX = laneX(row.column);
  const commitColor = LANE_COLORS[row.column % LANE_COLORS.length];

  return (
    <svg
      width={svgWidth}
      height={ROW_HEIGHT}
      className="shrink-0"
      style={{ minWidth: svgWidth }}
    >
      {/* Pass-through lanes (incoming edges that continue straight) */}
      {row.incomingEdges.map((edge, i) => (
        <line
          key={`in-${i}`}
          x1={laneX(edge.fromColumn)}
          y1={0}
          x2={laneX(edge.toColumn)}
          y2={ROW_HEIGHT}
          stroke={edge.color}
          strokeWidth={2}
          strokeOpacity={0.5}
        />
      ))}

      {/* Outgoing edges */}
      {row.outgoingEdges.map((edge, i) => {
        if (edge.type === "straight") {
          return (
            <line
              key={`out-${i}`}
              x1={laneX(edge.fromColumn)}
              y1={midY}
              x2={laneX(edge.toColumn)}
              y2={ROW_HEIGHT}
              stroke={edge.color}
              strokeWidth={2}
            />
          );
        }
        // merge-in or fork-out: draw a bezier curve
        const startX = laneX(edge.fromColumn);
        const endX = laneX(edge.toColumn);
        return (
          <path
            key={`out-${i}`}
            d={`M ${startX} ${midY} C ${startX} ${ROW_HEIGHT * 0.75}, ${endX} ${ROW_HEIGHT * 0.75}, ${endX} ${ROW_HEIGHT}`}
            fill="none"
            stroke={edge.color}
            strokeWidth={2}
          />
        );
      })}

      {/* Commit node */}
      <circle
        cx={commitX}
        cy={midY}
        r={NODE_RADIUS}
        fill={commitColor}
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export const GitGraphSvgCell = memo(GitGraphSvgCellInner);
