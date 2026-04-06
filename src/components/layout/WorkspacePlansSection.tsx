import { useCallback, useEffect, useState } from "react";
import {
  ClipboardCheck,
  FileText,
  FolderOpen,
  PenLine,
  RefreshCcw,
  Save,
  Send,
  X,
} from "lucide-react";
import { MessageResponse } from "@/components/ai-elements";
import { Badge, Button, Card, CardContent, Textarea } from "@/components/ui";
import {
  buildWorkspacePlanListEntries,
  LEGACY_WORKSPACE_PLANS_DIRECTORY,
  MAX_WORKSPACE_PLANS,
  normalizeWorkspacePlanText,
  parseWorkspacePlanFilePath,
  WORKSPACE_PLANS_DIRECTORY,
  type WorkspacePlanListEntry,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

interface WorkspacePlansSectionProps {
  workspacePath: string;
  refreshNonce: number;
  embedded?: boolean;
  onOpenFile: (args: { filePath: string }) => Promise<void>;
  onSendToAgent?: (args: { filePath: string }) => void;
  sendToAgentDisabled?: boolean;
}

interface SelectedWorkspacePlan {
  filePath: string;
  content: string;
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

  return buildWorkspacePlanListEntries({
    currentFilePaths: currentResult?.ok
      ? currentResult.entries
        .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
        .map((entry) => entry.path)
      : [],
    legacyFilePaths: legacyResult?.ok
      ? legacyResult.entries
        .filter((entry) => entry.type === "file" && entry.path.endsWith(".md"))
        .map((entry) => entry.path)
      : [],
  });
}

function WorkspacePlansSectionBody(args: WorkspacePlansSectionProps) {
  const {
    workspacePath,
    refreshNonce,
    embedded = false,
    onOpenFile,
    onSendToAgent,
    sendToAgentDisabled = false,
  } = args;
  const [entries, setEntries] = useState<WorkspacePlanListEntry[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SelectedWorkspacePlan | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPlanContent = useCallback(async (filePath: string) => {
    if (!workspacePath) {
      return;
    }

    setContentLoading(true);
    setSaveError(null);
    try {
      const result = await window.api?.fs?.readFile?.({ rootPath: workspacePath, filePath });
      const content = result?.ok && typeof result.content === "string"
        ? result.content
        : "(Failed to load plan file)";
      setSelectedPlan({ filePath, content });
      setDraftContent(content);
      setIsEditing(false);
    } catch {
      const content = "(Failed to load plan file)";
      setSelectedPlan({ filePath, content });
      setDraftContent(content);
      setIsEditing(false);
    } finally {
      setContentLoading(false);
    }
  }, [workspacePath]);

  const loadPlans = useCallback(async () => {
    if (!workspacePath) {
      setEntries([]);
      setSelectedPlan(null);
      setDraftContent("");
      setIsEditing(false);
      setSaveError(null);
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
        setDraftContent("");
        setIsEditing(false);
        setSaveError(null);
        return;
      }

      if (!selectedPlan || selectedPlan.filePath !== nextSelectedPath || !isEditing) {
        void loadPlanContent(nextSelectedPath);
      }
    } finally {
      setListLoading(false);
    }
  }, [isEditing, loadPlanContent, selectedPlan, workspacePath]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans, refreshNonce]);

  const hasUnsavedChanges = Boolean(selectedPlan && draftContent !== selectedPlan.content);

  const saveSelectedPlan = useCallback(async () => {
    if (!workspacePath || !selectedPlan) {
      return false;
    }

    const writeFile = window.api?.fs?.writeFile;
    if (!writeFile) {
      setSaveError("Saving is unavailable in this runtime.");
      return false;
    }

    setSavePending(true);
    setSaveError(null);
    try {
      const content = normalizeWorkspacePlanText(draftContent);
      const result = await writeFile({
        rootPath: workspacePath,
        filePath: selectedPlan.filePath,
        content,
      });
      if (!result?.ok) {
        setSaveError(result?.stderr || "Failed to save plan file.");
        return false;
      }

      setSelectedPlan({
        filePath: selectedPlan.filePath,
        content,
      });
      setDraftContent(content);
      setIsEditing(false);
      return true;
    } catch {
      setSaveError("Failed to save plan file.");
      return false;
    } finally {
      setSavePending(false);
    }
  }, [draftContent, selectedPlan, workspacePath]);

  const handleSendToAgent = useCallback(async () => {
    if (!selectedPlan || !onSendToAgent) {
      return;
    }

    if (isEditing && hasUnsavedChanges) {
      const saved = await saveSelectedPlan();
      if (!saved) {
        return;
      }
    }

    onSendToAgent({ filePath: selectedPlan.filePath });
  }, [hasUnsavedChanges, isEditing, onSendToAgent, saveSelectedPlan, selectedPlan]);

  return (
    <div className="space-y-3">
      {embedded ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Latest saved plans from `.stave/context/plans`, with legacy `.stave/plans` support.
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-sm">
              {entries.length}/{MAX_WORKSPACE_PLANS}
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
      ) : (
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
      )}

      {!workspacePath ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Workspace path unavailable, so plans cannot be listed here.
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-xs leading-5 text-muted-foreground">
          No saved plans yet. New plan reviews will be written to `.stave/context/plans` and older `.stave/plans` files also appear here.
        </div>
      ) : (
        <div className={cn("grid gap-3", embedded ? "xl:grid-cols-[14rem_minmax(0,1fr)]" : "xl:grid-cols-[18rem_minmax(0,1fr)]")}>
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
                <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5">
                  <FileText className="size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {parseWorkspacePlanFilePath(selectedPlan.filePath).label}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{selectedPlan.filePath}</p>
                  </div>
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm"
                        onClick={() => void saveSelectedPlan()}
                        disabled={savePending || !hasUnsavedChanges}
                      >
                        <Save className="mr-1 size-4" />
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm"
                        onClick={() => {
                          setDraftContent(selectedPlan.content);
                          setIsEditing(false);
                          setSaveError(null);
                        }}
                        disabled={savePending}
                      >
                        <X className="mr-1 size-4" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-sm"
                      onClick={() => {
                        setIsEditing(true);
                        setSaveError(null);
                      }}
                    >
                      <PenLine className="mr-1 size-4" />
                      Edit
                    </Button>
                  )}
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-sm"
                    onClick={() => void handleSendToAgent()}
                    disabled={sendToAgentDisabled || savePending || !onSendToAgent}
                  >
                    <Send className="mr-1 size-4" />
                    Send to Agent
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
                  {contentLoading ? (
                    <p className="text-sm text-muted-foreground">Loading plan preview...</p>
                  ) : isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draftContent}
                        onChange={(event) => setDraftContent(event.target.value)}
                        className="min-h-[20rem] resize-y text-sm font-mono"
                        placeholder="Edit the saved plan markdown..."
                      />
                      {saveError ? (
                        <p className="text-xs text-destructive">{saveError}</p>
                      ) : hasUnsavedChanges ? (
                        <p className="text-xs text-muted-foreground">Unsaved changes</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Saved</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <MessageResponse>{selectedPlan.content}</MessageResponse>
                      {saveError ? (
                        <p className="text-xs text-destructive">{saveError}</p>
                      ) : null}
                    </div>
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
    </div>
  );
}

export function WorkspacePlansSection(args: WorkspacePlansSectionProps) {
  if (args.embedded) {
    return <WorkspacePlansSectionBody {...args} />;
  }

  return (
    <Card size="sm" className="border border-border/70 bg-background/80">
      <CardContent className="pt-4">
        <WorkspacePlansSectionBody {...args} />
      </CardContent>
    </Card>
  );
}
