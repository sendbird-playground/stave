import { useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import type { GitGraphCommit, GraphRowLayout } from "./git-graph.types";
import { computeGraphLayout } from "./git-graph-layout";
import { GitGraphRow } from "./GitGraphRow";
import { GitGraphCommitDetail } from "./GitGraphCommitDetail";
import { DEFAULT_PAGE_SIZE, ROW_HEIGHT } from "./git-graph.constants";

export function GitGraphPanel() {
  const projectPath = useAppStore((s) => s.projectPath);

  const [commits, setCommits] = useState<GitGraphCommit[]>([]);
  const [graphRows, setGraphRows] = useState<GraphRowLayout[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadingRef = useRef(false);

  const fetchCommits = useCallback(async (skip: number, reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const result = await window.api?.sourceControl?.getGraphLog?.({
      cwd: projectPath ?? undefined,
      limit: DEFAULT_PAGE_SIZE,
      skip,
    });

    if (result?.ok) {
      const newCommits = reset
        ? result.commits
        : [...commits, ...result.commits];
      setCommits(newCommits);
      setGraphRows(computeGraphLayout(newCommits));
      setHasMore(result.hasMore);
    }

    setLoading(false);
    loadingRef.current = false;
  }, [projectPath, commits]);

  useEffect(() => {
    void fetchCommits(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const handleRefresh = useCallback(() => {
    setSelectedHash(null);
    void fetchCommits(0, true);
  }, [fetchCommits]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      void fetchCommits(commits.length, false);
    }
  }, [hasMore, commits.length, fetchCommits]);

  const handleSelect = useCallback((hash: string) => {
    setSelectedHash((prev) => (prev === hash ? null : hash));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/80 px-3 py-1.5">
        <p className="text-xs text-muted-foreground">
          {commits.length} commit{commits.length !== 1 ? "s" : ""}
          {hasMore ? "+" : ""}
        </p>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Graph list */}
      <div className="min-h-0 flex-1">
        <Virtuoso
          data={graphRows}
          fixedItemHeight={ROW_HEIGHT}
          endReached={handleLoadMore}
          overscan={200}
          itemContent={(index, row) => (
            <GitGraphRow
              key={row.commit.hash}
              row={row}
              selected={row.commit.hash === selectedHash}
              onSelect={handleSelect}
            />
          )}
        />
      </div>

      {/* Commit detail */}
      {selectedHash ? <GitGraphCommitDetail hash={selectedHash} /> : null}
    </div>
  );
}
