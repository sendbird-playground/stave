import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Code2,
  Copy,
  File,
  FilePlus,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  RefreshCcw,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import type { RefObject } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { WorkspaceDirectoryEntry } from "@/lib/fs/fs.types";
import { ExplorerEntryIcon } from "./explorer-entry-icon";

interface ExplorerDirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  entries: WorkspaceDirectoryEntry[];
  error?: string;
}

interface PendingExplorerCreate {
  type: "file" | "folder";
  placeholder: string;
}

function getParentDirectoryPath(args: { path: string }) {
  return args.path.split("/").slice(0, -1).join("/");
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
  onRequestDeleteFile: (path: string, name: string) => void;
  onRequestDeleteFolder: (path: string, name: string) => void;
}) {
  const isFolder = args.entry.type === "folder";
  const isOpen = isFolder && args.expanded.has(args.entry.path);
  const directoryState = isFolder ? args.directoryStateByPath[args.entry.path] : undefined;
  const childEntries = directoryState?.entries ?? [];
  const parentDirectoryPath = isFolder ? args.entry.path : getParentDirectoryPath({ path: args.entry.path });
  const terminalTargetPath = isFolder ? args.entry.path : parentDirectoryPath;

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => (isFolder ? args.onToggle(args.entry.path) : args.onOpenFile(args.entry.path))}
            className="flex min-w-0 w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-secondary/60"
            style={{ paddingLeft: `${6 + args.depth * 14}px` }}
          >
            {isFolder ? (
              isOpen
                ? <ChevronDown className="size-3.5 text-muted-foreground" />
                : <ChevronRight className="size-3.5 text-muted-foreground" />
            ) : (
              <span className="inline-block w-3.5" />
            )}
            <ExplorerEntryIcon entry={args.entry} isOpen={isOpen} />
            <span className="min-w-0 flex-1 truncate">{args.entry.name}</span>
            {isFolder && directoryState?.status === "loading" ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {isFolder ? (
            <ContextMenuItem onSelect={() => args.onToggle(args.entry.path)}>
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {isOpen ? "Collapse folder" : "Expand folder"}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => args.onOpenFile(args.entry.path)}>
              <File className="size-4" />
              Open file
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => args.onStartCreateFile(parentDirectoryPath)}>
            <FilePlus className="size-4" />
            New file here
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onStartCreateFolder(parentDirectoryPath)}>
            <FolderPlus className="size-4" />
            New folder here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => args.onCopyRelativePath(args.entry.path)}>
            <Copy className="size-4" />
            Copy relative path
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onCopyAbsolutePath(args.entry.path)}>
            <Copy className="size-4" />
            Copy absolute path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => args.onOpenInFinder(args.entry.path)}>
            <FolderOpen className="size-4" />
            Open in Finder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onOpenInVSCode(args.entry.path)}>
            <Code2 className="size-4" />
            Open in VS Code
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => args.onOpenInTerminal(terminalTargetPath)}>
            <SquareTerminal className="size-4" />
            Open in Terminal
          </ContextMenuItem>
          {isFolder ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => args.onRefreshDirectory(args.entry.path)}>
                <RefreshCcw className="size-4" />
                Refresh folder
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => (isFolder ? args.onRequestDeleteFolder(args.entry.path, args.entry.name) : args.onRequestDeleteFile(args.entry.path, args.entry.name))}
          >
            <Trash2 className="size-4" />
            {isFolder ? "Delete folder" : "Delete file"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isFolder && isOpen ? (
        <>
          {directoryState?.status === "error" ? (
            <p
              className="py-1 text-sm text-destructive"
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              {directoryState.error ?? "Failed to load folder."}
            </p>
          ) : null}
          {directoryState?.status === "ready" && childEntries.length === 0 ? (
            <p
              className="py-1 text-sm text-muted-foreground"
              style={{ paddingLeft: `${24 + args.depth * 14}px` }}
            >
              Empty
            </p>
          ) : null}
          {childEntries.map((child) => (
            <ExplorerTreeRow
              key={child.path}
              entry={child}
              depth={args.depth + 1}
              expanded={args.expanded}
              directoryStateByPath={args.directoryStateByPath}
              onToggle={args.onToggle}
              onOpenFile={args.onOpenFile}
              onStartCreateFile={args.onStartCreateFile}
              onStartCreateFolder={args.onStartCreateFolder}
              onCopyRelativePath={args.onCopyRelativePath}
              onCopyAbsolutePath={args.onCopyAbsolutePath}
              onOpenInFinder={args.onOpenInFinder}
              onOpenInVSCode={args.onOpenInVSCode}
              onOpenInTerminal={args.onOpenInTerminal}
              onRefreshDirectory={args.onRefreshDirectory}
              onRequestDeleteFile={args.onRequestDeleteFile}
              onRequestDeleteFolder={args.onRequestDeleteFolder}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function WorkspaceExplorerPanel(props: {
  projectName: string;
  explorerError: string;
  pendingExplorerCreate: PendingExplorerCreate | null;
  pendingExplorerCreateInputRef: RefObject<HTMLInputElement | null>;
  pendingExplorerCreatePath: string;
  onPendingExplorerCreatePathChange: (value: string) => void;
  isCreatingExplorerEntry: boolean;
  onStartExplorerCreate: (type: "file" | "folder") => void;
  onCancelExplorerCreate: () => void;
  onSubmitExplorerCreate: () => Promise<void>;
  isExplorerLoading: boolean;
  explorerTree: WorkspaceDirectoryEntry[];
  expandedFolders: Set<string>;
  onCollapseAllFolders: () => void;
  onExpandAllFolders: () => Promise<void>;
  explorerDirectoryStateByPath: Record<string, ExplorerDirectoryState>;
  onToggleExplorerFolder: (path: string) => void;
  onOpenExplorerFile: (path: string) => void;
  onStartExplorerFileCreate: (directoryPath: string) => void;
  onStartExplorerFolderCreate: (directoryPath: string) => void;
  onCopyExplorerRelativePath: (path: string) => void;
  onCopyExplorerAbsolutePath: (path: string) => void;
  onOpenExplorerInFinder: (path: string) => void;
  onOpenExplorerInVSCode: (path: string) => void;
  onOpenExplorerInTerminal: (path: string) => void;
  onRefreshExplorerDirectory: (path: string) => void;
  onRequestDeleteExplorerFile: (path: string, name: string) => void;
  onRequestDeleteExplorerFolder: (path: string, name: string) => void;
}) {
  return (
    <div className="min-h-0 h-full overflow-auto p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{props.projectName}</p>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 rounded-sm p-0 text-muted-foreground"
                  onClick={() => props.onStartExplorerCreate("file")}
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
                  onClick={() => props.onStartExplorerCreate("folder")}
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
                  onClick={props.onCollapseAllFolders}
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
                  onClick={() => void props.onExpandAllFolders()}
                >
                  <ChevronsDown className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Expand all</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      {props.explorerError ? <p className="mb-1 text-sm text-destructive">{props.explorerError}</p> : null}
      <div className="space-y-1">
        {props.pendingExplorerCreate ? (
          <form
            className="rounded-sm border border-border/80 bg-muted/40 px-2 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              void props.onSubmitExplorerCreate();
            }}
          >
            <div className="flex items-center gap-2">
              {props.pendingExplorerCreate.type === "file" ? (
                <FilePlus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FolderPlus className="size-4 shrink-0 text-muted-foreground" />
              )}
              <Input
                ref={props.pendingExplorerCreateInputRef}
                value={props.pendingExplorerCreatePath}
                onChange={(event) => props.onPendingExplorerCreatePathChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    props.onCancelExplorerCreate();
                  }
                }}
                className="h-8 rounded-sm border-border/80 bg-background px-2 text-sm"
                placeholder={props.pendingExplorerCreate.placeholder}
                aria-label={props.pendingExplorerCreate.type === "file" ? "New file path" : "New folder path"}
                disabled={props.isCreatingExplorerEntry}
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 rounded-sm"
                disabled={props.isCreatingExplorerEntry}
              >
                {props.isCreatingExplorerEntry ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-sm px-2 text-muted-foreground"
                onClick={props.onCancelExplorerCreate}
                disabled={props.isCreatingExplorerEntry}
              >
                Cancel
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter a path relative to the project root. Press Enter to create or Esc to cancel.
            </p>
          </form>
        ) : null}
        {props.isExplorerLoading && props.explorerTree.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading files...
          </p>
        ) : null}
        {!props.explorerError && !props.isExplorerLoading && props.explorerTree.length === 0 ? <p className="text-sm text-muted-foreground">No files found.</p> : null}
        {props.explorerTree.map((entry) => (
          <ExplorerTreeRow
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={props.expandedFolders}
            directoryStateByPath={props.explorerDirectoryStateByPath}
            onToggle={props.onToggleExplorerFolder}
            onOpenFile={props.onOpenExplorerFile}
            onStartCreateFile={props.onStartExplorerFileCreate}
            onStartCreateFolder={props.onStartExplorerFolderCreate}
            onCopyRelativePath={props.onCopyExplorerRelativePath}
            onCopyAbsolutePath={props.onCopyExplorerAbsolutePath}
            onOpenInFinder={props.onOpenExplorerInFinder}
            onOpenInVSCode={props.onOpenExplorerInVSCode}
            onOpenInTerminal={props.onOpenExplorerInTerminal}
            onRefreshDirectory={props.onRefreshExplorerDirectory}
            onRequestDeleteFile={props.onRequestDeleteExplorerFile}
            onRequestDeleteFolder={props.onRequestDeleteExplorerFolder}
          />
        ))}
      </div>
    </div>
  );
}
