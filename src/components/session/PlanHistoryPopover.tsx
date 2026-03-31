import { useCallback, useState } from "react";
import { ClipboardCheck, FileText, History, X } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

interface PlanHistoryEntry {
  filePath: string;
  label: string;
  timestamp: string;
}

function parsePlanFilePath(filePath: string): PlanHistoryEntry {
  // Format: .stave/plans/{taskId8}_{YYYY-MM-DDTHH-MM-SS}.md
  const fileName = filePath.split("/").pop() ?? filePath;
  const nameWithoutExt = fileName.replace(/\.md$/, "");
  const parts = nameWithoutExt.split("_");
  // Reconstruct timestamp from parts after taskId (first part)
  const timestampParts = parts.slice(1).join("_");
  // Convert 2026-03-31T00-00-00 → 2026-03-31 00:00:00
  // The ISO-derived format has dashes for both date separators and time
  // separators.  We replace only the time portion: everything after the T.
  const readable = timestampParts.replace(
    /T(\d{2})-(\d{2})-(\d{2})$/,
    " $1:$2:$3",
  );

  return {
    filePath,
    label: readable || nameWithoutExt,
    timestamp: timestampParts,
  };
}

const EMPTY_PLAN_FILE_PATHS: string[] = [];

interface PlanHistoryPopoverProps {
  /** Render as icon-only button (toolbar) vs labelled button */
  variant?: "icon" | "labelled";
  className?: string;
}

export function PlanHistoryPopover(args: PlanHistoryPopoverProps) {
  const { variant = "icon", className } = args;
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ filePath: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [activeTaskId, planFilePaths, projectPath] = useAppStore(
    useShallow((state) => {
      const task = state.tasks.find((t) => t.id === state.activeTaskId);
      return [
        state.activeTaskId,
        task?.planFilePaths ?? EMPTY_PLAN_FILE_PATHS,
        state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? null,
      ] as const;
    }),
  );

  const entries = planFilePaths.map(parsePlanFilePath).reverse(); // newest first

  const loadPlanContent = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const result = await window.api?.fs?.readFile?.({ rootPath: projectPath, filePath });
      if (result?.ok && typeof result.content === "string") {
        setSelectedPlan({ filePath, content: result.content });
      } else {
        setSelectedPlan({ filePath, content: "(Failed to load plan file)" });
      }
    } catch {
      setSelectedPlan({ filePath, content: "(Failed to load plan file)" });
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            title="Plan history"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-secondary text-muted-foreground transition-colors hover:bg-secondary/60",
              open && "bg-secondary/90 text-foreground",
              className,
            )}
          >
            <History className="size-3.5" />
          </button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={className}
          >
            <History className="size-3.5" />
            Plans ({entries.length})
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[420px] max-h-[480px] overflow-hidden p-0"
      >
        {selectedPlan ? (
          <div className="flex flex-col max-h-[480px]">
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <ClipboardCheck className="size-3.5 text-primary" />
              <p className="flex-1 text-xs font-medium text-muted-foreground truncate">
                {parsePlanFilePath(selectedPlan.filePath).label}
              </p>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Back to list"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto px-3 py-2 text-sm">
              <MessageResponse>{selectedPlan.content}</MessageResponse>
            </div>
          </div>
        ) : (
          <div className="flex flex-col max-h-[480px]">
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <History className="size-3.5 text-primary" />
              <p className="flex-1 text-xs font-medium">
                Plan History
              </p>
              <span className="text-xs text-muted-foreground">{entries.length} plan{entries.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-y-auto">
              {entries.map((entry, index) => (
                <button
                  key={entry.filePath}
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/70"
                  onClick={() => void loadPlanContent(entry.filePath)}
                  disabled={loading}
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      Plan #{entries.length - index}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {entry.label}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
