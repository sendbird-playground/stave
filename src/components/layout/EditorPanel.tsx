import {
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  FolderTree,
  GitBranch,
  LoaderCircle,
  RefreshCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import { Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { workspaceFsAdapter } from "@/lib/fs";
import type { WorkspaceCreateEntryResult, WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { parseUnifiedDiffToBuffers } from "@/lib/source-control-diff";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { ExplorerEntryIcon } from "./explorer-entry-icon";
import { collectAncestorFolders, normalizeRelativeInputPath } from "./editor-panel.utils";

interface SourceControlItem {
  code: string;
  path: string;
}

interface SourceControlHistoryItem {
  hash: string;
  relativeDate: string;
  subject: string;
}

interface ExplorerDirectoryState {
  entries: WorkspaceDirectoryEntry[];
  status: "loading" | "ready" | "error";
  error?: string;
}

function ExplorerTreeRow(args: {
  entry: WorkspaceDirectoryEntry;
  depth: number;
  expanded: Set<string>;
  directoryStateByPath: Record<string, ExplorerDirectoryState>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const { entry, depth, expanded, directoryStateByPath, onToggle, onOpenFile } = args;
  const isFolder = entry.type === "folder";
  const isOpen = isFolder && expanded.has(entry.path);
  const directoryState = isFolder ? directoryStateByPath[entry.path] : undefined;
  const childEntries = directoryState?.entries ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => (isFolder ? onToggle(entry.path) : onOpenFile(entry.path))}
        className="flex min-w-0 w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-secondary/60"
        style={{ paddingLeft: `${6 + depth * 14}px` }}
      >
        {isFolder ? (
          isOpen
            ? <ChevronDown className="size-3.5 text-muted-foreground" />
            : <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <ExplorerEntryIcon entry={entry} isOpen={isOpen} />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {isFolder && directoryState?.status === "loading" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
      </button>
      {isFolder && isOpen ? (
        <>
          {directoryState?.status === "error" ? (
            <p
              className="py-1 text-sm text-destructive"
              style={{ paddingLeft: `${24 + depth * 14}px` }}
            >
              {directoryState.error ?? "Failed to load folder."}
            </p>
          ) : null}
          {directoryState?.status === "ready" && childEntries.length === 0 ? (
            <p
              className="py-1 text-sm text-muted-foreground"
              style={{ paddingLeft: `${24 + depth * 14}px` }}
            >
              Empty
            </p>
          ) : null}
          {childEntries.map((child) => (
            <ExplorerTreeRow
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              directoryStateByPath={directoryStateByPath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function EditorPanel() {
  const [
    activeWorkspaceId,
    hasHydratedWorkspaces,
    projectName,
    sidebarOverlayVisible,
    sidebarOverlayTab,
    workspaceCwd,
    openFileFromTree,
    openDiffInEditor,
    setLayout,
    refreshProjectFiles,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.hasHydratedWorkspaces,
    state.projectName,
    state.layout.sidebarOverlayVisible,
    state.layout.sidebarOverlayTab,
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined,
    state.openFileFromTree,
    state.openDiffInEditor,
    state.setLayout,
    state.refreshProjectFiles,
  ] as const));

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [explorerDirectoryStateByPath, setExplorerDirectoryStateByPath] = useState<Record<string, ExplorerDirectoryState>>({});
  const [explorerError, setExplorerError] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  const [sourceBranch, setSourceBranch] = useState("unknown");
  const [sourceItems, setSourceItems] = useState<SourceControlItem[]>([]);
  const [sourceHistory, setSourceHistory] = useState<SourceControlHistoryItem[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [hasConflicts, setHasConflicts] = useState(false);
  const [isScmBusy, setIsScmBusy] = useState(false);
  const explorerDirectoryStateRef = useRef<Record<string, ExplorerDirectoryState>>({});
  const explorerRequestTokenRef = useRef(0);
  const selectedDiffRequestIdRef = useRef(0);

  const explorerRootState = explorerDirectoryStateByPath[""];
  const explorerTree = explorerRootState?.entries ?? [];
  const isExplorerLoading = explorerRootState?.status === "loading";
  const filteredScmItems = sourceItems;
  const explorerProjectName = projectName?.trim() || "Project";
  const rightTab = sidebarOverlayTab;

  function updateExplorerDirectoryState(
    updater: Record<string, ExplorerDirectoryState> | ((current: Record<string, ExplorerDirectoryState>) => Record<string, ExplorerDirectoryState>),
  ) {
    setExplorerDirectoryStateByPath((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      explorerDirectoryStateRef.current = next;
      return next;
    });
  }

  async function loadExplorerDirectory(args: { directoryPath: string; force?: boolean }) {
    if (!workspaceCwd) {
      setExplorerError("Workspace path unavailable.");
      return null;
    }

    const cached = explorerDirectoryStateRef.current[args.directoryPath];
    if (!args.force && cached) {
      if (cached.status === "ready" || cached.status === "loading") {
        return cached.entries;
      }
    }

    const requestToken = explorerRequestTokenRef.current;
    updateExplorerDirectoryState((current) => ({
      ...current,
      [args.directoryPath]: {
        entries: cached?.entries ?? [],
        status: "loading",
      },
    }));

    const entries = await workspaceFsAdapter.listDirectory({ directoryPath: args.directoryPath });
    if (explorerRequestTokenRef.current !== requestToken) {
      return null;
    }
    if (!entries) {
      updateExplorerDirectoryState((current) => ({
        ...current,
        [args.directoryPath]: {
          entries: cached?.entries ?? [],
          status: "error",
          error: "Failed to load folder.",
        },
      }));
      if (args.directoryPath === "") {
        setExplorerError("Failed to load explorer contents.");
      }
      return null;
    }

    updateExplorerDirectoryState((current) => ({
      ...current,
      [args.directoryPath]: {
        entries,
        status: "ready",
      },
    }));
    if (args.directoryPath === "") {
      setExplorerError("");
    }
    return entries;
  }

  async function reloadExplorer(args?: { expandedPaths?: Iterable<string> }) {
    const nextExpandedPaths = Array.from(new Set(
      Array.from(args?.expandedPaths ?? expandedFolders).filter((path) => path.length > 0),
    ));
    explorerRequestTokenRef.current += 1;
    explorerDirectoryStateRef.current = {};
    setExplorerDirectoryStateByPath({});
    setExplorerError("");
    setExpandedFolders(new Set(nextExpandedPaths));

    const rootEntries = await loadExplorerDirectory({ directoryPath: "", force: true });
    if (!rootEntries) {
      return;
    }

    for (const directoryPath of nextExpandedPaths) {
      await loadExplorerDirectory({ directoryPath, force: true });
    }
  }

  useEffect(() => {
    explorerRequestTokenRef.current += 1;
    explorerDirectoryStateRef.current = {};
    setExplorerDirectoryStateByPath({});
    setExpandedFolders(new Set());
    setExplorerError("");
  }, [activeWorkspaceId, workspaceCwd]);

  useEffect(() => {
    if (!hasHydratedWorkspaces || !workspaceCwd || !sidebarOverlayVisible || rightTab !== "explorer") {
      return;
    }
    if (explorerDirectoryStateRef.current[""]) {
      return;
    }
    void loadExplorerDirectory({ directoryPath: "" });
  }, [activeWorkspaceId, hasHydratedWorkspaces, rightTab, sidebarOverlayVisible, workspaceCwd]);

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
  }, [rightTab, sidebarOverlayVisible, workspaceCwd]);

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
    const requestId = selectedDiffRequestIdRef.current + 1;
    selectedDiffRequestIdRef.current = requestId;
    if (!getDiff) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    const result = await getDiff({ path: args.path, cwd: workspaceCwd });
    if (selectedDiffRequestIdRef.current !== requestId) {
      return;
    }
    const parsed = result.oldContent != null && result.newContent != null
      ? {
          oldContent: result.oldContent,
          newContent: result.newContent,
        }
      : parseUnifiedDiffToBuffers({ patch: result.content });
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

  function handleOpenExplorerFile(filePath: string) {
    void openFileFromTree({ filePath });
    setLayout({ patch: { editorVisible: true } });
  }

  function handleToggleExplorerFolder(path: string) {
    const isOpen = expandedFolders.has(path);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    if (!isOpen) {
      void loadExplorerDirectory({ directoryPath: path });
    }
  }

  async function handleExpandAllFolders() {
    if (!workspaceCwd) {
      setExplorerError("Workspace path unavailable.");
      return;
    }

    const nextExpandedFolders = new Set<string>();

    async function walk(directoryPath: string) {
      const entries = await loadExplorerDirectory({ directoryPath });
      if (!entries) {
        return;
      }

      for (const entry of entries) {
        if (entry.type !== "folder") {
          continue;
        }
        nextExpandedFolders.add(entry.path);
        await walk(entry.path);
      }
    }

    await walk("");
    setExpandedFolders(nextExpandedFolders);
  }

  async function runExplorerCreateOperation(args: {
    execute: () => Promise<WorkspaceCreateEntryResult>;
    fallbackError: string;
  }) {
    let result = await args.execute();

    if (!result.ok && !result.alreadyExists && workspaceCwd) {
      await workspaceFsAdapter.setRoot?.({
        rootPath: workspaceCwd,
        rootName: explorerProjectName,
        files: workspaceFsAdapter.getKnownFiles(),
      });
      result = await args.execute();
    }

    if (!result.ok && !result.alreadyExists) {
      setExplorerError(result.stderr || args.fallbackError);
      return null;
    }

    setExplorerError("");
    return result;
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

    const result = await runExplorerCreateOperation({
      execute: () => workspaceFsAdapter.createDirectory({ directoryPath: folderPath }),
      fallbackError: "Failed to create folder.",
    });
    if (!result) {
      return;
    }

    const nextExpandedFolders = new Set(expandedFolders);
    for (const folder of collectAncestorFolders({ path: folderPath })) {
      nextExpandedFolders.add(folder);
    }

    await Promise.all([
      refreshProjectFiles(),
      reloadExplorer({ expandedPaths: nextExpandedFolders }),
    ]);
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

    const result = await runExplorerCreateOperation({
      execute: () => workspaceFsAdapter.createFile({ filePath }),
      fallbackError: "Failed to create file.",
    });
    if (!result) {
      return;
    }

    const nextExpandedFolders = new Set(expandedFolders);
    for (const folder of collectAncestorFolders({ path: parentPath })) {
      nextExpandedFolders.add(folder);
    }

    await Promise.all([
      refreshProjectFiles(),
      reloadExplorer({ expandedPaths: nextExpandedFolders }),
    ]);
    handleOpenExplorerFile(filePath);
  }

  return (
    <aside
      data-testid="editor-panel"
      className="h-full min-w-0 w-full overflow-hidden"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
        <div className={cn("flex items-center justify-between border-b border-border/80 px-3", PANEL_BAR_HEIGHT_CLASS)}>
          <TooltipProvider>
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 rounded-sm p-0 text-muted-foreground", rightTab === "explorer" && "bg-secondary/80 text-foreground")}
                    onClick={() => setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "explorer" } })}
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
                    onClick={() => setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "changes" } })}
                  >
                    <GitBranch className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Changes</TooltipContent>
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
                        void Promise.all([
                          refreshProjectFiles(),
                          reloadExplorer({ expandedPaths: expandedFolders }),
                        ]);
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
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" className="h-8 flex-1 rounded-sm text-sm" disabled={isScmBusy} onClick={() => void handleCommit()}>
                Commit
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-sm text-sm" disabled={isScmBusy} onClick={() => void handleStageAll()}>
                + Stage All
              </Button>
            </div>
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
                          onClick={() => void handleExpandAllFolders()}
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
                {isExplorerLoading && explorerTree.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading files...
                  </p>
                ) : null}
                {!explorerError && !isExplorerLoading && explorerTree.length === 0 ? <p className="text-sm text-muted-foreground">No files found.</p> : null}
                {explorerTree.map((entry) => (
                  <ExplorerTreeRow
                    key={entry.path}
                    entry={entry}
                    depth={0}
                    expanded={expandedFolders}
                    directoryStateByPath={explorerDirectoryStateByPath}
                    onToggle={handleToggleExplorerFolder}
                    onOpenFile={handleOpenExplorerFile}
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
            </>
          )}
        </div>

        {rightTab === "changes" ? (
          <div className="border-t border-border/80 p-2">
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
