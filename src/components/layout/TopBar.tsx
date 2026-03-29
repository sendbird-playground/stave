import { FolderTree, LoaderCircle, Code2, SquareTerminal, FolderOpen, ChevronDown } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarUtilityActions } from "@/components/layout/TopBarUtilityActions";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import { getRepoMapContextCache, setRepoMapContextCache } from "@/lib/fs/repo-map-context-cache";
import { formatRepoMapForContext } from "@/lib/fs/repo-map.types";

const loadSettingsDialog = () =>
  import("@/components/layout/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  }));
const SettingsDialog = lazy(() => loadSettingsDialog());
const loadKeyboardShortcutsDrawer = () =>
  import("@/components/layout/KeyboardShortcutsDrawer").then((module) => ({
    default: module.KeyboardShortcutsDrawer,
  }));
const KeyboardShortcutsDrawer = lazy(() => loadKeyboardShortcutsDrawer());
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

function formatWorkspacePathLabel(args: { workspacePath?: string; projectPath?: string | null }) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [
    isDarkMode,
    setDarkMode,
    refreshProjectFiles,
    activeWorkspaceId,
    workspacePathById,
    projectPath,
  ] = useAppStore(useShallow((state) => [
    state.isDarkMode,
    state.setDarkMode,
    state.refreshProjectFiles,
    state.activeWorkspaceId,
    state.workspacePathById,
    state.projectPath,
  ] as const));
  const hasProjectContext = Boolean(projectPath?.trim());
  const activeWorkspacePath = hasProjectContext ? (workspacePathById[activeWorkspaceId] ?? projectPath ?? "") : "";
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: activeWorkspacePath,
    projectPath,
  });

  function OverlayLoadingFallback(args: { title: string }) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]">
        <Card className="w-full max-w-md border-border/80 bg-background/95 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading {args.title.toLowerCase()}...
          </div>
        </Card>
      </div>
    );
  }

  const handleRefreshProjectFiles = useCallback(() => {
    void refreshProjectFiles();
  }, [refreshProjectFiles]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode({ enabled: !isDarkMode });
  }, [isDarkMode, setDarkMode]);

  const handleOpenShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
    setShortcutsOpen(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    void loadSettingsDialog();
    setSettingsOpen(true);
  }, []);

  const handlePreloadShortcuts = useCallback(() => {
    void loadKeyboardShortcutsDrawer();
  }, []);

  const handlePreloadSettings = useCallback(() => {
    void loadSettingsDialog();
  }, []);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || event.altKey || event.shiftKey || event.code !== "Slash") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement
        && (
          target.isContentEditable
          || Boolean(target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))
        )
      ) {
        return;
      }

      event.preventDefault();
      setShortcutsOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        data-testid="top-bar"
        className="relative z-30 flex h-12 items-center justify-between gap-3 border-b border-border/70 bg-card px-3.5"
        style={TOP_BAR_DRAG_STYLE}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <TooltipProvider>
            {hasProjectContext ? <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} /> : null}
            {hasProjectContext && activeWorkspacePath ? (
              <div className="flex min-w-0 items-center" style={TOP_BAR_NO_DRAG_STYLE}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex max-w-[220px] items-center gap-2 rounded-l-md border border-r-0 border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                      <FolderTree className="size-3.5 shrink-0" />
                      <span className="truncate font-mono">{workspacePathLabel}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{activeWorkspacePath}</TooltipContent>
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
                    <DropdownMenuItem onClick={() => void window.api?.shell?.showInFinder?.({ path: activeWorkspacePath })}>
                      <FolderOpen className="size-4" />
                      Open in Finder
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void window.api?.shell?.openInVSCode?.({ path: activeWorkspacePath })}>
                      <Code2 className="size-4" />
                      Open in VS Code
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void window.api?.shell?.openInTerminal?.({ path: activeWorkspacePath })}>
                      <SquareTerminal className="size-4" />
                      Open in Terminal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
            {hasProjectContext ? <TopBarOpenPR noDragStyle={TOP_BAR_NO_DRAG_STYLE} /> : null}
          </TooltipProvider>
        </div>
        <div
          className="hidden min-w-0 flex-1 justify-center lg:flex"
        >
          {hasProjectContext ? <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5" style={TOP_BAR_NO_DRAG_STYLE}>
          <TopBarUtilityActions
            canRefreshProjectFiles={hasProjectContext}
            isDarkMode={isDarkMode}
            noDragStyle={TOP_BAR_NO_DRAG_STYLE}
            onRefresh={handleRefreshProjectFiles}
            onToggleTheme={handleToggleTheme}
            onOpenShortcuts={handleOpenShortcuts}
            onOpenSettings={handleOpenSettings}
            onPreloadShortcuts={handlePreloadShortcuts}
            onPreloadSettings={handlePreloadSettings}
          />
          <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        </div>
      </header>
      {shortcutsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Keyboard Shortcuts" />}>
          <KeyboardShortcutsDrawer open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </Suspense>
      ) : null}
      {settingsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Settings" />}>
          <SettingsDialog open={settingsOpen} onOpenChange={({ open }) => setSettingsOpen(open)} />
        </Suspense>
      ) : null}
    </>
  );
}
