import {
  FolderTree,
  Code2,
  SquareTerminal,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import {
  getRepoMapContextCache,
  setRepoMapContextCache,
} from "@/lib/fs/repo-map-context-cache";
import { formatRepoMapForContext } from "@/lib/fs/repo-map.types";

const IS_MAC = window.api?.platform === "darwin";
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

function formatWorkspacePathLabel(args: {
  workspacePath?: string;
  projectPath?: string | null;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return "";
  }

  const projectPath = args.projectPath?.trim();
  if (projectPath && workspacePath.startsWith(`${projectPath}/`)) {
    return workspacePath.slice(projectPath.length + 1);
  }

  return workspacePath;
}

export function TopBar() {
  const [activeWorkspaceId, workspacePathById, projectPath] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspacePathById,
          state.projectPath,
        ] as const,
    ),
  );
  const hasProjectContext = Boolean(projectPath?.trim());
  const activeWorkspacePath = hasProjectContext
    ? (workspacePathById[activeWorkspaceId] ?? projectPath ?? "")
    : "";
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: activeWorkspacePath,
    projectPath,
  });

  // Pre-warm the module-level repo-map context cache so the first AI turn in
  // this workspace can synchronously read it (a plain Map.get — no IPC).
  useEffect(() => {
    if (!hasProjectContext || !activeWorkspacePath) {
      return;
    }
    // Skip if already cached — avoids a redundant IPC round-trip.
    if (getRepoMapContextCache(activeWorkspacePath)) {
      return;
    }
    const getRepoMap = window.api?.fs?.getRepoMap;
    if (!getRepoMap) {
      return;
    }
    void getRepoMap({ rootPath: activeWorkspacePath })
      .then((result) => {
        if (result.ok && result.repoMap) {
          const snap = result.repoMap;
          setRepoMapContextCache(activeWorkspacePath, {
            text: formatRepoMapForContext(snap),
            snapshotUpdatedAt: snap.updatedAt,
            fileCount: snap.fileCount,
            codeFileCount: snap.codeFileCount,
            hotspotCount: snap.hotspots.length,
            entrypointCount: snap.entrypoints.length,
            docCount: snap.docs.length,
          });
        }
      })
      .catch(() => {
        // Pre-warming failure is non-fatal; the first turn simply won't have
        // the repo-map injected. Subsequent workspace switches will retry.
      });
  }, [activeWorkspacePath, hasProjectContext]);

  return (
    <header
      data-testid="top-bar"
      className={`relative z-30 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-card px-3.5${IS_MAC ? " pl-20" : ""}`}
      style={TOP_BAR_DRAG_STYLE}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <TooltipProvider>
          {hasProjectContext ? (
            <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          ) : null}
          {hasProjectContext && activeWorkspacePath ? (
            <div
              className="flex min-w-0 items-center"
              style={TOP_BAR_NO_DRAG_STYLE}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex max-w-[220px] items-center gap-2 rounded-l-md border border-r-0 border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                    <FolderTree className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">
                      {workspacePathLabel}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {activeWorkspacePath}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center rounded-r-md border border-border/60 bg-background/60 px-1 py-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open in…</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  <DropdownMenuItem
                    onClick={() =>
                      void window.api?.shell?.showInFinder?.({
                        path: activeWorkspacePath,
                      })
                    }
                  >
                    <FolderOpen className="size-4" />
                    Open in Finder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void window.api?.shell?.openInVSCode?.({
                        path: activeWorkspacePath,
                      })
                    }
                  >
                    <Code2 className="size-4" />
                    Open in VS Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void window.api?.shell?.openInTerminal?.({
                        path: activeWorkspacePath,
                      })
                    }
                  >
                    <SquareTerminal className="size-4" />
                    Open in Terminal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {hasProjectContext ? (
            <TopBarOpenPR noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          ) : null}
        </TooltipProvider>
      </div>
      <div className="hidden min-w-0 flex-1 justify-end lg:flex">
        {hasProjectContext ? (
          <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        ) : null}
      </div>
      {IS_MAC ? null : (
        <div
          className="flex shrink-0 items-center gap-1.5"
          style={TOP_BAR_NO_DRAG_STYLE}
        >
          <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        </div>
      )}
    </header>
  );
}
