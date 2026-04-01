import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  LoaderCircle,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import {
  buildCollapsedWorkspaceEntries,
  type ProjectSidebarCollapsedProjectView,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";
import { OpenPathDialog } from "@/components/layout/OpenPathDialog";
import { MemoryUsagePopover } from "@/components/layout/ResourcesPopover";
import { StaveAppMenuButton } from "@/components/layout/StaveAppMenuButton";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import type { SectionId } from "@/components/layout/settings-dialog-sections";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";
import {
  Button,
  Card,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
} from "@/components/ui";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { getRespondingProviderId, getRespondingTasks } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

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

type ProjectSidebarView = ProjectSidebarCollapsedProjectView;

function formatWorkspaceName(name: string, branch?: string) {
  if (name.toLowerCase() === "default workspace") {
    return (
      <>
        Default
        {branch ? (
          <span className="ml-1 inline-flex max-w-20 truncate rounded border border-border/60 bg-muted/60 px-1 py-px text-[10px] font-medium leading-tight text-muted-foreground">
            {branch}
          </span>
        ) : null}
      </>
    );
  }
  return name;
}

const IS_MAC = window.api?.platform === "darwin";
const DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH = 64;
/** Height reserved at the top of the collapsed sidebar for macOS traffic-light buttons. */
const MAC_TRAFFIC_LIGHT_CLEARANCE = 40;
/** Keep this aligned with the native traffic-light placement in `electron/main/window.ts`. */
const MAC_TRAFFIC_LIGHT_LEFT_INSET = 12;
const MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH = 58;
const MAC_TRAFFIC_LIGHT_RIGHT_GUTTER = 10;
const COLLAPSED_PROJECT_SIDEBAR_WIDTH = IS_MAC
  ? Math.max(
      DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH,
      MAC_TRAFFIC_LIGHT_LEFT_INSET +
        MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH +
        MAC_TRAFFIC_LIGHT_RIGHT_GUTTER,
    )
  : DEFAULT_COLLAPSED_PROJECT_SIDEBAR_WIDTH;

interface SortableSidebarItemProps {
  id: string;
  disabled?: boolean;
  handleLabel: string;
  handleVisible?: boolean;
  children: (args: {
    dragHandle: ReactNode | null;
    isDragging: boolean;
  }) => ReactNode;
}

function SortableSidebarItem(args: SortableSidebarItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: args.id,
    disabled: args.disabled || !args.handleVisible,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-pan-y", isDragging && "z-20 opacity-80")}
    >
      {args.children({
        isDragging,
        dragHandle: args.handleVisible ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={args.handleLabel}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors",
              args.disabled
                ? "cursor-default opacity-40"
                : "cursor-grab hover:border-border/80 hover:bg-card/90 hover:text-foreground active:cursor-grabbing",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null,
      })}
    </div>
  );
}

