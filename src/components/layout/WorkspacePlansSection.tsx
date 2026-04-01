import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, FileText, FolderOpen, RefreshCcw } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import {
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  parseWorkspacePlanFilePath,
  sortWorkspacePlansNewestFirst,
  WORKSPACE_PLANS_DIRECTORY,
  type WorkspacePlanEntry,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

interface WorkspacePlansSectionProps {
  workspacePath: string;
  refreshNonce: number;
  onOpenFile: (args: { filePath: string }) => Promise<void>;
}

interface WorkspacePlanListEntry extends WorkspacePlanEntry {
  source: "current" | "legacy";
}

async function listWorkspacePlanEntries(rootPath: string): Promise<WorkspacePlanListEntry[]> {
  const listDirectory = window.api?.fs?.listDirectory;
  if (!listDirectory) {
    return [];
  }

  const [currentResult, legacyResult] = await Promise.all([
    listDirectory({ rootPath, directoryPath: WORKSPACE_PLANS_DIRECTORY }),
    listDirectory({ rootPath, directoryPath: LEGACY_WORKSPACE_PLANS_DIRECTORY }),
  ]);

  const nextEntries = [
    ...(currentResult?.ok ? currentResult.entries.map((entry) => ({ entry, source: "current" as const })) : []),
    ...(legacyResult?.ok ? legacyResult.entries.map((entry) => ({ entry, source: "legacy" as const })) : []),
  ]
    .filter(({ entry }) => entry.type === "file" && entry.path.endsWith(".md"))
    .map(({ entry, source }) => ({
      ...parseWorkspacePlanFilePath(entry.path),
      source,
    }));

  const dedupedEntries = new Map<string, WorkspacePlanListEntry>();
  nextEntries.forEach((entry) => {
    dedupedEntries.set(entry.filePath, entry);
  });

  return sortWorkspacePlansNewestFirst([...dedupedEntries.values()]);
}

export function WorkspacePlansSection(args: WorkspacePlansSectionProps) {
  const { workspacePath, refreshNonce, onOpenFile } = args;
  const [entries, setEntries] = useState<WorkspacePlanListEntry[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<{ filePath: string; content: string } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);

  const loadPlanContent = useCallback(async (filePath: string) => {
    if (!workspacePath) {
      return;
    }
    setContentLoading(true);
    try {
      const result = await window.api?.fs?.readFile?.({ rootPath: workspacePath, filePath });
      setSelectedPlan({
        filePath,
        content: result?.ok && typeof result.content === "string" ? result.content : "(Failed to load plan file)",
      });
    } catch {
      setSelectedPlan({ filePath, content: "(Failed to load plan file)" });
    } finally {
      setContentLoading(false);
    }
  }, [workspacePath]);

  const loadPlans = useCallback(async () => {
    if (!workspacePath) {
      setEntries([]);
      setSelectedPlan(null);
      return;
    }
    setListLoading(true);
    try {
      const nextEntries = await listWorkspacePlanEntries(workspacePath);
      setEntries(nextEntries);

      const nextSelectedPath = (() => {
        if (selectedPlan && nextEntries.some((entry) => entry.filePath === selectedPlan.filePath)) {
          return selectedPlan.filePath;
        }
        return nextEntries[0]?.filePath ?? null;
      })();

      if (!nextSelectedPath) {
        setSelectedPlan(null);
        return;
      }

      if (!selectedPlan || selectedPlan.filePath !== nextSelectedPath) {
        void loadPlanContent(nextSelectedPath);
      }
    } finally {
      setListLoading(false);
    }
  }, [loadPlanContent, selectedPlan, workspacePath]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, refreshNonce]);

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Plans</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Workspace plans are stored as markdown files in `.stave/context/plans` and surfaced here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-sm">
              {entries.length} saved
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => void loadPlans()}
            >
              <RefreshCcw className={cn("mr-1 size-4", listLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {!workspacePath ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Workspace path unavailable, so plans cannot be listed here.
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-xs leading-5 text-muted-foreground">
            No saved plans yet. New plan reviews will be written to `.stave/context/plans` and older `.stave/plans` files also appear here.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="space-y-2">
              {entries.map((entry, index) => {
                const isSelected = selectedPlan?.filePath === entry.filePath;
                return (
                  <button
                    key={entry.filePath}
                    type="button"
                    onClick={() => void loadPlanContent(entry.filePath)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/35",
                      isSelected && "border-primary/35 bg-primary/8",
                    )}
                  >
                    <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {index === 0 ? "Latest plan" : `Plan ${entries.length - index}`}
                        </p>
                        {entry.source === "legacy" ? (
                          <Badge variant="outline" className="rounded-sm px-1.5 py-0 text-[10px]">
                            legacy
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{entry.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground/80">Task {entry.taskIdPrefix || "unknown"}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 rounded-lg border border-border/70 bg-muted/15">
              {selectedPlan ? (
                <div className="flex h-full min-h-[18rem] flex-col">
                  <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
                    <FileText className="size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {parseWorkspacePlanFilePath(selectedPlan.filePath).label}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{selectedPlan.filePath}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-sm"
                      onClick={() => void onOpenFile({ filePath: selectedPlan.filePath })}
                    >
                      <FolderOpen className="mr-1 size-4" />
                      Open file
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
                    {contentLoading ? (
                      <p className="text-sm text-muted-foreground">Loading plan preview...</p>
                    ) : (
                      <MessageResponse>{selectedPlan.content}</MessageResponse>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[18rem] items-center justify-center px-4 text-sm text-muted-foreground">
                  Select a plan to preview it.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
