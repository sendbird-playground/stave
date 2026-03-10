import {
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder,
  FolderPlus,
  FolderOpen,
  FolderTree,
  GitBranch,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { buildExplorerIndex, collectAncestorFolders, normalizeRelativeInputPath, type ExplorerNode } from "./editor-panel.utils";

interface SourceControlItem {
  code: string;
  path: string;
}

interface SourceControlHistoryItem {
  hash: string;
  relativeDate: string;
  subject: string;
}

function parseUnifiedDiff(args: { patch: string }) {
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of args.patch.split("\n")) {
    if (line.startsWith("@@") || line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
      continue;
    }
    const context = line.startsWith(" ") ? line.slice(1) : line;
    oldLines.push(context);
    newLines.push(context);
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

function ExplorerTreeRow(args: {
  node: ExplorerNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const { node, depth, expanded, onToggle, onOpenFile } = args;
  const isFolder = node.type === "folder";
  const isOpen = isFolder && expanded.has(node.path);

  return (
    <div>
      <button
        type="button"
        onClick={() => (isFolder ? onToggle(node.path) : onOpenFile(node.path))}
        className="flex min-w-0 w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-secondary/60"
        style={{ paddingLeft: `${6 + depth * 14}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
            {isOpen ? <FolderOpen className="size-3.5 text-muted-foreground" /> : <Folder className="size-3.5 text-muted-foreground" />}
          </>
        ) : (
          <>
            <span className="inline-block w-3.5" />
            <span className="inline-block size-1.5 rounded-full bg-muted-foreground/70" />
          </>
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      {isFolder && isOpen
        ? node.children.map((child) => (
          <ExplorerTreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))
        : null}
    </div>
  );
}

export function EditorPanel() {
  const [
    projectFiles,
    activeWorkspaceId,
    workspaceRootName,
    sidebarOverlayVisible,
    workspaceCwd,
    openFileFromTree,
    openDiffInEditor,
    setLayout,
    refreshProjectFiles,
  ] = useAppStore(useShallow((state) => [
    state.projectFiles,
    state.activeWorkspaceId,
    state.workspaceRootName,
    state.layout.sidebarOverlayVisible,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined,
    state.openFileFromTree,
    state.openDiffInEditor,
    state.setLayout,
    state.refreshProjectFiles,
  ] as const));

  const [rightTab, setRightTab] = useState<"explorer" | "changes">("explorer");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [didInitExpandedFolders, setDidInitExpandedFolders] = useState(false);
  const [explorerError, setExplorerError] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  const [sourceBranch, setSourceBranch] = useState("unknown");
  const [sourceItems, setSourceItems] = useState<SourceControlItem[]>([]);
  const [sourceHistory, setSourceHistory] = useState<SourceControlHistoryItem[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [hasConflicts, setHasConflicts] = useState(false);
  const [isScmBusy, setIsScmBusy] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [selectedDiffContent, setSelectedDiffContent] = useState("");

  const explorerIndex = useMemo(() => buildExplorerIndex({ files: projectFiles }), [projectFiles]);
  const explorerTree = explorerIndex.tree;
  const filteredScmItems = sourceItems;
  const explorerProjectName = workspaceRootName?.trim() || "Project";

  useEffect(() => {
    if (didInitExpandedFolders) {
      return;
    }
    setExpandedFolders(new Set(explorerIndex.topFolders));
    setDidInitExpandedFolders(true);
  }, [didInitExpandedFolders, explorerIndex.topFolders]);

  useEffect(() => {
    setExpandedFolders(new Set());
    setDidInitExpandedFolders(false);
    setExplorerError("");
  }, [activeWorkspaceId]);

  useEffect(() => {
    const onSetTab = (event: Event) => {
      const custom = event as CustomEvent<"explorer" | "changes">;
      if (!custom.detail) {
        return;
      }
      setRightTab(custom.detail);
      setLayout({ patch: { sidebarOverlayVisible: true } });
    };
    window.addEventListener("stave:right-panel-tab", onSetTab as EventListener);
    return () => window.removeEventListener("stave:right-panel-tab", onSetTab as EventListener);
  }, [setLayout]);

  async function loadScmStatus() {
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      setSourceError("Source Control bridge unavailable. Use bun run dev:all or bun run dev:desktop.");
      return;
    }

    setIsScmBusy(true);
    const result = await getStatus({ cwd: workspaceCwd });
    setSourceBranch(result.branch);
    setSourceItems(result.items);
    setHasConflicts(result.hasConflicts);
    setSourceError(result.ok ? "" : result.stderr || "git status failed");

    const getHistory = window.api?.sourceControl?.getHistory;
    if (getHistory) {
      const historyResult = await getHistory({ cwd: workspaceCwd, limit: 15 });
      if (historyResult.ok) {
        setSourceHistory(historyResult.items);
      }
    }

    setIsScmBusy(false);
  }

  useEffect(() => {
    if (rightTab === "changes" && sidebarOverlayVisible) {
      void loadScmStatus();
    }
  }, [rightTab, sidebarOverlayVisible]);

  async function handleStageAll() {
    const stageAll = window.api?.sourceControl?.stageAll;
    if (!stageAll) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    const result = await stageAll({ cwd: workspaceCwd });
    if (!result.ok) {
      setSourceError(result.stderr || "git add failed");
    }
    await loadScmStatus();
    setIsScmBusy(false);
  }

  async function handleCommit() {
    const commit = window.api?.sourceControl?.commit;
    if (!commit) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    const result = await commit({ message: commitMessage, cwd: workspaceCwd });
    if (!result.ok) {
      setSourceError(result.stderr || "git commit failed");
    } else {
      setCommitMessage("");
      setSourceError("");
    }
    await loadScmStatus();
    setIsScmBusy(false);
  }

  async function handleStageToggle(args: { item: SourceControlItem }) {
    const isStaged = args.item.code[0] && args.item.code[0] !== "?" && args.item.code[0] !== " ";
    const stageFile = window.api?.sourceControl?.stageFile;
    const unstageFile = window.api?.sourceControl?.unstageFile;
    if (!stageFile || !unstageFile) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    const result = isStaged
      ? await unstageFile({ path: args.item.path, cwd: workspaceCwd })
      : await stageFile({ path: args.item.path, cwd: workspaceCwd });

    if (!result.ok) {
      setSourceError(result.stderr || "git stage toggle failed");
    }
    await loadScmStatus();
    setIsScmBusy(false);
  }

  async function handleSelectDiff(args: { path: string }) {
    const getDiff = window.api?.sourceControl?.getDiff;
    setSelectedDiffPath(args.path);
    if (!getDiff) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    const result = await getDiff({ path: args.path, cwd: workspaceCwd });
    setSelectedDiffContent(result.content);
    const parsed = parseUnifiedDiff({ patch: result.content });
    openDiffInEditor({
      editorTabId: `scm-diff:${args.path}`,
      filePath: args.path,
      oldContent: parsed.oldContent,
      newContent: parsed.newContent,
    });
    setLayout({ patch: { editorVisible: true } });
    if (!result.ok && result.stderr) {
      setSourceError(result.stderr);
    }
  }

  async function runExplorerCommand(args: { command: string; fallbackError: string }) {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      setExplorerError("Terminal bridge unavailable.");
      return false;
    }
    if (!workspaceCwd) {
      setExplorerError("Workspace path unavailable.");
      return false;
    }
    const result = await runCommand({ cwd: workspaceCwd, command: args.command });
    if (!result.ok) {
      setExplorerError(result.stderr || args.fallbackError);
      return false;
    }
    setExplorerError("");
    return true;
  }

  async function handleAddFolder() {
    const nextPath = window.prompt("New folder path (relative to project root)");
    if (nextPath === null) {
      return;
    }
    const folderPath = normalizeRelativeInputPath({ value: nextPath });
    if (!folderPath) {
      setExplorerError("Enter a valid relative folder path.");
      return;
    }
    const ok = await runExplorerCommand({
      command: `mkdir -p ${JSON.stringify(folderPath)}`,
      fallbackError: "Failed to create folder.",
    });
    if (!ok) {
      return;
    }
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const folder of collectAncestorFolders({ path: folderPath })) {
        next.add(folder);
      }
      return next;
    });
    await refreshProjectFiles();
  }

  async function handleAddFile() {
    const nextPath = window.prompt("New file path (relative to project root)");
    if (nextPath === null) {
      return;
    }
    const filePath = normalizeRelativeInputPath({ value: nextPath });
    if (!filePath) {
      setExplorerError("Enter a valid relative file path.");
      return;
    }
    const segments = filePath.split("/");
    const parentPath = segments.slice(0, -1).join("/");
    const command = parentPath
      ? `mkdir -p ${JSON.stringify(parentPath)} && touch ${JSON.stringify(filePath)}`
      : `touch ${JSON.stringify(filePath)}`;
    const ok = await runExplorerCommand({
      command,
      fallbackError: "Failed to create file.",
    });
    if (!ok) {
      return;
    }
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const folder of collectAncestorFolders({ path: parentPath })) {
        next.add(folder);
      }
      return next;
    });
    await refreshProjectFiles();
    await openFileFromTree({ filePath });
    setLayout({ patch: { editorVisible: true } });
  }

  return (
    <aside
      data-testid="editor-panel"
      className="h-full w-full overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col rounded-lg shadow-sm border border-border/80 bg-card">
        <div className="flex h-10 items-center justify-between border-b border-border/80 px-3">
          <TooltipProvider>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 rounded-sm p-0 text-muted-foreground", rightTab === "explorer" && "bg-secondary/80 text-foreground")}
                    onClick={() => setRightTab("explorer")}
                  >
                    <FolderTree className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Explorer</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 rounded-sm p-0 text-muted-foreground", rightTab === "changes" && "bg-secondary/80 text-foreground")}
                    onClick={() => setRightTab("changes")}
                  >
                    <GitBranch className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Changes</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 rounded-sm p-0 text-muted-foreground">
                    <Search className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Search</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    onClick={() => {
                      if (rightTab === "changes") {
                        void loadScmStatus();
                      } else {
                        void refreshProjectFiles();
                      }
                    }}
                  >
                    <RefreshCcw className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                    onClick={() => setLayout({ patch: { sidebarOverlayVisible: false } })}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close panel</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {rightTab === "changes" ? (
          <div className="border-b border-border/80 p-2">
            <Input
              className="h-8 rounded-sm border-border/80 bg-background px-2 text-sm"
              placeholder={`Message (Ctrl Enter to commit on "${sourceBranch}")`}
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
            <Button size="sm" className="mt-2 h-8 w-full rounded-sm text-sm" disabled={isScmBusy} onClick={() => void handleStageAll()}>
              + Stage All
            </Button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {rightTab === "explorer" ? (
            <>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-sm text-muted-foreground">{explorerProjectName}</p>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                          onClick={() => void handleAddFile()}
                        >
                          <FilePlus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Add file</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                          onClick={() => void handleAddFolder()}
                        >
                          <FolderPlus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Add folder</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                          onClick={() => setExpandedFolders(new Set())}
                        >
                          <ChevronsUp className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Collapse all</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                          onClick={() => setExpandedFolders(new Set(explorerIndex.folderPaths))}
                        >
                          <ChevronsDown className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Expand all</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              {explorerError ? <p className="mb-1 text-sm text-destructive">{explorerError}</p> : null}
              <div className="space-y-1">
                {explorerTree.length === 0 ? <p className="text-sm text-muted-foreground">No files found.</p> : null}
                {explorerTree.map((node) => (
                  <ExplorerTreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    expanded={expandedFolders}
                    onToggle={(path) => {
                      setExpandedFolders((prev) => {
                        const next = new Set(prev);
                        if (next.has(path)) {
                          next.delete(path);
                        } else {
                          next.add(path);
                        }
                        return next;
                      });
                    }}
                    onOpenFile={(filePath) => {
                      void openFileFromTree({ filePath });
                      setLayout({ patch: { editorVisible: true } });
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm text-muted-foreground">Branch: {sourceBranch} | Changes ({filteredScmItems.length})</p>
              {hasConflicts ? <p className="mb-1 text-sm text-warning-foreground">Conflict detected.</p> : null}
              {sourceError ? <p className="mb-1 text-sm text-destructive">{sourceError}</p> : null}
              {!sourceError && filteredScmItems.length === 0 ? <p className="text-sm text-muted-foreground">No local changes.</p> : null}
              <div className="space-y-1">
                {filteredScmItems.map((item) => (
                  <div key={`${item.code}:${item.path}`} className="rounded-sm border border-border/80 bg-muted/40 px-2 py-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => void handleSelectDiff({ path: item.path })}>
                        {item.path}
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-success-foreground">{item.code}</span>
                        <button
                          type="button"
                          className="rounded-sm border border-border/80 px-1 py-0.5 text-sm hover:bg-secondary/60"
                          disabled={isScmBusy}
                          onClick={() => void handleStageToggle({ item })}
                        >
                          {(item.code[0] && item.code[0] !== "?" && item.code[0] !== " ") ? "unstage" : "stage"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 rounded-sm border border-border/80 bg-card p-2">
                <p className="mb-1 text-sm text-muted-foreground">Diff Preview {selectedDiffPath ? `(${selectedDiffPath})` : ""}</p>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-sm border border-border/70 bg-background p-2 text-xs text-foreground">
                  {selectedDiffContent || "Select a changed file to preview diff."}
                </pre>
              </div>
            </>
          )}
        </div>

        {rightTab === "changes" ? (
          <div className="border-t border-border/80 p-2">
            <div className="mb-2 flex items-center gap-2">
              <Button size="sm" className="h-8 rounded-sm px-2 text-sm" disabled={isScmBusy} onClick={() => void handleCommit()}>
                Commit
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Commit History ({sourceHistory.length})</p>
            <div className="mt-1 max-h-24 space-y-1 overflow-auto">
              {sourceHistory.length === 0 ? <p className="text-sm text-muted-foreground">Initial commit</p> : null}
              {sourceHistory.map((item) => (
                <div key={`${item.hash}:${item.subject}`} className="rounded-sm border border-border/80 bg-muted/40 px-2 py-1">
                  <p className="truncate text-sm font-medium">{item.subject}</p>
                  <p className="text-sm text-muted-foreground">{item.hash} · {item.relativeDate}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