export function ProjectWorkspaceSidebar(args: {
  width: number;
  collapsed: boolean;
  animate?: boolean;
}) {
  const [collapsedByProjectPath, setCollapsedByProjectPath] = useState<
    Record<string, boolean>
  >({});
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  const [busyWorkspaceKey, setBusyWorkspaceKey] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [openPathDialogOpen, setOpenPathDialogOpen] = useState(false);
  const [workspaceToClose, setWorkspaceToClose] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [closingWorkspaceId, setClosingWorkspaceId] = useState<string | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SectionId>("general");
  const [settingsInitialProjectPath, setSettingsInitialProjectPath] = useState<
    string | null
  >(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    activeWorkspaceId,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
    workspaceRuntimeCacheById,
    tasks,
    messagesByTask,
    activeTurnIdsByTask,
    activeWorkspaceBranch,
    activeWorkspaceCwd,
    defaultBranch,
    projectWorkspaceInitCommand,
    projectUseRootNodeModulesSymlink,
    createProject,
    openProjectFromPath,
    openProject,
    moveProjectInList,
    switchWorkspace,
    moveWorkspaceInProjectList,
    createWorkspace,
    closeWorkspace,
    setLayout,
    workspacePrInfoById,
    fetchAllWorkspacePrStatuses,
    refreshWorkspaces,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.activeWorkspaceId,
          state.recentProjects,
          state.workspaceDefaultById,
          state.workspaceBranchById,
          state.workspaceRuntimeCacheById,
          state.tasks,
          state.messagesByTask,
          state.activeTurnIdsByTask,
          state.workspaceBranchById[state.activeWorkspaceId] ?? "main",
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            undefined,
          state.defaultBranch,
          (state.projectPath
            ? state.recentProjects.find(
                (project) => project.projectPath === state.projectPath,
              )?.newWorkspaceInitCommand
            : "") ?? "",
          state.projectPath
            ? state.recentProjects.find(
                (project) => project.projectPath === state.projectPath,
              )?.newWorkspaceUseRootNodeModulesSymlink === true
            : false,
          state.createProject,
          state.openProjectFromPath,
          state.openProject,
          state.moveProjectInList,
          state.switchWorkspace,
          state.moveWorkspaceInProjectList,
          state.createWorkspace,
          state.closeWorkspace,
          state.setLayout,
          state.workspacePrInfoById,
          state.fetchAllWorkspacePrStatuses,
          state.refreshWorkspaces,
        ] as const,
    ),
  );

  const projects = useMemo(() => {
    const currentProject = currentProjectPath
      ? ({
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
          activeWorkspaceId,
          isCurrent: true,
        } satisfies ProjectSidebarView)
      : null;

    const rememberedProjects = recentProjects.map(
      (project) =>
        ({
          projectPath: project.projectPath,
          projectName: project.projectName,
          workspaces: project.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
            branch: project.workspaceBranchById[workspace.id],
          })),
          activeWorkspaceId: project.activeWorkspaceId,
          isCurrent: project.projectPath === currentProjectPath,
        }) satisfies ProjectSidebarView,
    );

    if (!currentProject) {
      return rememberedProjects;
    }

    const hasCurrentProject = rememberedProjects.some(
      (project) => project.projectPath === currentProjectPath,
    );
    if (!hasCurrentProject) {
      return [...rememberedProjects, currentProject];
    }

    return rememberedProjects.map((project) =>
      project.projectPath === currentProjectPath ? currentProject : project,
    );
  }, [
    activeWorkspaceId,
    currentProjectName,
    currentProjectPath,
    recentProjects,
    workspaceBranchById,
    workspaceDefaultById,
    workspaces,
  ]);
  const collapsedWorkspaceEntries = useMemo(
    () =>
      buildCollapsedWorkspaceEntries({
        projects,
        activeWorkspaceId,
      }),
    [activeWorkspaceId, projects],
  );
  const projectSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const workspaceSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setCollapsedByProjectPath((current) => {
      let changed = false;
      const next = { ...current };
      for (const project of projects) {
        if (!(project.projectPath in next)) {
          next[project.projectPath] = false;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [projects]);

  useEffect(() => {
    if (args.collapsed && reorderMode) {
      setReorderMode(false);
    }
  }, [args.collapsed, reorderMode]);

  // Fetch PR status for all non-default workspaces on mount and every 5 min.
  useEffect(() => {
    void fetchAllWorkspacePrStatuses();
    const interval = setInterval(() => {
      void fetchAllWorkspacePrStatuses();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAllWorkspacePrStatuses]);

  const handleOpenSettings = useCallback((options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => {
    void loadSettingsDialog();
    setSettingsInitialSection(options?.section ?? "general");
    setSettingsInitialProjectPath(options?.projectPath ?? null);
    setSettingsOpen(true);
  }, []);

  const handlePreloadSettings = useCallback(() => {
    void loadSettingsDialog();
  }, []);

  const handleSettingsOpenChange = useCallback((options: { open: boolean }) => {
    setSettingsOpen(options.open);
    if (!options.open) {
      setSettingsInitialSection("general");
      setSettingsInitialProjectPath(null);
    }
  }, []);

  function OverlayLoadingFallback(overlayArgs: { title: string }) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]">
        <Card className="w-full max-w-md border-border/80 bg-background/95 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading {overlayArgs.title.toLowerCase()}...
          </div>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.ctrlKey || event.metaKey;
      if (!hasMod || event.altKey || event.shiftKey || event.code !== "Slash") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(
            target.closest(
              "input, textarea, select, [role='textbox'], [contenteditable='true']",
            ),
          ))
      ) {
        return;
      }

      event.preventDefault();
      setShortcutsOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function getWorkspaceRuntimeState(workspaceId: string) {
    return workspaceId === activeWorkspaceId
      ? { tasks, messagesByTask, activeTurnIdsByTask }
      : workspaceRuntimeCacheById[workspaceId];
  }

  function getWorkspaceRespondingTasks(workspaceId: string) {
    const runtimeState = getWorkspaceRuntimeState(workspaceId);
    if (!runtimeState) {
      return [];
    }

    return getRespondingTasks({
      tasks: runtimeState.tasks,
      activeTurnIdsByTask: runtimeState.activeTurnIdsByTask,
    });
  }

  function getWorkspaceRespondingTaskCount(workspaceId: string) {
    return getWorkspaceRespondingTasks(workspaceId).length;
  }

  function getWorkspaceRespondingToneClass(workspaceId: string) {
    const runtimeState = getWorkspaceRuntimeState(workspaceId);
    if (!runtimeState) {
      return "text-primary";
    }

    const providers = Array.from(
      new Set(
        getWorkspaceRespondingTasks(workspaceId).map((task) =>
          getRespondingProviderId({
            fallbackProviderId: task.provider,
            messages: runtimeState.messagesByTask[task.id] ?? [],
          }),
        ),
      ),
    );
    if (providers.length !== 1) {
      return "text-primary";
    }
    const providerId = providers[0];
    return providerId
      ? getProviderWaveToneClass({ providerId })
      : "text-primary";
  }

  async function handleProjectWorkspaceOpen(args: {
    projectPath: string;
    workspaceId?: string;
  }) {
    const workspaceKey = args.workspaceId
      ? `${args.projectPath}:${args.workspaceId}`
      : null;
    setBusyProjectPath(args.projectPath);
    setBusyWorkspaceKey(workspaceKey);
    try {
      if (args.projectPath !== useAppStore.getState().projectPath) {
        await openProject({ projectPath: args.projectPath });
      }
      if (
        args.workspaceId &&
        useAppStore.getState().activeWorkspaceId !== args.workspaceId
      ) {
        await switchWorkspace({ workspaceId: args.workspaceId });
      }
    } finally {
      setBusyProjectPath(null);
      setBusyWorkspaceKey(null);
    }
  }

  async function handleCreateWorkspaceRequest(projectPath: string) {
    setBusyProjectPath(projectPath);
    try {
      if (projectPath !== useAppStore.getState().projectPath) {
        await openProject({ projectPath });
      }
      setCreateWorkspaceOpen(true);
    } finally {
      setBusyProjectPath(null);
    }
  }

  function handleProjectDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const projectPath = String(active.id);
    const fromIndex = projects.findIndex(
      (project) => project.projectPath === projectPath,
    );
    const toIndex = projects.findIndex(
      (project) => project.projectPath === String(over.id),
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    for (let step = 0; step < steps; step += 1) {
      moveProjectInList({ projectPath, direction });
    }
  }

  function handleWorkspaceDragEnd(args: {
    projectPath: string;
    event: DragEndEvent;
  }) {
    const { active, over } = args.event;
    if (!over || active.id === over.id) {
      return;
    }
    const project = projects.find(
      (item) => item.projectPath === args.projectPath,
    );
    if (!project) {
      return;
    }
    const workspaceId = String(active.id);
    const fromIndex = project.workspaces.findIndex(
      (workspace) => workspace.id === workspaceId,
    );
    const toIndex = project.workspaces.findIndex(
      (workspace) => workspace.id === String(over.id),
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    for (let step = 0; step < steps; step += 1) {
      moveWorkspaceInProjectList({
        projectPath: args.projectPath,
        workspaceId,
        direction,
      });
    }
  }

  return (
    <>
      <aside
        data-testid="project-workspace-sidebar"
        className={cn(
          "sidebar-liquid-glass hidden h-full shrink-0 overflow-hidden text-sidebar-foreground lg:flex lg:flex-col",
          args.collapsed && "border-r border-sidebar-border/60",
        )}
        style={{
          width: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          minWidth: `${args.collapsed ? COLLAPSED_PROJECT_SIDEBAR_WIDTH : args.width}px`,
          transition:
            args.animate !== false
              ? "width 200ms ease, min-width 200ms ease"
              : undefined,
        }}
      >
        <div
          className={cn(
            "border-b border-sidebar-border/55",
            args.collapsed ? "px-2 pb-3" : "flex h-12 items-center px-3",
          )}
          style={
            args.collapsed && IS_MAC
              ? { paddingTop: MAC_TRAFFIC_LIGHT_CLEARANCE }
              : args.collapsed
                ? { paddingTop: 12 }
                : undefined
          }
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 rounded-md bg-background/70 p-0 hover:bg-secondary/70"
                      onClick={() => setOpenPathDialogOpen(true)}
                      aria-label="open-project"
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Project</TooltipContent>
                </Tooltip>
                <MemoryUsagePopover collapsed />
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-2">
                <MemoryUsagePopover />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                      onClick={() =>
                        setLayout({
                          patch: { workspaceSidebarCollapsed: true },
                        })
                      }
                      aria-label="collapse-project-list"
                    >
                      <PanelLeft className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Collapse Project List
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </TooltipProvider>
        </div>
        {args.collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <TooltipProvider>
              <div className="flex flex-col items-center gap-2">
                {collapsedWorkspaceEntries.map((entry) => {
                  const entryKey = `${entry.projectPath}:${entry.workspaceId}`;
                  const workspaceBusy = busyWorkspaceKey === entryKey;
                  const respondingTaskCount = getWorkspaceRespondingTaskCount(
                    entry.workspaceId,
                  );
                  const isResponding = respondingTaskCount > 0;
                  const respondingToneClass = getWorkspaceRespondingToneClass(
                    entry.workspaceId,
                  );

                  return (
                    <div key={entryKey} className="flex w-full flex-col items-center">
                      {entry.startsProjectGroup ? (
                        <div
                          aria-hidden="true"
                          className="mb-2 h-px w-5 rounded-full bg-sidebar-border/70"
                        />
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
                              entry.isActive
                                ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                                : "border-transparent bg-background/60 text-muted-foreground hover:border-border/70 hover:bg-secondary/70 hover:text-foreground",
                            )}
                            onClick={() =>
                              void handleProjectWorkspaceOpen({
                                projectPath: entry.projectPath,
                                workspaceId: entry.workspaceId,
                              })
                            }
                            aria-label={`collapsed-workspace-${entry.workspaceId}`}
                          >
                            {workspaceBusy ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : isResponding ? (
                              <WaveIndicator
                                className={cn("gap-px", respondingToneClass)}
                                barClassName="h-3 w-0.5 rounded-[2px]"
                              />
                            ) : !entry.isDefault &&
                              workspacePrInfoById[entry.workspaceId] ? (
                              <PrStatusIcon
                                status={
                                  workspacePrInfoById[entry.workspaceId]!.derived
                                }
                              />
                            ) : (
                              <WorkspaceIdentityMark
                                workspaceName={entry.workspaceName}
                                isDefault={entry.isDefault}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px]">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {formatWorkspaceName(
                                entry.workspaceName,
                                entry.branch,
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.projectName}
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}
        {!args.collapsed ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <TooltipProvider>
              <div
                className={cn(
                  "sidebar-liquid-panel mb-3 flex items-center justify-between rounded-lg border border-sidebar-border/60 px-3",
                  PANEL_BAR_HEIGHT_CLASS,
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Projects
                </span>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0"
                        onClick={() => setOpenPathDialogOpen(true)}
                        aria-label="open-project"
                      >
                        <FolderOpen className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Open Project</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 rounded-md p-0",
                          reorderMode &&
                            "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                        )}
                        onClick={() => setReorderMode((current) => !current)}
                        aria-label="toggle-sidebar-reorder-mode"
                        aria-pressed={reorderMode}
                      >
                        <ArrowUpDown className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {reorderMode
                        ? "Finish reordering"
                        : "Reorder projects and workspaces"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                  No projects yet.
                </div>
              ) : (
                <>
                  <DndContext
                    sensors={projectSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleProjectDragEnd}
                  >
                    <SortableContext
                      items={projects.map((project) => project.projectPath)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {projects.map((project) => {
                          const collapsed =
                            collapsedByProjectPath[project.projectPath] ??
                            false;
                          const projectBusy =
                            busyProjectPath === project.projectPath;
                          const projectReorderingDisabled =
                            !reorderMode || projectBusy || projects.length < 2;

                          return (
                            <SortableSidebarItem
                              key={project.projectPath}
                              id={project.projectPath}
                              disabled={projectReorderingDisabled}
                              handleLabel={`reorder-project-${project.projectPath}`}
                              handleVisible={reorderMode}
                            >
                              {({ dragHandle, isDragging }) => (
                                <section
                                  className={cn(
                                    "sidebar-liquid-panel rounded-xl border border-sidebar-border/60 transition-colors",
                                    isDragging && "ring-1 ring-primary/20",
                                  )}
                                >
                                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                                    {dragHandle}
                                    <div
                                      className={cn(
                                        "group/project-row flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70 focus-within:bg-secondary/70",
                                      )}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground"
                                            onClick={() => {
                                              setCollapsedByProjectPath(
                                                (current) => ({
                                                  ...current,
                                                  [project.projectPath]:
                                                    !collapsed,
                                                }),
                                              );
                                            }}
                                            aria-label={`toggle-project-${project.projectPath}`}
                                            aria-expanded={!collapsed}
                                          >
                                            {projectBusy ? (
                                              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                                            ) : (
                                              <>
                                                <Folder
                                                  className={cn(
                                                    "size-4 transition-all duration-200",
                                                    "group-hover/project-row:scale-75 group-hover/project-row:opacity-0",
                                                    "group-focus-within/project-row:scale-75 group-focus-within/project-row:opacity-0",
                                                  )}
                                                />
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                  {collapsed ? (
                                                    <ChevronRight
                                                      className={cn(
                                                        "size-4 scale-75 opacity-0 transition-all duration-200",
                                                        "group-hover/project-row:scale-100 group-hover/project-row:opacity-100",
                                                        "group-focus-within/project-row:scale-100 group-focus-within/project-row:opacity-100",
                                                      )}
                                                    />
                                                  ) : (
                                                    <ChevronDown
                                                      className={cn(
                                                        "size-4 scale-75 opacity-0 transition-all duration-200",
                                                        "group-hover/project-row:scale-100 group-hover/project-row:opacity-100",
                                                        "group-focus-within/project-row:scale-100 group-focus-within/project-row:opacity-100",
                                                      )}
                                                    />
                                                  )}
                                                </span>
                                              </>
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                          {collapsed
                                            ? "Expand project"
                                            : "Collapse project"}
                                        </TooltipContent>
                                      </Tooltip>
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {project.projectName}
                                        </span>
                                        <div
                                          className={cn(
                                            "flex shrink-0 items-center gap-0.5 transition-all duration-200",
                                            "pointer-events-none translate-x-1 opacity-0",
                                            "group-hover/project-row:pointer-events-auto group-hover/project-row:translate-x-0 group-hover/project-row:opacity-100",
                                            "group-focus-within/project-row:pointer-events-auto group-focus-within/project-row:translate-x-0 group-focus-within/project-row:opacity-100",
                                          )}
                                        >
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
                                                disabled={projectBusy}
                                                onClick={() =>
                                                  void handleCreateWorkspaceRequest(
                                                    project.projectPath,
                                                  )
                                                }
                                                aria-label={`new-workspace-${project.projectPath}`}
                                              >
                                                <Plus className="size-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              New workspace
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
                                                disabled={projectBusy}
                                                onClick={() =>
                                                  void refreshWorkspaces()
                                                }
                                                aria-label={`refresh-workspaces-${project.projectPath}`}
                                              >
                                                <RefreshCw className="size-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              Refresh workspaces
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 rounded-md p-0"
                                                disabled={projectBusy}
                                                onMouseEnter={handlePreloadSettings}
                                                onFocus={handlePreloadSettings}
                                                onClick={() =>
                                                  handleOpenSettings({
                                                    section: "projects",
                                                    projectPath:
                                                      project.projectPath,
                                                  })
                                                }
                                                aria-label={`project-settings-${project.projectPath}`}
                                              >
                                                <Settings className="size-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              Project settings
                                            </TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {!collapsed ? (
                                    <div className="border-t border-border/60 px-1.5 py-1.5">
                                      <DndContext
                                        sensors={workspaceSensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={(event) =>
                                          handleWorkspaceDragEnd({
                                            projectPath: project.projectPath,
                                            event,
                                          })
                                        }
                                      >
                                        <SortableContext
                                          items={project.workspaces.map(
                                            (workspace) => workspace.id,
                                          )}
                                          strategy={verticalListSortingStrategy}
                                        >
                                          <div className="space-y-1">
                                            {project.workspaces.map(
                                              (workspace) => {
                                                const workspaceBusy =
                                                  busyWorkspaceKey ===
                                                  `${project.projectPath}:${workspace.id}`;
                                                const respondingTaskCount =
                                                  getWorkspaceRespondingTaskCount(
                                                    workspace.id,
                                                  );
                                                const isResponding =
                                                  respondingTaskCount > 0;
                                                const respondingToneClass =
                                                  getWorkspaceRespondingToneClass(
                                                    workspace.id,
                                                  );
                                                const isActive =
                                                  project.isCurrent &&
                                                  workspace.id ===
                                                    activeWorkspaceId;
                                                const workspaceReorderingDisabled =
                                                  !reorderMode ||
                                                  projectBusy ||
                                                  workspaceBusy ||
                                                  project.workspaces.length < 2;
                                                const canArchiveWorkspace =
                                                  project.isCurrent &&
                                                  !workspace.isDefault;

                                                return (
                                                  <SortableSidebarItem
                                                    key={workspace.id}
                                                    id={workspace.id}
                                                    disabled={
                                                      workspaceReorderingDisabled
                                                    }
                                                    handleLabel={`reorder-workspace-${workspace.id}`}
                                                    handleVisible={reorderMode}
                                                  >
                                                    {({
                                                      dragHandle,
                                                      isDragging,
                                                    }) => (
                                                      <div
                                                        className={cn(
                                                          "group flex items-center gap-1 rounded-md transition-colors hover:bg-secondary/70",
                                                          isActive &&
                                                            "bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-sm",
                                                          isDragging &&
                                                            "bg-secondary/40",
                                                        )}
                                                      >
                                                        {dragHandle}
                                                        <button
                                                          type="button"
                                                          className={cn(
                                                            "flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm",
                                                          )}
                                                          onClick={() =>
                                                            void handleProjectWorkspaceOpen(
                                                              {
                                                                projectPath:
                                                                  project.projectPath,
                                                                workspaceId:
                                                                  workspace.id,
                                                              },
                                                            )
                                                          }
                                                        >
                                                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                                            {workspaceBusy ? (
                                                              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                                                            ) : isResponding ? (
                                                              <WaveIndicator
                                                                className={cn(
                                                                  "gap-px",
                                                                  respondingToneClass,
                                                                )}
                                                                barClassName="h-3 w-0.5 rounded-[2px]"
                                                              />
                                                            ) : !workspace.isDefault && workspacePrInfoById[workspace.id] ? (
                                                              <PrStatusIcon
                                                                status={workspacePrInfoById[workspace.id]!.derived}
                                                              />
                                                            ) : (
                                                              <WorkspaceIdentityMark
                                                                workspaceName={
                                                                  workspace.name
                                                                }
                                                                isDefault={
                                                                  workspace.isDefault
                                                                }
                                                              />
                                                            )}
                                                          </span>
                                                          <span className="min-w-0 flex-1 truncate">
                                                            {formatWorkspaceName(
                                                              workspace.name,
                                                              workspace.branch,
                                                            )}
                                                          </span>
                                                        </button>
                                                        {(isResponding ||
                                                          canArchiveWorkspace) ? (
                                                          <div className="relative flex h-7 min-w-7 shrink-0 items-center justify-center pr-1">
                                                            {isResponding ? (
                                                              <span
                                                                className={cn(
                                                                  "inline-flex min-w-7 items-center justify-center rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary transition-opacity",
                                                                  canArchiveWorkspace
                                                                    ? closingWorkspaceId ===
                                                                        workspace.id
                                                                      ? "opacity-0"
                                                                      : "group-hover:opacity-0"
                                                                    : "",
                                                                )}
                                                              >
                                                                {
                                                                  respondingTaskCount
                                                                }
                                                              </span>
                                                            ) : null}
                                                            {canArchiveWorkspace ? (
                                                              <Tooltip>
                                                                <TooltipTrigger
                                                                  asChild
                                                                >
                                                                  <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className={cn(
                                                                      "h-7 w-7 rounded-md p-0 text-muted-foreground transition-opacity hover:text-destructive focus-visible:text-destructive",
                                                                      isResponding
                                                                        ? "absolute inset-0 m-auto"
                                                                        : "",
                                                                      closingWorkspaceId ===
                                                                        workspace.id
                                                                        ? "opacity-100"
                                                                        : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                                                                    )}
                                                                    disabled={
                                                                      closingWorkspaceId ===
                                                                      workspace.id
                                                                    }
                                                                    onClick={() =>
                                                                      setWorkspaceToClose(
                                                                        {
                                                                          id: workspace.id,
                                                                          name: workspace.name,
                                                                        },
                                                                      )
                                                                    }
                                                                    aria-label={`archive-workspace-${workspace.id}`}
                                                                  >
                                                                    {closingWorkspaceId ===
                                                                    workspace.id ? (
                                                                      <LoaderCircle className="size-3.5 animate-spin" />
                                                                    ) : (
                                                                      <Archive className="size-3.5" />
                                                                    )}
                                                                  </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="right">
                                                                  Archive
                                                                </TooltipContent>
                                                              </Tooltip>
                                                            ) : null}
                                                          </div>
                                                        ) : null}
                                                      </div>
                                                    )}
                                                  </SortableSidebarItem>
                                                );
                                              },
                                            )}
                                          </div>
                                        </SortableContext>
                                      </DndContext>
                                    </div>
                                  ) : null}
                                </section>
                              )}
                            </SortableSidebarItem>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </TooltipProvider>
          </div>
        ) : null}
        <div
          className={cn(
            "border-t border-sidebar-border/55",
            args.collapsed ? "px-2 py-2" : "px-3 py-2",
          )}
        >
          <TooltipProvider>
            {args.collapsed ? (
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 rounded-md p-0"
                      aria-label="open-settings"
                      onMouseEnter={handlePreloadSettings}
                      onFocus={handlePreloadSettings}
                      onClick={() => handleOpenSettings()}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <StaveAppMenuButton compact />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 rounded-md p-0"
                      aria-label="open-settings"
                      onMouseEnter={handlePreloadSettings}
                      onFocus={handlePreloadSettings}
                      onClick={() => handleOpenSettings()}
                    >
                      <Settings className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Settings</TooltipContent>
                </Tooltip>
              </div>
            )}
          </TooltipProvider>
        </div>
      </aside>
      <ConfirmDialog
        open={Boolean(workspaceToClose)}
        title="Archive Workspace"
        description={
          workspaceToClose
            ? `Archive workspace "${workspaceToClose.name}"? The associated git worktree will be permanently removed. Any uncommitted changes will be lost.`
            : ""
        }
        confirmLabel="Archive"
        loading={closingWorkspaceId !== null}
        onCancel={() => setWorkspaceToClose(null)}
        onConfirm={() => {
          if (!workspaceToClose) {
            return;
          }
          setClosingWorkspaceId(workspaceToClose.id);
          void closeWorkspace({ workspaceId: workspaceToClose.id }).finally(
            () => {
              setClosingWorkspaceId(null);
              setWorkspaceToClose(null);
            },
          );
        }}
      />
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        activeBranch={activeWorkspaceBranch}
        defaultBranch={defaultBranch}
        cwd={activeWorkspaceCwd}
        defaultInitCommand={projectWorkspaceInitCommand}
        defaultUseRootNodeModulesSymlink={projectUseRootNodeModulesSymlink}
        onOpenChange={setCreateWorkspaceOpen}
        onCreateWorkspace={createWorkspace}
      />
      <OpenPathDialog
        open={openPathDialogOpen}
        onOpenChange={setOpenPathDialogOpen}
        onSubmitPath={(inputPath) => openProjectFromPath({ inputPath })}
        onBrowse={async () => {
          await createProject({});
        }}
      />
      {shortcutsOpen ? (
        <Suspense
          fallback={<OverlayLoadingFallback title="Keyboard Shortcuts" />}
        >
          <KeyboardShortcutsDrawer
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />
        </Suspense>
      ) : null}
      {settingsOpen ? (
        <Suspense fallback={<OverlayLoadingFallback title="Settings" />}>
          <SettingsDialog
            open={settingsOpen}
            initialSection={settingsInitialSection}
            initialProjectPath={settingsInitialProjectPath}
            onOpenChange={handleSettingsOpenChange}
          />
        </Suspense>
      ) : null}
    </>
  );
}
