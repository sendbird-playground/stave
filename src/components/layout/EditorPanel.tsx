import {
  Code2,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GitBranch,
  Info,
  LoaderCircle,
  RefreshCcw,
  SquareTerminal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import { Badge, Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, toast } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { copyTextToClipboard } from "@/lib/clipboard";
import { workspaceFsAdapter } from "@/lib/fs";
import type { WorkspaceCreateEntryResult, WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { parseUnifiedDiffToBuffers } from "@/lib/source-control-diff";
import { hasSourceControlStagedChanges, type SourceControlStatusItem } from "@/lib/source-control-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { ExplorerEntryIcon } from "./explorer-entry-icon";
import { WorkspaceInformationPanel } from "./WorkspaceInformationPanel";
import {
  buildSourceControlSections,
  buildSourceControlSummary,
  getExplorerExpandedPathsAfterCreate,
  normalizeRelativeInputPath,
  type SourceControlItemViewModel,
} from "./editor-panel.utils";

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

type PendingExplorerCreate =
  | { type: "file"; placeholder: string }
  | { type: "folder"; placeholder: string };

function getParentDirectoryPath(args: { path: string }) {
  return args.path.split("/").slice(0, -1).join("/");
}

function resolveWorkspaceAbsolutePath(args: { workspacePath?: string; relativePath: string }) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return null;
  }

  const normalizedWorkspacePath = workspacePath.replace(/[\\/]+$/, "") || workspacePath;
  const normalizedRelativePath = args.relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");

  if (!normalizedRelativePath) {
    return normalizedWorkspacePath;
  }

  const separator = normalizedWorkspacePath.includes("\\") ? "\\" : "/";
  const joinedRelativePath = normalizedRelativePath.split("/").filter(Boolean).join(separator);
  return `${normalizedWorkspacePath}${separator}${joinedRelativePath}`;
}

function ExplorerTreeRow(args: {
  entry: WorkspaceDirectoryEntry;
  depth: number;
  expanded: Set<string>;
  directoryStateByPath: Record<string, ExplorerDirectoryState>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onStartCreateFile: (directoryPath: string) => void;
  onStartCreateFolder: (directoryPath: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCopyAbsolutePath: (path: string) => void;
  onOpenInFinder: (path: string) => void;
  onOpenInVSCode: (path: string) => void;
  onOpenInTerminal: (path: string) => void;
  onRefreshDirectory: (path: string) => void;
}) {
  const {
    entry,
    depth,
    expanded,
    directoryStateByPath,
    onToggle,
    onOpenFile,
    onStartCreateFile,
    onStartCreateFolder,
    onCopyRelativePath,
    onCopyAbsolutePath,
    onOpenInFinder,
    onOpenInVSCode,
    onOpenInTerminal,
    onRefreshDirectory,
  } = args;
  const isFolder = entry.type === "folder";
  const isOpen = isFolder && expanded.has(entry.path);
  const directoryState = isFolder ? directoryStateByPath[entry.path] : undefined;
  const childEntries = directoryState?.entries ?? [];
  const parentDirectoryPath = isFolder ? entry.path : getParentDirectoryPath({ path: entry.path });
  const terminalTargetPath = isFolder ? entry.path : parentDirectoryPath;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {isFolder ? (
            <ContextMenuItem onSelect={() => onToggle(entry.path)}>
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {isOpen ? "Collapse folder" : "Expand folder"}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => onOpenFile(entry.path)}>
              <File className="size-4" />
              Open file
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => onStartCreateFile(parentDirectoryPath)}>
            <FilePlus className="size-4" />
            New file here
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onStartCreateFolder(parentDirectoryPath)}>
            <FolderPlus className="size-4" />
            New folder here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onCopyRelativePath(entry.path)}>
            <Copy className="size-4" />
            Copy relative path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopyAbsolutePath(entry.path)}>
            <Copy className="size-4" />
            Copy absolute path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenInFinder(entry.path)}>
            <FolderOpen className="size-4" />
            Open in Finder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenInVSCode(entry.path)}>
            <Code2 className="size-4" />
            Open in VS Code
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenInTerminal(terminalTargetPath)}>
            <SquareTerminal className="size-4" />
            Open in Terminal
          </ContextMenuItem>
          {isFolder ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onRefreshDirectory(entry.path)}>
                <RefreshCcw className="size-4" />
                Refresh folder
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
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
              onStartCreateFile={onStartCreateFile}
              onStartCreateFolder={onStartCreateFolder}
              onCopyRelativePath={onCopyRelativePath}
              onCopyAbsolutePath={onCopyAbsolutePath}
              onOpenInFinder={onOpenInFinder}
              onOpenInVSCode={onOpenInVSCode}
              onOpenInTerminal={onOpenInTerminal}
              onRefreshDirectory={onRefreshDirectory}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function SourceControlActionButton(args: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: "destructive" | "ghost" | "outline" | "secondary";
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={args.variant ?? "ghost"}
      className="h-6 rounded-md px-2 text-[11px]"
      disabled={args.disabled}
      onClick={args.onClick}
    >
      {args.label}
    </Button>
  );
}

