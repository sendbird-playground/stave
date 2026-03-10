import { cva } from "class-variance-authority";
import { ChevronDown, Folder, FolderPlus, GitBranch, Home, Keyboard, LoaderCircle, Minus, Moon, RefreshCw, Search, Settings, Square, Sun, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Badge, Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { KeyboardShortcutsDrawer } from "@/components/layout/KeyboardShortcutsDrawer";
import { WorkspaceIdentityMark, getWorkspaceAccentTone } from "@/components/layout/workspace-accent";

const workspaceChipVariants = cva("inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors", {
  variants: {
    active: {
      true: "border-primary/70 bg-primary/12 font-semibold shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_26%,transparent)]",
      false: "border-border/80 bg-card hover:bg-secondary/50",
    },
    tone: {
      muted: "text-muted-foreground",
      normal: "text-muted-foreground hover:text-foreground",
      active: "text-foreground",
    },
  },
});

export function TopBar() {
  const dragStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creationMode, setCreationMode] = useState<"branch" | "clean">("branch");
  const [fromBranch, setFromBranch] = useState("main");
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const isDarkMode = useAppStore((state) => state.isDarkMode);
  const workspaceRootName = useAppStore((state) => state.workspaceRootName);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaceDefaultById = useAppStore((state) => state.workspaceDefaultById);
  const workspaceBranchById = useAppStore((state) => state.workspaceBranchById);
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const projectPath = useAppStore((state) => state.projectPath);
  const setDarkMode = useAppStore((state) => state.setDarkMode);
  const createWorkspace = useAppStore((state) => state.createWorkspace);
  const createProject = useAppStore((state) => state.createProject);
  const clearTaskSelection = useAppStore((state) => state.clearTaskSelection);
  const deleteWorkspace = useAppStore((state) => state.deleteWorkspace);
  const switchWorkspace = useAppStore((state) => state.switchWorkspace);
  const refreshProjectFiles = useAppStore((state) => state.refreshProjectFiles);
  const orderedWorkspaces = useMemo(() => {
    return [...workspaces].sort((a, b) => {
      const aDefault = workspaceDefaultById[a.id] ? 0 : 1;
      const bDefault = workspaceDefaultById[b.id] ? 0 : 1;
      if (aDefault !== bDefault) {
        return aDefault - bDefault;
      }
      return 0;
    });
  }, [workspaces, workspaceDefaultById]);

  function formatWorkspaceLabel(args: { name: string; isDefault: boolean }) {
    if (args.isDefault && args.name.toLowerCase() === "default workspace") {
      return "Default";
    }
    return args.name;
  }

  useEffect(() => {
    let mounted = true;

    const syncWindowState = async () => {
      const getState = window.api?.window?.isMaximized;
      if (!getState) {
        return;
      }
      const state = await getState();
      if (state && mounted) {
        setIsMaximized(Boolean(state.isMaximized));
      }
    };

    void syncWindowState();
    const initPoll = window.setInterval(() => {
      void syncWindowState();
    }, 250);
    const steadyPoll = window.setInterval(() => {
      void syncWindowState();
    }, 1000);
    const initStop = window.setTimeout(() => window.clearInterval(initPoll), 5000);

    return () => {
      mounted = false;
      window.clearInterval(initPoll);
      window.clearInterval(steadyPoll);
      window.clearTimeout(initStop);
    };
  }, []);

  useEffect(() => {
    if (!createWorkspaceOpen) {
      return;
    }
    const activeBranch = workspaceBranchById[activeWorkspaceId];
    setFromBranch(activeBranch ?? "main");
    const cwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      return;
    }
    void listBranches({ cwd }).then((result) => {
      if (result?.ok) {
        setAvailableBranches(result.branches);
      }
    });
  }, [createWorkspaceOpen]);

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
        style={dragStyle}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
          style={{ paddingRight: "198px" }}
        >
          <Badge className="h-8 rounded-md border border-border/80 bg-card px-2.5" style={noDragStyle}>
            <img
              src={isDarkMode ? "/stave-logo-light.svg" : "/stave-logo-dark.svg"}
              alt="Stave"
              className="h-4 w-auto"
              draggable={false}
            />
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-md p-0 text-muted-foreground"
                  onClick={clearTaskSelection}
                  style={noDragStyle}
                >
                  <Home className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Home</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="h-4 w-px bg-border/80" />
          <DropdownMenu open={projectMenuOpen} onOpenChange={setProjectMenuOpen}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="project-menu"
                      className={cn(
                        "h-9 max-w-44 rounded-md border border-border/70 bg-card px-2.5 text-sm transition-colors md:max-w-60",
                        projectMenuOpen && "border-primary/70 bg-secondary/80",
                      )}
                      style={noDragStyle}
                    >
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{workspaceRootName ?? "No Project"}</span>
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{workspaceRootName ?? "No Project"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="start" sideOffset={8} className="w-[22rem]" style={noDragStyle}>
              <DropdownMenuItem
                className="h-10 justify-start gap-2 rounded-md px-3 text-sm"
                onClick={() => {
                  void createProject({});
                  setProjectMenuOpen(false);
                }}
              >
                <FolderPlus className="size-4 text-background/60" />
                Create project (select folder)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Current Project</DropdownMenuLabel>
              <div className="rounded-sm border border-background/12 bg-background/8 px-2 py-2">
                <p className="truncate text-sm font-medium text-background">{workspaceRootName ?? "No Project"}</p>
                <p className="truncate text-sm text-background/60">{workspaceBranchById[activeWorkspaceId] ?? "main"}</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="h-4 w-px bg-border/80" />
          <TooltipProvider>
            <div className="hidden items-center gap-1 md:flex">
            {orderedWorkspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              const isDefault = Boolean(workspaceDefaultById[workspace.id]);
              const accentTone = getWorkspaceAccentTone({ workspaceName: workspace.name });
              return (
                <Tooltip key={workspace.id}>
                  <TooltipTrigger asChild>
                    <button
                      className={workspaceChipVariants({
                        active: isActive,
                        tone: isActive ? "active" : isDefault ? "muted" : "normal",
                      })}
                      onClick={() => {
                        if (workspace.id === activeWorkspaceId || switchingWorkspaceId) {
                          return;
                        }
                        setSwitchingWorkspaceId(workspace.id);
                        void switchWorkspace({ workspaceId: workspace.id }).finally(() => {
                          setSwitchingWorkspaceId(null);
                        });
                      }}
                      disabled={Boolean(switchingWorkspaceId && switchingWorkspaceId !== workspace.id)}
                      style={noDragStyle}
                    >
                      {switchingWorkspaceId === workspace.id ? (
                        <span
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[0.45rem] border"
                          style={{
                            backgroundColor: accentTone.background,
                            color: accentTone.foreground,
                            borderColor: accentTone.border,
                          }}
                        >
                          <LoaderCircle className="size-3 animate-spin" />
                        </span>
                      ) : (
                        <WorkspaceIdentityMark workspaceName={workspace.name} />
                      )}
                      <span className="truncate max-w-24">{formatWorkspaceLabel({ name: workspace.name, isDefault })}</span>
                      {!isDefault && workspace.id !== "base" ? (
                        <span
                          className="rounded px-1 text-sm text-muted-foreground hover:bg-secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            setWorkspaceToDelete({ id: workspace.id, name: workspace.name });
                          }}
                        >
                          ×
                        </span>
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {formatWorkspaceLabel({ name: workspace.name, isDefault })}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            <span className="mx-1 h-4 w-px bg-border/80" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="new-workspace"
                  className="h-9 rounded-md px-3 text-sm"
                  onClick={() => {
                    setCreateWorkspaceError(null);
                    setCreateWorkspaceOpen(true);
                  }}
                  style={noDragStyle}
                >
                  + New Workspace
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Create a new workspace</TooltipContent>
            </Tooltip>
            </div>
          </TooltipProvider>
        </div>
        <div
          className="absolute right-0 top-0 z-20 flex h-12 shrink-0 items-center"
          style={{
            right: "8px",
          }}
        >
          <TooltipProvider>
            <div className="flex shrink-0 items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 rounded-md p-0" onClick={() => void refreshProjectFiles()} style={noDragStyle}>
                    <RefreshCw className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh project files</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    onClick={() => setDarkMode({ enabled: !isDarkMode })}
                    aria-label="toggle theme"
                    style={noDragStyle}
                  >
                    {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{isDarkMode ? "Switch to light mode" : "Switch to dark mode"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 rounded-md p-0" aria-label="search" style={noDragStyle}>
                    <Search className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Search</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    aria-label="open-shortcuts"
                    onClick={() => setShortcutsOpen(true)}
                    style={noDragStyle}
                  >
                    <Keyboard className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Keyboard shortcuts</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="open-settings" className="h-9 w-9 rounded-md p-0" onClick={() => setSettingsOpen(true)} style={noDragStyle}>
                    <Settings className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Settings</TooltipContent>
              </Tooltip>
            <span className="mx-1 h-4 w-px bg-border/80" aria-hidden="true" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    onClick={() => void window.api?.window?.minimize?.()}
                    aria-label="window-minimize"
                    style={noDragStyle}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Minimize</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-md p-0"
                    onClick={async () => {
                      const next = await window.api?.window?.toggleMaximize?.();
                      if (next) {
                        setIsMaximized(next.isMaximized);
                      }
                    }}
                    aria-label="window-maximize"
                    style={noDragStyle}
                  >
                    <Square className={cn("size-3.5", isMaximized && "opacity-80")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{isMaximized ? "Restore window" : "Maximize"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-md p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => void window.api?.window?.close?.()}
                    aria-label="window-close"
                    style={noDragStyle}
                  >
                    <X className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close window</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </header>
      <KeyboardShortcutsDrawer open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={({ open }) => setSettingsOpen(open)} />
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
      {createWorkspaceOpen ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
          onMouseDown={() => {
            if (creatingWorkspace) {
              return;
            }
            setCreateWorkspaceError(null);
            setCreateWorkspaceOpen(false);
          }}
        >
          <Card className="animate-dropdown-in w-full max-w-3xl rounded-lg border-border/80 bg-card p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-3xl font-semibold">Create New Workspace</h3>
              <Button
                size="sm"
                variant="ghost"
                disabled={creatingWorkspace}
                onClick={() => {
                  setCreateWorkspaceError(null);
                  setCreateWorkspaceOpen(false);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Workspace is a dedicated git worktree bound to a branch.
            </p>
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium">Workspace Branch Name</p>
              <Input
                value={workspaceName}
                placeholder="feature/your-workspace"
                onChange={(event) => setWorkspaceName(event.target.value)}
                className="h-10 rounded-sm border-border/80 bg-background"
              />
            </div>
            <p className="mb-2 text-sm font-medium">Creation Methods</p>
            <div className="space-y-2">
              <button
                type="button"
                className={cn(
                  "w-full rounded-sm border p-3 text-left",
                  creationMode === "branch" ? "border-primary bg-secondary/50" : "border-border/80 bg-card",
                )}
                onClick={() => setCreationMode("branch")}
              >
                <p className="flex items-center gap-2 text-base font-semibold">
                  <GitBranch className="size-4" />
                  Create From Branch
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Create worktree from the selected base branch.</p>
                <Select value={fromBranch} onValueChange={setFromBranch}>
                  <SelectTrigger className="mt-2 h-8 text-sm" onClick={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </button>
              <button
                type="button"
                className={cn(
                  "w-full rounded-sm border p-3 text-left",
                  creationMode === "clean" ? "border-primary bg-secondary/50" : "border-border/80 bg-card",
                )}
                onClick={() => setCreationMode("clean")}
              >
                <p className="text-base font-semibold">Create Clean Workspace</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a new isolated worktree with a fresh branch.</p>
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={creatingWorkspace}
                onClick={() => {
                  setCreateWorkspaceError(null);
                  setCreateWorkspaceOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={creatingWorkspace}
                onClick={async () => {
                  setCreatingWorkspace(true);
                  setCreateWorkspaceError(null);
                  try {
                    const result = await createWorkspace({ name: workspaceName, mode: creationMode, fromBranch });
                    if (!result.ok) {
                      setCreateWorkspaceError(result.message ?? "Failed to create workspace.");
                      return;
                    }
                    setWorkspaceName("");
                    setCreationMode("branch");
                    setCreateWorkspaceOpen(false);
                  } catch (error) {
                    setCreateWorkspaceError(error instanceof Error ? error.message : "Failed to create workspace.");
                  } finally {
                    setCreatingWorkspace(false);
                  }
                }}
              >
                {creatingWorkspace ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
            {createWorkspaceError ? (
              <p className="mt-3 text-sm text-destructive">{createWorkspaceError}</p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}
