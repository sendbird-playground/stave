import { memo } from "react";
import type { GraphRowLayout } from "./git-graph.types";
import { GitGraphSvgCell } from "./GitGraphSvgCell";
import { ROW_HEIGHT } from "./git-graph.constants";
import { cn } from "@/lib/utils";

function GitGraphRowInner({
  row,
  selected,
  onSelect,
}: {
  row: GraphRowLayout;
  selected: boolean;
  onSelect: (hash: string) => void;
}) {
  const { commit } = row;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1 text-left transition-colors hover:bg-secondary/40",
        selected && "bg-secondary/60",
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(commit.hash)}
    >
      <GitGraphSvgCell row={row} />
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
        <span className="min-w-0 flex-1 truncate text-xs">{commit.subject}</span>
        {commit.refs.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {commit.refs.map((ref) => (
              <span
                key={ref}
                className="inline-flex max-w-[120px] truncate rounded-sm border border-border/80 bg-muted/60 px-1 py-0.5 text-[10px] leading-none text-muted-foreground"
              >
                {ref}
              </span>
            ))}
          </div>
        ) : null}
        <span className="shrink-0 text-[10px] text-muted-foreground">{commit.abbrevHash}</span>
      </div>
    </button>
  );
}

export const GitGraphRow = memo(GitGraphRowInner);