function SourceControlRow(args: {
  isScmBusy: boolean;
  item: SourceControlItemViewModel;
  onDiscard: (item: SourceControlStatusItem) => void;
  onOpenDiff: (path: string) => void;
  onStage: (item: SourceControlStatusItem) => void;
  onUnstage: (item: SourceControlStatusItem) => void;
}) {
  const codeBadgeVariant = args.item.isConflict
    ? "destructive"
    : args.item.hasMixedChanges || args.item.hasUnstagedChanges
      ? "warning"
      : args.item.hasStagedChanges
        ? "success"
        : "outline";

  return (
    <div className="group rounded-xl border border-border/70 bg-background/80 px-3 py-2 shadow-xs transition-colors hover:border-border hover:bg-muted/20">
      <button
        type="button"
        className="flex min-w-0 w-full items-start gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => args.onOpenDiff(args.item.item.path)}
      >
        <Badge
          variant={codeBadgeVariant}
          className="mt-0.5 min-w-8 justify-center rounded-md px-1.5 font-mono text-[11px]"
        >
          {args.item.displayCode}
        </Badge>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{args.item.fileName}</span>
            {args.item.hasMixedChanges ? (
              <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                partial
              </Badge>
            ) : null}
            {args.item.isUntracked ? (
              <Badge variant="outline" className="rounded-md px-1.5 text-[10px]">
                new
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {args.item.pathDetail}
          </p>
        </div>
      </button>

      <div className="mt-0 flex max-h-0 items-center justify-between gap-2 overflow-hidden opacity-0 transition-all duration-150 group-hover:mt-2 group-hover:max-h-8 group-hover:opacity-100 group-focus-within:mt-2 group-focus-within:max-h-8 group-focus-within:opacity-100">
        <p className="truncate text-[11px] text-muted-foreground">
          {args.item.pathLabel}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <SourceControlActionButton
            label="Open"
            disabled={args.isScmBusy}
            onClick={() => args.onOpenDiff(args.item.item.path)}
            variant="outline"
          />
          {args.item.canStage ? (
            <SourceControlActionButton
              label="Stage"
              disabled={args.isScmBusy}
              onClick={() => args.onStage(args.item.item)}
              variant="secondary"
            />
          ) : null}
          {args.item.canUnstage ? (
            <SourceControlActionButton
              label="Unstage"
              disabled={args.isScmBusy}
              onClick={() => args.onUnstage(args.item.item)}
              variant="ghost"
            />
          ) : null}
          {args.item.canDiscard ? (
            <SourceControlActionButton
              label="Discard"
              disabled={args.isScmBusy}
              onClick={() => args.onDiscard(args.item.item)}
              variant="destructive"
            />
          ) : null}
        </div>
      </div>
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
  const [pendingExplorerCreate, setPendingExplorerCreate] = useState<PendingExplorerCreate | null>(null);
  const [pendingExplorerCreatePath, setPendingExplorerCreatePath] = useState("");
  const [isCreatingExplorerEntry, setIsCreatingExplorerEntry] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  const [sourceBranch, setSourceBranch] = useState("unknown");
  const [sourceItems, setSourceItems] = useState<SourceControlStatusItem[]>([]);
  const [sourceHistory, setSourceHistory] = useState<SourceControlHistoryItem[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [hasConflicts, setHasConflicts] = useState(false);
  const [isScmBusy, setIsScmBusy] = useState(false);
  const explorerDirectoryStateRef = useRef<Record<string, ExplorerDirectoryState>>({});
  const explorerRequestTokenRef = useRef(0);
  const selectedDiffRequestIdRef = useRef(0);
  const pendingExplorerCreateInputRef = useRef<HTMLInputElement | null>(null);

  const explorerRootState = explorerDirectoryStateByPath[""];
  const explorerTree = explorerRootState?.entries ?? [];
  const isExplorerLoading = explorerRootState?.status === "loading";
  const filteredScmItems = sourceItems;
  const sourceControlSections = useMemo(
    () => buildSourceControlSections({ items: filteredScmItems }),
    [filteredScmItems],
  );
  const sourceControlSummary = useMemo(
    () => buildSourceControlSummary({ items: filteredScmItems }),
    [filteredScmItems],
  );
  const canCommitStagedChanges = sourceControlSummary.committableCount > 0 && !hasConflicts;
  const canUnstageAnyChanges = sourceControlSummary.stagedCount > 0;
  const sourceControlHint = hasConflicts
    ? "Resolve or discard conflicted files before treating the tree as clean."
    : canCommitStagedChanges && sourceControlSummary.workingTreeCount > 0
      ? "Commit will include staged changes only. Working-tree edits remain local."
      : canCommitStagedChanges
        ? "Staged changes are ready to commit."
        : filteredScmItems.length > 0
          ? "Stage files to prepare the next commit."
          : "Working tree is clean.";
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
    setPendingExplorerCreate(null);
    setPendingExplorerCreatePath("");
    setIsCreatingExplorerEntry(false);
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

  useEffect(() => {
    if (!pendingExplorerCreate) {
      return;
    }

    const timer = window.setTimeout(() => {
      const input = pendingExplorerCreateInputRef.current;
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pendingExplorerCreate]);

  async function loadScmStatus(args?: { skipBusyState?: boolean }) {
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      setSourceError("Source Control bridge unavailable. Use bun run dev:all or bun run dev:desktop.");
      return;
    }

    const getHistory = window.api?.sourceControl?.getHistory;
    if (!args?.skipBusyState) {
      setIsScmBusy(true);
    }

    try {
      const [statusResult, historyResult] = await Promise.all([
        getStatus({ cwd: workspaceCwd }),
        getHistory ? getHistory({ cwd: workspaceCwd, limit: 15 }) : Promise.resolve(null),
      ]);

      setSourceBranch(statusResult.branch);
      setSourceItems(statusResult.items);
      setHasConflicts(statusResult.hasConflicts);
      setSourceError(statusResult.ok ? "" : statusResult.stderr || "git status failed");

      if (historyResult?.ok) {
        setSourceHistory(historyResult.items);
      }
    } finally {
      if (!args?.skipBusyState) {
        setIsScmBusy(false);
      }
    }
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
    try {
      const result = await stageAll({ cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git add failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleUnstageAll() {
    const unstageAll = window.api?.sourceControl?.unstageAll;
    if (!unstageAll) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await unstageAll({ cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git restore --staged failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleCommit() {
    const commit = window.api?.sourceControl?.commit;
    if (!commit) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }
    if (hasConflicts) {
      setSourceError("Resolve or discard conflicted files before committing.");
      return;
    }
    if (!canCommitStagedChanges) {
      setSourceError("Stage at least one change before committing.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await commit({ message: commitMessage, cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git commit failed");
      } else {
        setCommitMessage("");
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleStageAction(args: {
    action: "stage" | "toggle" | "unstage";
    item: SourceControlStatusItem;
  }) {
    const isStaged = hasSourceControlStagedChanges({ item: args.item });
    const stageFile = window.api?.sourceControl?.stageFile;
    const unstageFile = window.api?.sourceControl?.unstageFile;
    if (!stageFile || !unstageFile) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const nextAction = args.action === "toggle"
        ? (isStaged ? "unstage" : "stage")
        : args.action;
      const result = nextAction === "unstage"
        ? await unstageFile({ path: args.item.path, cwd: workspaceCwd })
        : await stageFile({ path: args.item.path, cwd: workspaceCwd });

      if (!result.ok) {
        setSourceError(result.stderr || "git stage toggle failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
  }

  async function handleDiscardChange(args: { item: SourceControlStatusItem }) {
    const discardFile = window.api?.sourceControl?.discardFile;
    if (!discardFile) {
      setSourceError("Source Control bridge unavailable.");
      return;
    }

    setIsScmBusy(true);
    try {
      const result = await discardFile({ path: args.item.path, cwd: workspaceCwd });
      if (!result.ok) {
        setSourceError(result.stderr || "git discard failed");
      } else {
        setSourceError("");
      }
      await loadScmStatus({ skipBusyState: true });
    } finally {
      setIsScmBusy(false);
    }
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

  async function handleCopyExplorerPath(args: { path: string; mode: "relative" | "absolute" }) {
    const pathToCopy = args.mode === "absolute"
      ? resolveWorkspaceAbsolutePath({ workspacePath: workspaceCwd, relativePath: args.path })
      : args.path;
    if (!pathToCopy) {
      toast.error("Workspace path unavailable");
      return;
    }

    try {
      await copyTextToClipboard(pathToCopy);
      toast.success(args.mode === "absolute" ? "Copied absolute path" : "Copied relative path");
    } catch {
      toast.error("Failed to copy path");
    }
  }

  async function handleOpenExplorerPath(args: { path: string; target: "finder" | "vscode" | "terminal" }) {
    const shellApi = window.api?.shell;
    if (!shellApi) {
      toast.error("Shell bridge unavailable");
      return;
    }

    const absolutePath = resolveWorkspaceAbsolutePath({ workspacePath: workspaceCwd, relativePath: args.path });
    if (!absolutePath) {
      toast.error("Workspace path unavailable");
      return;
    }

    const action = args.target === "finder"
      ? shellApi.showInFinder
      : args.target === "vscode"
      ? shellApi.openInVSCode
      : shellApi.openInTerminal;
    if (!action) {
      toast.error("Shell action unavailable");
      return;
    }

    const result = await action({ path: absolutePath });
    if (result.ok) {
      return;
    }

    const actionLabel = args.target === "finder"
      ? "open in Finder"
      : args.target === "vscode"
      ? "open in VS Code"
      : "open in Terminal";
    toast.error(`Failed to ${actionLabel}`, { description: result.stderr });
  }

  function handleRefreshExplorerDirectory(path: string) {
    void loadExplorerDirectory({ directoryPath: path, force: true });
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

  function startExplorerCreate(type: PendingExplorerCreate["type"], directoryPath = "") {
    setExplorerError("");
    const normalizedDirectoryPath = normalizeRelativeInputPath({ value: directoryPath }) ?? "";
    const pathPrefix = normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : "";
    const suggestedLeafPath = type === "file" ? "new-file.tsx" : "new-folder";
    setPendingExplorerCreate({
      type,
      placeholder: `${pathPrefix}${suggestedLeafPath}`,
    });
    setPendingExplorerCreatePath(pathPrefix);
  }

  function handleStartExplorerFileCreate(directoryPath: string) {
    startExplorerCreate("file", directoryPath);
  }

  function handleStartExplorerFolderCreate(directoryPath: string) {
    startExplorerCreate("folder", directoryPath);
  }

  function handleCopyExplorerRelativePath(path: string) {
    void handleCopyExplorerPath({ path, mode: "relative" });
  }

  function handleCopyExplorerAbsolutePath(path: string) {
    void handleCopyExplorerPath({ path, mode: "absolute" });
  }

  function handleOpenExplorerInFinder(path: string) {
    void handleOpenExplorerPath({ path, target: "finder" });
  }

  function handleOpenExplorerInVSCode(path: string) {
    void handleOpenExplorerPath({ path, target: "vscode" });
  }

  function handleOpenExplorerInTerminal(path: string) {
    void handleOpenExplorerPath({ path, target: "terminal" });
  }

  function cancelExplorerCreate() {
    if (isCreatingExplorerEntry) {
      return;
    }

    setPendingExplorerCreate(null);
    setPendingExplorerCreatePath("");
  }

  async function submitExplorerCreate() {
    if (!pendingExplorerCreate || isCreatingExplorerEntry) {
      return;
    }

    const entryPath = normalizeRelativeInputPath({ value: pendingExplorerCreatePath });
    if (!entryPath) {
      setExplorerError(`Enter a valid relative ${pendingExplorerCreate.type} path.`);
      return;
    }

    setIsCreatingExplorerEntry(true);
    try {
      const result = await runExplorerCreateOperation({
        execute: () => (
          pendingExplorerCreate.type === "file"
            ? workspaceFsAdapter.createFile({ filePath: entryPath })
            : workspaceFsAdapter.createDirectory({ directoryPath: entryPath })
        ),
        fallbackError: pendingExplorerCreate.type === "file"
          ? "Failed to create file."
          : "Failed to create folder.",
      });
      if (!result) {
        return;
      }

      const nextExpandedFolders = new Set(expandedFolders);
      for (const folder of getExplorerExpandedPathsAfterCreate({
        path: entryPath,
        type: pendingExplorerCreate.type,
      })) {
        nextExpandedFolders.add(folder);
      }

      setPendingExplorerCreate(null);
      setPendingExplorerCreatePath("");

      await Promise.all([
        refreshProjectFiles(),
        reloadExplorer({ expandedPaths: nextExpandedFolders }),
      ]);

      if (pendingExplorerCreate.type === "file") {
        handleOpenExplorerFile(entryPath);
      }
    } finally {
      setIsCreatingExplorerEntry(false);
    }
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
                    title="explorer"
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
                    title="changes"
                  >
                    <GitBranch className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Changes</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 rounded-sm p-0 text-muted-foreground", rightTab === "information" && "bg-secondary/80 text-foreground")}
                    onClick={() => setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "information" } })}
                    title="information"
                  >
                    <Info className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Information</TooltipContent>
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
                      } else if (rightTab === "information") {
                        if (activeWorkspaceId) {
                          void useAppStore.getState().fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
                        }
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
            <div className="space-y-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="h-6 max-w-full justify-start gap-1 rounded-md border-border/70 bg-background/80 px-2 font-normal">
                        <GitBranch className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{sourceBranch}</span>
                      </Badge>
                      <Badge variant={filteredScmItems.length > 0 ? "secondary" : "outline"} className="h-6 rounded-md px-2 font-normal">
                        Changes {filteredScmItems.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sourceControlSummary.stagedCount > 0 ? (
                        <Badge variant="success" className="rounded-md px-2 font-normal">
                          Staged {sourceControlSummary.stagedCount}
                        </Badge>
                      ) : null}
                      {sourceControlSummary.unstagedCount > 0 ? (
                        <Badge variant="warning" className="rounded-md px-2 font-normal">
                          Working Tree {sourceControlSummary.unstagedCount}
                        </Badge>
                      ) : null}
                      {sourceControlSummary.untrackedCount > 0 ? (
                        <Badge variant="outline" className="rounded-md px-2 font-normal">
                          Untracked {sourceControlSummary.untrackedCount}
                        </Badge>
                      ) : null}
                      {sourceControlSummary.conflictCount > 0 ? (
                        <Badge variant="destructive" className="rounded-md px-2 font-normal">
                          Conflicts {sourceControlSummary.conflictCount}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{sourceControlHint}</p>
                  </div>
                  {isScmBusy ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Commit Staged Changes
                </p>
                <Input
                  className="mt-2 h-9 rounded-md border-border/70 bg-background px-2 text-sm"
                  placeholder={`Message for "${sourceBranch}"`}
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && commitMessage.trim() && canCommitStagedChanges && !isScmBusy) {
                      event.preventDefault();
                      void handleCommit();
                    }
                  }}
                  disabled={isScmBusy}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8 min-w-[112px] flex-1 rounded-md text-sm"
                    disabled={isScmBusy || !commitMessage.trim() || !canCommitStagedChanges}
                    onClick={() => void handleCommit()}
                  >
                    Commit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-md text-sm"
                    disabled={isScmBusy || filteredScmItems.length === 0}
                    onClick={() => void handleStageAll()}
                  >
                    Stage All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-md text-sm"
                    disabled={isScmBusy || !canUnstageAnyChanges}
                    onClick={() => void handleUnstageAll()}
                  >
                    Unstage All
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {rightTab === "information" ? (
            <WorkspaceInformationPanel />
          ) : rightTab === "explorer" ? (
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
                          onClick={() => startExplorerCreate("file")}
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
                          onClick={() => startExplorerCreate("folder")}
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
                {pendingExplorerCreate ? (
                  <form
                    className="rounded-sm border border-border/80 bg-muted/40 px-2 py-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitExplorerCreate();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {pendingExplorerCreate.type === "file" ? (
                        <FilePlus className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <Input
                        ref={pendingExplorerCreateInputRef}
                        value={pendingExplorerCreatePath}
                        onChange={(event) => setPendingExplorerCreatePath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelExplorerCreate();
                          }
                        }}
                        className="h-8 rounded-sm border-border/80 bg-background px-2 text-sm"
                        placeholder={pendingExplorerCreate.placeholder}
                        aria-label={pendingExplorerCreate.type === "file" ? "New file path" : "New folder path"}
                        disabled={isCreatingExplorerEntry}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="h-8 rounded-sm"
                        disabled={isCreatingExplorerEntry}
                      >
                        {isCreatingExplorerEntry ? "Creating..." : "Create"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-sm px-2 text-muted-foreground"
                        onClick={cancelExplorerCreate}
                        disabled={isCreatingExplorerEntry}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter a path relative to the project root. Press Enter to create or Esc to cancel.
                    </p>
                  </form>
                ) : null}
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
                    onStartCreateFile={handleStartExplorerFileCreate}
                    onStartCreateFolder={handleStartExplorerFolderCreate}
                    onCopyRelativePath={handleCopyExplorerRelativePath}
                    onCopyAbsolutePath={handleCopyExplorerAbsolutePath}
                    onOpenInFinder={handleOpenExplorerInFinder}
                    onOpenInVSCode={handleOpenExplorerInVSCode}
                    onOpenInTerminal={handleOpenExplorerInTerminal}
                    onRefreshDirectory={handleRefreshExplorerDirectory}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Branch: {sourceBranch} | Changes ({filteredScmItems.length})</p>
                {hasConflicts ? (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning dark:bg-warning/15">
                    Conflict detected. Resolve, stage, or discard the affected files before committing.
                  </div>
                ) : null}
                {sourceError ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {sourceError}
                  </div>
                ) : null}
                {!sourceError && filteredScmItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-4">
                    <p className="text-sm font-medium">No local changes.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This workspace matches the checked-out branch.
                    </p>
                  </div>
                ) : null}
                {sourceControlSections.map((section) => (
                  <section key={section.id} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {section.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                      <Badge variant={section.badgeVariant} className="mt-0.5 rounded-md px-2 font-normal">
                        {section.items.length}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {section.items.map((item) => (
                        <SourceControlRow
                          key={`${item.displayCode}:${item.pathLabel}`}
                          item={item}
                          isScmBusy={isScmBusy}
                          onOpenDiff={(path) => void handleSelectDiff({ path })}
                          onStage={(sourceItem) => void handleStageAction({ action: "stage", item: sourceItem })}
                          onUnstage={(sourceItem) => void handleStageAction({ action: "unstage", item: sourceItem })}
                          onDiscard={(sourceItem) => void handleDiscardChange({ item: sourceItem })}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>

        {rightTab === "changes" ? (
          <div className="border-t border-border/80 p-2">
            <p className="text-sm text-muted-foreground">Commit History ({sourceHistory.length})</p>
            <div className="mt-2 max-h-32 space-y-1.5 overflow-auto">
              {sourceHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
                  <p className="text-sm text-muted-foreground">Initial commit</p>
                </div>
              ) : null}
              {sourceHistory.map((item) => (
                <div key={`${item.hash}:${item.subject}`} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                  <p className="truncate text-sm font-medium">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">{item.hash} · {item.relativeDate}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
