import { ChevronDown, Home, Keyboard, LoaderCircle, Settings } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { ProjectMenuButton } from "@/components/layout/ProjectMenuButton";
import { TopBarUtilityActions } from "@/components/layout/TopBarUtilityActions";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import { TopBarWorkspaceSwitcher } from "@/components/layout/TopBarWorkspaceSwitcher";
import { cn } from "@/lib/utils";

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

export function TopBar() {
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [
    isDarkMode,
    workspaceRootName,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
    newWorkspaceInitCommand,
    setDarkMode,
    createWorkspace,
    createProject,
    clearTaskSelection,
    deleteWorkspace,
    refreshProjectFiles,
  ] = useAppStore(useShallow((state) => [
    state.isDarkMode,
    state.workspaceRootName,
    state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
    state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined,
    state.settings.newWorkspaceInitCommand,
    state.setDarkMode,
    state.createWorkspace,
    state.createProject,
    state.clearTaskSelection,
    state.deleteWorkspace,
    state.refreshProjectFiles,
  ] as const));

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

  const handleWorkspaceDeleteRequest = useCallback((workspaceId: string, workspaceName: string) => {
    setWorkspaceToDelete({ id: workspaceId, name: workspaceName });
  }, []);

  const handleCreateProject = useCallback(() => {
    void createProject({});
  }, [createProject]);

  const handleOpenCreateWorkspace = useCallback(() => {
    setCreateWorkspaceOpen(true);
  }, []);

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
        className="relative z-30 flex h-12 items-center justify-between border-b border-border/70 bg-card px-3.5"
        style={TOP_BAR_DRAG_STYLE}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
          style={{ paddingRight: "198px" }}
        >
          <DropdownMenu open={appMenuOpen} onOpenChange={setAppMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open Stave menu"
                className={cn(
                  "h-8 gap-1.5 rounded-md border border-border/80 bg-card px-2.5 hover:bg-secondary/70",
                  appMenuOpen && "border-primary/70 bg-secondary/80",
                )}
                style={TOP_BAR_NO_DRAG_STYLE}
              >
                <img
                  src={isDarkMode ? "stave-logo-light.svg" : "stave-logo-dark.svg"}
                  alt="Stave"
                  className="h-4 w-auto"
                  draggable={false}
                />
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-52" style={TOP_BAR_NO_DRAG_STYLE}>
              <DropdownMenuLabel>Stave</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2" onSelect={clearTaskSelection}>
                <Home className="size-4 text-muted-foreground" />
                Home
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onSelect={handleOpenShortcuts}>
                <Keyboard className="size-4 text-muted-foreground" />
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={handleOpenSettings}>
                <Settings className="size-4 text-muted-foreground" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="h-4 w-px bg-border/80" />
          <ProjectMenuButton
            projectName={workspaceRootName}
            currentBranch={activeWorkspaceBranch}
            onCreateProject={handleCreateProject}
            noDragStyle={TOP_BAR_NO_DRAG_STYLE}
          />
          <span className="h-4 w-px bg-border/80" />
          <TopBarWorkspaceSwitcher
            noDragStyle={TOP_BAR_NO_DRAG_STYLE}
            onRequestCreateWorkspace={handleOpenCreateWorkspace}
            onRequestDeleteWorkspace={handleWorkspaceDeleteRequest}
          />
        </div>
        <div
          className="absolute right-0 top-0 z-20 flex h-12 shrink-0 items-center"
          style={{
            right: "8px",
          }}
        >
          <div className="flex shrink-0 items-center gap-1.5">
            <TopBarUtilityActions
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
      <ConfirmDialog
        open={Boolean(workspaceToDelete)}
        title="Close Workspace"
        description={workspaceToDelete ? `Close workspace "${workspaceToDelete.name}"? The associated git worktree will be permanently removed. Any uncommitted changes will be lost.` : ""}
        confirmLabel="Close Workspace"
        onCancel={() => setWorkspaceToDelete(null)}
        onConfirm={() => {
          if (!workspaceToDelete) {
            return;
          }
          void deleteWorkspace({ workspaceId: workspaceToDelete.id });
          setWorkspaceToDelete(null);
        }}
      />
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        activeBranch={activeWorkspaceBranch}
        cwd={activeWorkspaceCwd}
        defaultInitCommand={newWorkspaceInitCommand}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateWorkspace={createWorkspace}
      />
    </>
  );
}
