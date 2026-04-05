import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Check, ChevronDown, ChevronRight, Contrast, FileAudio, Folder, Globe, Monitor, Moon, RefreshCcw, Sun, Trash2, Upload, X } from "lucide-react";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  COMMAND_PALETTE_GROUP_LABELS,
  getCommandPaletteCoreCommands,
} from "@/components/layout/command-palette-registry";
import { settingsSectionGroups, settingsSections, type SectionId } from "@/components/layout/settings-dialog.schema";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Slider, Textarea } from "@/components/ui";
import {
  CUSTOM_AUDIO_ACCEPTED_TYPES,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  playCustomNotificationSound,
  playNotificationSound,
  readFileAsDataUrl,
  validateCustomAudioFile,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_SDK_MODEL_OPTIONS,
  getDefaultModelForProvider,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import { BOOLEAN_TOGGLE_OPTIONS } from "@/lib/providers/runtime-option-contract";
import { resolveSidebarArtworkClass } from "@/lib/themes";
import { cn } from "@/lib/utils";
import {
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
  PRESET_THEME_TOKENS,
  SIDEBAR_ARTWORK_OPTIONS,
  THEME_TOKEN_NAMES,
  exportCustomThemeJson,
  listAllCustomThemes,
  parseCustomThemeFile,
  type SidebarArtworkMode,
  type CustomThemeDefinition,
  type ThemeModeName,
  type ThemeTokenName,
  useAppStore,
} from "@/store/app.store";
import {
  captureCurrentProjectState,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN,
  DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS,
  DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER,
  DEFAULT_PROMPT_INLINE_COMPLETION,
} from "@/lib/providers/prompt-defaults";
import {
  THINKING_PHRASE_ANIMATION_OPTIONS,
  normalizeThinkingPhraseAnimationStyle,
} from "@/lib/thinking-phrases";
import type { ResolvedWorkspaceAutomationsConfig } from "@/lib/workspace-scripts/types";
import { DeveloperSection } from "./settings-dialog-developer-section";
import { AssistantSection } from "./settings-dialog-assistant-section";
import { ProvidersSection } from "./settings-dialog-providers-section";
import { ToolingSection } from "./settings-dialog-tooling-section";
import { WorkspaceAutomationsManager } from "./WorkspaceAutomationsManager";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readFloat,
  readInt,
  SectionHeading,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";

function formatThemeTokenLabel(token: ThemeTokenName) {
  return token
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatNotificationSoundPresetLabel(preset: NotificationSoundPreset) {
  return `${preset.slice(0, 1).toUpperCase()}${preset.slice(1)}`;
}

const NOTIFICATION_SOUND_PRESET_OPTIONS: Array<{ value: NotificationSoundPreset; label: string }> = NOTIFICATION_SOUND_PRESETS.map((preset) => ({
  value: preset,
  label: formatNotificationSoundPresetLabel(preset),
}));

interface GitRemoteState {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

function parseGitRemotes(args: { stdout: string }) {
  const remoteStateByName = new Map<string, GitRemoteState>();
  const lines = args.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/i);
    if (!match) {
      continue;
    }
    const [, name, url, kind] = match;
    if (!name || !url || !kind) {
      continue;
    }
    const current = remoteStateByName.get(name) ?? {
      name,
      fetchUrl: null,
      pushUrl: null,
    };
    if (kind.toLowerCase() === "fetch") {
      current.fetchUrl = url;
    } else {
      current.pushUrl = url;
    }
    remoteStateByName.set(name, current);
  }

  return Array.from(remoteStateByName.values());
}

type DraftTextareaProps = Omit<ComponentPropsWithoutRef<typeof Textarea>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

const DraftTextarea = memo(function DraftTextarea(args: DraftTextareaProps) {
  const { value, onCommit, onBlur, ...textareaProps } = args;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Textarea
      {...textareaProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (event.target.value !== value) {
          onCommit(event.target.value);
        }
        onBlur?.(event);
      }}
    />
  );
});

function ProjectSettingsPanel(args: {
  project: RecentProjectState;
  isCurrent: boolean;
  highlighted: boolean;
  onRequestRemove: (args: { projectPath: string; projectName: string }) => void;
}) {
  const setProjectWorkspaceInitCommand = useAppStore(
    (state) => state.setProjectWorkspaceInitCommand,
  );
  const setProjectWorkspaceUseRootNodeModulesSymlink = useAppStore(
    (state) => state.setProjectWorkspaceUseRootNodeModulesSymlink,
  );
  const [currentProjectPath, activeWorkspaceId, workspacePathById] = useAppStore(
    useShallow((state) => [
      state.projectPath,
      state.activeWorkspaceId,
      state.workspacePathById,
    ] as const),
  );
  const projectWorkspaceInitCommand = normalizeProjectWorkspaceInitCommand({
    value: args.project.newWorkspaceInitCommand,
  });
  const projectUseRootNodeModulesSymlink =
    normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
      value: args.project.newWorkspaceUseRootNodeModulesSymlink,
    });
  const automationWorkspacePath = args.isCurrent
    ? workspacePathById[activeWorkspaceId] ?? currentProjectPath ?? args.project.projectPath
    : args.project.projectPath;
  const [resolvedAutomationConfig, setResolvedAutomationConfig] = useState<ResolvedWorkspaceAutomationsConfig | null>(null);
  const [repositoryRefreshNonce, setRepositoryRefreshNonce] = useState(0);
  const [repositoryState, setRepositoryState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    rootPath: string | null;
    remotes: GitRemoteState[];
    detail: string;
  }>({
    status: "idle",
    rootPath: null,
    remotes: [],
    detail: "Refreshing repository metadata...",
  });

  const loadResolvedAutomationConfig = useCallback(async () => {
    const getConfig = window.api?.automations?.getConfig;
    if (!getConfig || !args.project.projectPath || !automationWorkspacePath) {
      setResolvedAutomationConfig(null);
      return;
    }

    const result = await getConfig({
      projectPath: args.project.projectPath,
      workspacePath: automationWorkspacePath,
    });
    setResolvedAutomationConfig(result.ok ? result.config : null);
  }, [args.project.projectPath, automationWorkspacePath]);

  useEffect(() => {
    void loadResolvedAutomationConfig();
  }, [loadResolvedAutomationConfig]);

  useEffect(() => {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      setRepositoryState({
        status: "error",
        rootPath: null,
        remotes: [],
        detail: "Terminal bridge unavailable.",
      });
      return;
    }

    let cancelled = false;
    setRepositoryState((current) => ({
      ...current,
      status: "loading",
      detail: "Refreshing repository metadata...",
    }));

    void (async () => {
      const [rootResult, remoteResult] = await Promise.all([
        runCommand({
          cwd: args.project.projectPath,
          command: "git rev-parse --show-toplevel",
        }),
        runCommand({
          cwd: args.project.projectPath,
          command: "git remote -v",
        }),
      ]);
      if (cancelled) {
        return;
      }

      if (!rootResult.ok) {
        setRepositoryState({
          status: "error",
          rootPath: null,
          remotes: [],
          detail:
            rootResult.stderr?.trim()
            || "This project is unavailable or is not a git repository.",
        });
        return;
      }

      const rootPath = rootResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? args.project.projectPath;
      const remotes = remoteResult.ok
        ? parseGitRemotes({ stdout: remoteResult.stdout })
        : [];
      const detail = remoteResult.ok
        ? (remotes.length > 0
            ? `${remotes.length} remote${remotes.length === 1 ? "" : "s"} configured.`
            : "No git remotes configured.")
        : (remoteResult.stderr?.trim() || "Failed to inspect git remotes.");

      setRepositoryState({
        status: "ready",
        rootPath,
        remotes,
        detail,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [args.project.projectPath, repositoryRefreshNonce]);

  return (
    <div className={cn("space-y-4", args.highlighted && "scroll-mt-6")}>
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/80 bg-card/95 px-4 py-3 shadow-xs",
          args.highlighted && "border-primary/35 ring-1 ring-primary/20",
        )}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Project Settings</Badge>
            {args.isCurrent ? <Badge>Current</Badge> : null}
            <Badge variant="secondary">
              {args.project.workspaces.length} workspace
              {args.project.workspaces.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary">
              default: {args.project.defaultBranch}
            </Badge>
          </div>
          <div className="space-y-1">
            <h4 className="text-lg font-semibold tracking-tight">
              {args.project.projectName}
            </h4>
            <p className="text-sm text-muted-foreground">
              Review repository-specific workspace defaults, git metadata,
              automation config, and removal actions for this project.
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground break-all">
            {args.project.projectPath}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={repositoryState.status === "loading"}
            onClick={() => setRepositoryRefreshNonce((value) => value + 1)}
          >
            <RefreshCcw
              className={cn(
                "size-3.5",
                repositoryState.status === "loading" && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      <SettingsCard
        title="Repository Settings"
        description="Repository-specific defaults, git metadata, and list management for this project."
        className={cn(args.highlighted && "ring-1 ring-primary/20")}
      >
        <LabeledField
          title="Post-Create Command"
          description="Runs once in the new workspace root after creation. Useful for `bun install`, `npm install`, or multi-line bootstrap commands."
        >
          <DraftTextarea
            className="min-h-[120px] rounded-md border-border/80 bg-background font-mono text-sm"
            value={projectWorkspaceInitCommand}
            onCommit={(nextValue) =>
              setProjectWorkspaceInitCommand({
                projectPath: args.project.projectPath,
                command: nextValue,
              })}
            placeholder="bun install"
          />
        </LabeledField>

        <LabeledField
          title="Reuse Root node_modules"
          description="Creates `node_modules` in each new worktree as a symlink to the repository root install. Faster startup, but later installs in that workspace will modify the shared dependency tree."
        >
          <button
            type="button"
            aria-pressed={projectUseRootNodeModulesSymlink}
            onClick={() =>
              setProjectWorkspaceUseRootNodeModulesSymlink({
                projectPath: args.project.projectPath,
                enabled: !projectUseRootNodeModulesSymlink,
              })}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors",
              projectUseRootNodeModulesSymlink
                ? "border-primary/50 bg-primary/5"
                : "border-border/80 bg-background hover:border-border",
            )}
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Enable shared `node_modules` symlink
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The symlink exists only inside the created workspace, so deleting
                the workspace leaves the repository root untouched.
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                projectUseRootNodeModulesSymlink
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/80 text-muted-foreground",
              )}
            >
              {projectUseRootNodeModulesSymlink ? "On" : "Off"}
            </span>
          </button>
        </LabeledField>

        <LabeledField title="Repository Root Path">
          <div className="rounded-md border border-border/80 bg-background px-3 py-2.5 font-mono text-xs break-all">
            {repositoryState.rootPath ?? "Not detected"}
          </div>
        </LabeledField>

        <LabeledField
          title="Remote Status"
          description={repositoryState.detail}
        >
          {repositoryState.status === "error" ? (
            <p className="text-sm text-destructive">{repositoryState.detail}</p>
          ) : repositoryState.remotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No remotes configured.
            </p>
          ) : (
            <div className="space-y-2">
              {repositoryState.remotes.map((remote) => (
                <div
                  key={remote.name}
                  className="rounded-md border border-border/80 bg-background px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{remote.name}</p>
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      configured
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                    fetch: {remote.fetchUrl ?? "-"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                    push: {remote.pushUrl ?? remote.fetchUrl ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </LabeledField>

        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Remove project
              </p>
              <p className="text-sm text-muted-foreground">
                Removes this project from Stave&apos;s registered project list
                without deleting files on disk.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() =>
                args.onRequestRemove({
                  projectPath: args.project.projectPath,
                  projectName: args.project.projectName,
                })}
            >
              <Trash2 className="size-4" />
              Remove project
            </Button>
          </div>
        </div>
      </SettingsCard>

      <WorkspaceAutomationsManager
        projectPath={args.project.projectPath}
        workspacePath={automationWorkspacePath}
        resolvedConfig={resolvedAutomationConfig}
        onSaved={loadResolvedAutomationConfig}
      />
    </div>
  );
}

function ProjectsSection(args: { highlightedProjectPath?: string | null }) {
  const [
    projectPath,
    projectName,
    recentProjects,
    defaultBranch,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById,
    workspacePathById,
    workspaceDefaultById,
  ] = useAppStore(
    useShallow((state) => [
      state.projectPath,
      state.projectName,
      state.recentProjects,
      state.defaultBranch,
      state.workspaces,
      state.activeWorkspaceId,
      state.workspaceBranchById,
      state.workspacePathById,
      state.workspaceDefaultById,
    ] as const),
  );
  const removeProjectFromList = useAppStore((state) => state.removeProjectFromList);
  const projectMenuRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [projectToRemove, setProjectToRemove] = useState<{
    projectPath: string;
    projectName: string;
  } | null>(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const projects = useMemo(
    () =>
      captureCurrentProjectState({
        recentProjects,
        projectPath,
        projectName,
        defaultBranch,
        workspaces,
        activeWorkspaceId,
        workspaceBranchById,
        workspacePathById,
        workspaceDefaultById,
      }),
    [
      activeWorkspaceId,
      defaultBranch,
      projectName,
      projectPath,
      recentProjects,
      workspaceBranchById,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectPath(null);
      return;
    }

    const highlightedProjectPath = args.highlightedProjectPath?.trim();
    const highlightedProject = highlightedProjectPath
      ? projects.find((project) => project.projectPath === highlightedProjectPath) ?? null
      : null;

    if (highlightedProject && selectedProjectPath !== highlightedProject.projectPath) {
      setSelectedProjectPath(highlightedProject.projectPath);
      return;
    }

    if (selectedProjectPath && projects.some((project) => project.projectPath === selectedProjectPath)) {
      return;
    }

    const currentProject = projectPath
      ? projects.find((project) => project.projectPath === projectPath) ?? null
      : null;
    const fallbackProject = currentProject ?? projects[0] ?? null;

    setSelectedProjectPath(fallbackProject?.projectPath ?? null);
  }, [args.highlightedProjectPath, projectPath, projects, selectedProjectPath]);

  useEffect(() => {
    const activeProjectPath = args.highlightedProjectPath?.trim() || selectedProjectPath;
    if (!activeProjectPath) {
      return;
    }

    const node = projectMenuRefs.current[activeProjectPath];
    if (!node) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [args.highlightedProjectPath, projects.length, selectedProjectPath]);

  const selectedProject = projects.find((project) => project.projectPath === selectedProjectPath) ?? null;

  return (
    <>
      <SectionHeading
        title="Projects"
        description="Choose a registered project from the menu, then review repository-specific workspace defaults, git metadata, automation config, and removal actions."
      />
      {projects.length === 0 ? (
        <SettingsCard
          title="No Projects Yet"
          description="Open a project from the sidebar to register it here."
        >
          <p className="text-sm text-muted-foreground">
            Registered projects will show their repository defaults and
            metadata in this section.
          </p>
        </SettingsCard>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/80 bg-card/70 p-2 shadow-xs">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Project Menu
              </p>
              <Badge variant="secondary" className="h-6 px-2">
                {projects.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-1">
              {projects.map((project) => {
                const selected = selectedProjectPath === project.projectPath;
                const current = project.projectPath === projectPath;

                return (
                  <button
                    key={project.projectPath}
                    ref={(node) => {
                      projectMenuRefs.current[project.projectPath] = node;
                    }}
                    type="button"
                    onClick={() => {
                      setSelectedProjectPath(project.projectPath);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-colors",
                      selected
                        ? "border-primary/35 bg-primary/5 shadow-xs"
                        : "border-transparent bg-transparent hover:border-border/80 hover:bg-muted/50",
                    )}
                    aria-current={selected ? "true" : undefined}
                  >
                    <div className="flex w-full items-center gap-2">
                      <Folder className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {project.projectName}
                      </span>
                      {current ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                          current
                        </Badge>
                      ) : null}
                    </div>
                    <p className="w-full truncate pl-6 text-xs text-muted-foreground">
                      {project.projectPath}
                    </p>
                    <div className="flex items-center gap-2 pl-6 text-[11px] text-muted-foreground">
                      <span>{project.workspaces.length} ws</span>
                      <span>default: {project.defaultBranch}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            {selectedProject ? (
              <ProjectSettingsPanel
                project={selectedProject}
                isCurrent={selectedProject.projectPath === projectPath}
                highlighted={args.highlightedProjectPath === selectedProject.projectPath}
                onRequestRemove={setProjectToRemove}
              />
            ) : (
              <SettingsCard
                title="Project Details"
                description="Select a project from the menu to open its settings panel."
              >
                <p className="text-sm text-muted-foreground">
                  Pick a project from the menu to inspect its workspace defaults and repository metadata.
                </p>
              </SettingsCard>
            )}
          </div>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(projectToRemove)}
        title="Remove Project"
        description={
          projectToRemove
            ? `Remove "${projectToRemove.projectName}" from Stave's project list? This does not delete files on disk.`
            : ""
        }
        confirmLabel="Remove Project"
        onCancel={() => setProjectToRemove(null)}
        onConfirm={() => {
          if (!projectToRemove) {
            return;
          }
          void removeProjectFromList({
            projectPath: projectToRemove.projectPath,
          });
          setProjectToRemove(null);
        }}
      />
    </>
  );
}

function GeneralSection() {
  const [
    confirmBeforeClose,
    notificationSoundEnabled,
    notificationSoundPreset,
    notificationSoundVolume,
    notificationSoundMode,
    notificationSoundCustomAudioData,
    notificationSoundCustomAudioName,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.confirmBeforeClose,
      state.settings.notificationSoundEnabled,
      state.settings.notificationSoundPreset,
      state.settings.notificationSoundVolume,
      state.settings.notificationSoundMode,
      state.settings.notificationSoundCustomAudioData,
      state.settings.notificationSoundCustomAudioName,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const notificationSoundVolumePercent = Math.round(notificationSoundVolume * 100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCustomAudioUpload = async (file: File) => {
    setUploadError(null);
    const error = validateCustomAudioFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateSettings({
        patch: {
          notificationSoundMode: "custom",
          notificationSoundCustomAudioData: dataUrl,
          notificationSoundCustomAudioName: file.name,
        },
      });
    } catch {
      setUploadError("Failed to read the audio file.");
    }
  };

  const handleRemoveCustomAudio = () => {
    setUploadError(null);
    updateSettings({
      patch: {
        notificationSoundMode: "preset",
        notificationSoundCustomAudioData: null,
        notificationSoundCustomAudioName: null,
      },
    });
  };

  const handleTestSound = () => {
    if (notificationSoundMode === "custom" && notificationSoundCustomAudioData) {
      playCustomNotificationSound({
        dataUrl: notificationSoundCustomAudioData,
        volume: notificationSoundVolume,
      });
    } else {
      playNotificationSound({
        preset: notificationSoundPreset,
        volume: notificationSoundVolume,
      });
    }
  };

  return (
    <>
      <SectionHeading
        title="General"
        description="Global preferences for the app window and reserved future defaults."
      />
      <SectionStack>
        <SettingsCard
          title="Window Behavior"
          description="Control how the app handles the close shortcut."
        >
          <LabeledField
            title="Confirm Before Close"
            description="Show a confirmation dialog before closing the app with ⌘W / Ctrl+W when no tabs or tasks are open."
          >
            <ChoiceButtons
              value={confirmBeforeClose ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { confirmBeforeClose: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Notification Sound"
          description="Customize the success sound played when a task turn finishes."
        >
          <LabeledField
            title="Sound"
            description="Enable or mute the task completion sound."
          >
            <ChoiceButtons
              value={notificationSoundEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { notificationSoundEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          {notificationSoundEnabled ? (
            <>
              <LabeledField
                title="Source"
                description="Use a built-in preset or upload your own audio file."
              >
                <ChoiceButtons
                  value={notificationSoundMode}
                  onChange={(value) => updateSettings({ patch: { notificationSoundMode: value as "preset" | "custom" } })}
                  options={[
                    { value: "preset", label: "Preset" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </LabeledField>
              {notificationSoundMode === "preset" ? (
                <LabeledField
                  title="Preset"
                  description="Choose the synthesized tone used for task completion."
                >
                  <ChoiceButtons
                    value={notificationSoundPreset}
                    onChange={(value) => updateSettings({ patch: { notificationSoundPreset: value } })}
                    options={NOTIFICATION_SOUND_PRESET_OPTIONS}
                  />
                </LabeledField>
              ) : (
                <LabeledField
                  title="Custom Audio"
                  description={`Upload an audio file (MP3, WAV, OGG, M4A, WebM). Max ${CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024} KB.`}
                >
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={CUSTOM_AUDIO_ACCEPTED_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleCustomAudioUpload(file);
                        }
                        // Reset so the same file can be re-selected
                        e.target.value = "";
                      }}
                    />
                    {notificationSoundCustomAudioName ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/50 px-3 py-2 text-sm flex-1 min-w-0">
                          <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{notificationSoundCustomAudioName}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          Replace
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRemoveCustomAudio}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Upload Audio File
                      </Button>
                    )}
                    {uploadError ? (
                      <p className="text-sm text-destructive">{uploadError}</p>
                    ) : null}
                  </div>
                </LabeledField>
              )}
              <LabeledField
                title="Volume"
                description="Adjust playback level for the task completion sound."
              >
                <div className="flex items-center gap-3">
                  <Slider
                    aria-label="Notification sound volume"
                    className="flex-1"
                    value={[notificationSoundVolumePercent]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(values) => {
                      const nextValue = values[0];
                      if (typeof nextValue !== "number") {
                        return;
                      }
                      updateSettings({ patch: { notificationSoundVolume: nextValue / 100 } });
                    }}
                  />
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {notificationSoundVolumePercent}%
                  </Badge>
                </div>
              </LabeledField>
              <LabeledField
                title="Preview"
                description={notificationSoundMode === "custom"
                  ? "Play the uploaded audio once with the current volume."
                  : "Play the current preset once with the current volume."}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestSound}
                  disabled={notificationSoundMode === "custom" && !notificationSoundCustomAudioData}
                >
                  Test Sound
                </Button>
              </LabeledField>
            </>
          ) : null}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ThemeSection() {
  const [themeEditorMode, setThemeEditorMode] = useState<ThemeModeName>("light");
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const customThemeId = useAppStore((state) => state.settings.customThemeId);
  const sidebarArtworkMode = useAppStore(
    (state) => state.settings.sidebarArtworkMode,
  );
  const userCustomThemes = useAppStore((state) => state.settings.userCustomThemes);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const installCustomTheme = useAppStore((state) => state.installCustomTheme);
  const removeCustomTheme = useAppStore((state) => state.removeCustomTheme);

  const allThemes = useMemo(
    () => listAllCustomThemes({ userThemes: userCustomThemes }),
    [userCustomThemes],
  );
  const builtinIds = useMemo(
    () => new Set(BUILTIN_CUSTOM_THEMES.map((t) => t.id)),
    [],
  );

  return (
    <>
      <SectionHeading title="Design" description="Control theme mode, theme presets, and design token overrides." />
      <SectionStack>
        <SettingsCard title="Appearance" description="Choose how the app resolves light and dark mode.">
          <div className="grid gap-2 sm:grid-cols-3">
            <Button className="h-10 rounded-md" variant={themeMode === "light" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "light", customThemeId: null } })}>
              <Sun className="size-4" />
              Light
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "dark" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "dark", customThemeId: null } })}>
              <Moon className="size-4" />
              Dark
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "system" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "system", customThemeId: null } })}>
              <Monitor className="size-4" />
              System
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Sidebar Artwork"
          description="Choose the ambient gradient artwork behind the left sidebar. Space Haze is the default shell backdrop."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {SIDEBAR_ARTWORK_OPTIONS.map((option) => {
              const isActive = sidebarArtworkMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "grid gap-2 rounded-xl border p-3 text-left transition-colors",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                      : "border-border/70 bg-background/60 hover:border-primary/35 hover:bg-muted/30",
                  )}
                  onClick={() =>
                    updateSettings({
                      patch: {
                        sidebarArtworkMode:
                          option.value as SidebarArtworkMode,
                      },
                    })}
                >
                  <SidebarArtworkPreview
                    mode={option.value as SidebarArtworkMode}
                  />
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{option.label}</p>
                    {option.value === "space-haze" ? (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        Default
                      </Badge>
                    ) : null}
                    {isActive ? (
                      <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" />
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Theme Presets"
          description="Apply a curated palette inspired by popular VS Code themes. Presets override the base light / dark tokens; manual token tweaks below still take priority."
        >
          <div className="grid gap-3">
            {allThemes.map((theme) => (
              <CustomThemeCard
                key={theme.id}
                theme={theme}
                isActive={customThemeId === theme.id}
                isBuiltin={builtinIds.has(theme.id)}
                onSelect={() => updateSettings({ patch: { customThemeId: theme.id } })}
                onDeselect={() => updateSettings({ patch: { customThemeId: null } })}
                onRemove={builtinIds.has(theme.id) ? undefined : () => removeCustomTheme({ themeId: theme.id })}
                onExport={() => {
                  const json = exportCustomThemeJson({ theme });
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${theme.id}.theme.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            ))}
          </div>

          <ThemeImportButton
            existingIds={allThemes.map((t) => t.id)}
            userThemeCount={userCustomThemes.length}
            onInstall={(theme) => {
              const result = installCustomTheme({ theme });
              if (result.ok) {
                updateSettings({ patch: { customThemeId: theme.id } });
              }
              return result;
            }}
          />
        </SettingsCard>

        <SettingsCard
          title="Design Tokens"
          description="These are Stave's base light and dark tokens. Custom presets layer on top, and manual overrides below still win."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={themeEditorMode === "light" ? "default" : "outline"} onClick={() => setThemeEditorMode("light")}>
                Light Tokens
              </Button>
              <Button size="sm" variant={themeEditorMode === "dark" ? "default" : "outline"} onClick={() => setThemeEditorMode("dark")}>
                Dark Tokens
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const themeOverrides = useAppStore.getState().settings.themeOverrides;
                updateSettings({
                  patch: {
                    themeOverrides: {
                      ...themeOverrides,
                      [themeEditorMode]: {},
                    },
                  },
                });
              }}
            >
              Reset {themeEditorMode}
            </Button>
          </div>

          <div className="grid gap-3">
            {THEME_TOKEN_NAMES.map((token) => (
              <ThemeTokenRow key={`${themeEditorMode}-${token}`} token={token} themeEditorMode={themeEditorMode} />
            ))}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

const SidebarArtworkPreview = memo(function SidebarArtworkPreview(args: {
  mode: SidebarArtworkMode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "sidebar-liquid-glass relative h-20 overflow-hidden rounded-lg border border-sidebar-border/40 bg-sidebar/70",
        resolveSidebarArtworkClass({ mode: args.mode }),
      )}
    >
      <div className="absolute inset-x-3 top-2 h-px rounded-full bg-sidebar-border/75" />
      <div className="absolute inset-x-2 bottom-2 grid gap-1.5">
        <div className="rounded-md border border-sidebar-border/45 bg-background/20 px-2 py-1 shadow-sm">
          <div className="h-1.5 w-2/5 rounded-full bg-foreground/60" />
        </div>
        <div className="rounded-md border border-sidebar-border/60 bg-background/24 px-2 py-1 ring-1 ring-primary/20 shadow-sm backdrop-blur-sm">
          <div className="h-1.5 w-3/5 rounded-full bg-foreground/80" />
        </div>
      </div>
    </div>
  );
});

/** A visual card for a single custom theme preset. */
const CustomThemeCard = memo(function CustomThemeCard(args: {
  theme: CustomThemeDefinition;
  isActive: boolean;
  isBuiltin: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRemove?: () => void;
  onExport?: () => void;
}) {
  const { theme, isActive, isBuiltin } = args;
  const previewTokens = ["background", "foreground", "primary", "accent", "destructive", "border", "success", "warning"] as const;
  const previewColors = previewTokens.map((t) => theme.tokens[t]).filter(Boolean);

  return (
    <div
      className={cn(
        "group relative grid gap-3 rounded-xl border p-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center",
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {/* main clickable area */}
      <button
        type="button"
        className="grid gap-1.5 text-left"
        onClick={isActive ? args.onDeselect : args.onSelect}
      >
        <div className="flex items-center gap-2">
          <Contrast className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold">{theme.name}</p>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {theme.baseMode}
          </Badge>
          {!isBuiltin && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              User
            </Badge>
          )}
          {isActive && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary sm:ml-0">
              <Check className="size-3.5" />
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{theme.description}</p>
        {theme.author && (
          <p className="text-[11px] text-muted-foreground/70">
            by {theme.author}
            {theme.version ? ` \u00B7 v${theme.version}` : ""}
          </p>
        )}
      </button>

      {/* right column: swatches + action buttons */}
      <div className="flex flex-col items-end gap-2">
        {/* colour swatch strip */}
        <div className="flex items-center gap-1">
          {previewColors.map((color, i) => (
            <span
              key={i}
              className="size-6 rounded-md border border-border/50"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* action buttons */}
        <div className="flex items-center gap-1">
          {args.onExport && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); args.onExport?.(); }}
            >
              <Upload className="size-3" />
              Export
            </Button>
          )}
          {args.onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); args.onRemove?.(); }}
            >
              <Trash2 className="size-3" />
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

/** Button + file input for importing a custom theme JSON file. */
function ThemeImportButton(args: {
  existingIds: string[];
  userThemeCount: number;
  onInstall: (theme: CustomThemeDefinition) => { ok: boolean; error?: string };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected.
    e.target.value = "";

    if (file.size > 256 * 1024) {
      setImportError("File too large (max 256 KB).");
      return;
    }

    const text = await file.text();
    const result = parseCustomThemeFile({ text, existingIds: args.existingIds });
    if (!result.ok) {
      setImportError(result.errors?.join(" ") ?? "Unknown validation error.");
      return;
    }

    const installResult = args.onInstall(result.theme!);
    if (!installResult.ok) {
      setImportError(installResult.error ?? "Failed to install theme.");
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={args.userThemeCount >= MAX_USER_THEMES}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Import Theme JSON
        </Button>
        <span className="text-xs text-muted-foreground">
          {args.userThemeCount} / {MAX_USER_THEMES} user themes
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {importError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {importError}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Drop a <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.theme.json</code> file
        to install a community theme. The JSON must include <code className="rounded bg-muted px-1 py-0.5 text-[10px]">id</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">name</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">baseMode</code>, and a{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">tokens</code> map.
      </p>
    </div>
  );
}

const ThemeTokenRow = memo(function ThemeTokenRow(args: { token: ThemeTokenName; themeEditorMode: ThemeModeName }) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const overrideValue = useAppStore((state) => state.settings.themeOverrides[args.themeEditorMode][args.token] ?? "");
  const effectiveValue = overrideValue || PRESET_THEME_TOKENS[args.themeEditorMode][args.token];

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-4 lg:grid-cols-[190px_52px_1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-medium">{formatThemeTokenLabel(args.token)}</p>
        <p className="text-xs text-muted-foreground">Preset: {PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}</p>
      </div>
      <span className="size-11 rounded-lg border border-border" style={{ backgroundColor: effectiveValue }} aria-hidden="true" />
      <DraftInput
        className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
        value={overrideValue}
        placeholder={PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        onCommit={(nextValue) => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: nextValue,
                },
              },
            },
          });
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: "",
                },
              },
            },
          });
        }}
      >
        Reset
      </Button>
    </div>
  );
});

function TerminalSection() {
  const [terminalFontSize, terminalFontFamily, terminalCursorStyle, terminalLineHeight] = useAppStore(
    useShallow((state) => [
      state.settings.terminalFontSize,
      state.settings.terminalFontFamily,
      state.settings.terminalCursorStyle,
      state.settings.terminalLineHeight,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Terminal" description="Configure terminal appearance and behavior." />
      <SectionStack>
        <SettingsCard title="Typography" description="Tune readability for the integrated terminal.">
          <LabeledField title="Font Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalFontSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { terminalFontSize: readInt(nextValue, terminalFontSize) },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={terminalFontFamily}
              onCommit={(nextValue) => updateSettings({ patch: { terminalFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField title="Line Height">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalLineHeight)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { terminalLineHeight: readFloat(nextValue, terminalLineHeight) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Cursor" description="Choose the terminal cursor shape.">
          <ChoiceButtons
            value={terminalCursorStyle}
            columns={3}
            onChange={(value) => updateSettings({ patch: { terminalCursorStyle: value } })}
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Underline" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ModelsSection() {
  const [modelClaude, modelCodex] = useAppStore(
    useShallow((state) => [state.settings.modelClaude, state.settings.modelCodex] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Models" description="Set the default model routing used for new turns." />
      <SectionStack>
        <SettingsCard title="Model Routing" description="Verified model set only. Claude is limited to latest official models; Codex supports the latest Stave-supported IDs.">
          <LabeledField title="Claude">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              list="claude-model-options"
              value={modelClaude}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: {
                    modelClaude: normalizeModelSelection({
                      value: nextValue,
                      fallback: getDefaultModelForProvider({ providerId: "claude-code" }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Codex">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              list="codex-model-options"
              value={modelCodex}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: {
                    modelCodex: normalizeModelSelection({
                      value: nextValue,
                      fallback: getDefaultModelForProvider({ providerId: "codex" }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
          <datalist id="claude-model-options">
            {CLAUDE_SDK_MODEL_OPTIONS.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <datalist id="codex-model-options">
            {CODEX_SDK_MODEL_OPTIONS.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function RulesSection() {
  const [rulesPresetPrimary, rulesPresetSecondary] = useAppStore(
    useShallow((state) => [state.settings.rulesPresetPrimary, state.settings.rulesPresetSecondary] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Rules" description="Default rule presets injected into provider runs." />
      <SectionStack>
        <SettingsCard title="Rule Presets" description="Primary and secondary presets are appended to new task turns.">
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetPrimary}
            onCommit={(nextValue) => updateSettings({ patch: { rulesPresetPrimary: nextValue } })}
          />
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetSecondary}
            onCommit={(nextValue) => updateSettings({ patch: { rulesPresetSecondary: nextValue } })}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ChatSection() {
  const [smartSuggestions, chatSendPreview, chatStreamingEnabled, messageFontSize, messageCodeFontSize, messageFontFamily, messageMonoFontFamily, messageKoreanFontFamily, infoPanelScale, reasoningDefaultExpanded, thinkingPhraseAnimationStyle, claudeFastModeVisible, codexFastModeVisible] = useAppStore(
    useShallow((state) => [
      state.settings.smartSuggestions,
      state.settings.chatSendPreview,
      state.settings.chatStreamingEnabled,
      state.settings.messageFontSize,
      state.settings.messageCodeFontSize,
      state.settings.messageFontFamily,
      state.settings.messageMonoFontFamily,
      state.settings.messageKoreanFontFamily,
      state.settings.infoPanelScale,
      state.settings.reasoningDefaultExpanded,
      state.settings.thinkingPhraseAnimationStyle,
      state.settings.claudeFastModeVisible,
      state.settings.codexFastModeVisible,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Chat" description="Typography and behavior defaults for the chat message surface." />
      <SectionStack>
        <SettingsCard title="Typography" description="Font sizes and families applied to the shared chat surface.">
          <LabeledField
            title="Message Font Size"
            description="Prose font size for chat messages. Line height scales proportionally."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={12}
                max={24}
                step={1}
                value={[messageFontSize]}
                onValueChange={([value]) => updateSettings({ patch: { messageFontSize: value } })}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{messageFontSize}px</span>
            </div>
          </LabeledField>
          <LabeledField
            title="Code Font Size"
            description="Font size for inline code and code blocks in chat messages."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={10}
                max={20}
                step={1}
                value={[messageCodeFontSize]}
                onValueChange={([value]) => updateSettings({ patch: { messageCodeFontSize: value } })}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{messageCodeFontSize}px</span>
            </div>
          </LabeledField>
          <LabeledField
            title="Font Family"
            description="Base sans-serif font for chat messages. Falls back to the Korean font, then sans-serif."
          >
            <DraftInput
              value={messageFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) => updateSettings({ patch: { messageFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Mono Font Family"
            description="Monospace font for inline code and code blocks in messages."
          >
            <DraftInput
              value={messageMonoFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) => updateSettings({ patch: { messageMonoFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Korean Font Family"
            description="Fallback font for Korean (CJK) text in messages. Pretendard Variable is loaded by default."
          >
            <DraftInput
              value={messageKoreanFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) => updateSettings({ patch: { messageKoreanFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Information Panel Scale"
            description="Zoom level for the workspace information panel. Affects text, icons, buttons, and spacing uniformly."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={80}
                max={130}
                step={5}
                value={[Math.round(infoPanelScale * 100)]}
                onValueChange={([value]) => updateSettings({ patch: { infoPanelScale: (value ?? 100) / 100 } })}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{Math.round(infoPanelScale * 100)}%</span>
            </div>
          </LabeledField>
        </SettingsCard>
        <SettingsCard title="Behavior" description="Toggle chat features and display preferences.">
          <LabeledField title="Smart Suggestions">
            <ChoiceButtons
              value={smartSuggestions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { smartSuggestions: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Send Preview">
            <ChoiceButtons
              value={chatSendPreview ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { chatSendPreview: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Streaming UI">
            <ChoiceButtons
              value={chatStreamingEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { chatStreamingEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Reasoning Expanded by Default"
            description="When enabled, thinking/reasoning blocks start expanded. When disabled, they start collapsed."
          >
            <ChoiceButtons
              value={reasoningDefaultExpanded ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { reasoningDefaultExpanded: value === "on" } })}
              options={[
                { value: "on", label: "Expanded" },
                { value: "off", label: "Collapsed" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Reasoning Phrase Animation"
            description="Animation used for in-progress reasoning labels while streaming, including the rotating phrase and the Thinking label in the reasoning step."
          >
            <Select
              value={thinkingPhraseAnimationStyle}
              onValueChange={(value) => updateSettings({
                patch: { thinkingPhraseAnimationStyle: normalizeThinkingPhraseAnimationStyle(value) },
              })}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select animation" />
              </SelectTrigger>
              <SelectContent>
                {THINKING_PHRASE_ANIMATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}{option.value === "soft" ? " (Recommended)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Show Fast Mode Toggle (Claude)"
            description="Show the Fast mode toggle button when Claude is the active provider."
          >
            <ChoiceButtons
              value={claudeFastModeVisible ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeFastModeVisible: value === "on" } })}
              options={[
                { value: "on", label: "Show" },
                { value: "off", label: "Hide" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Show Fast Mode Toggle (Codex)"
            description="Show the Fast mode toggle button when Codex is the active provider."
          >
            <ChoiceButtons
              value={codexFastModeVisible ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexFastModeVisible: value === "on" } })}
              options={[
                { value: "on", label: "Show" },
                { value: "off", label: "Hide" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SkillsSection() {
  const [skillsEnabled, skillsAutoSuggest, subagentsEnabled, subagentsProfile, skillCatalog, activeWorkspaceId, projectPath, workspacePathById] = useAppStore(
    useShallow((state) => [
      state.settings.skillsEnabled,
      state.settings.skillsAutoSuggest,
      state.settings.subagentsEnabled,
      state.settings.subagentsProfile,
      state.skillCatalog,
      state.activeWorkspaceId,
      state.projectPath,
      state.workspacePathById,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath = workspacePathById[activeWorkspaceId] ?? projectPath ?? null;

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const skillCountByRootPath = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skillCatalog.skills) {
      counts.set(skill.sourceRootPath, (counts.get(skill.sourceRootPath) ?? 0) + 1);
    }
    return counts;
  }, [skillCatalog.skills]);

  const skillsByRoot = useMemo(() => {
    const groups = new Map<string, { root: (typeof skillCatalog.roots)[number] | null; skills: typeof skillCatalog.skills }>();
    for (const skill of skillCatalog.skills) {
      const key = skill.sourceRootPath;
      if (!groups.has(key)) {
        const matchingRoot = skillCatalog.roots.find((r) => r.path === key) ?? null;
        groups.set(key, { root: matchingRoot, skills: [] });
      }
      groups.get(key)!.skills.push(skill);
    }
    return groups;
  }, [skillCatalog.skills, skillCatalog.roots]);

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    if (skillCatalog.status === "loading" && skillCatalog.workspacePath === workspacePath) {
      return;
    }
    if (skillCatalog.status === "ready" && skillCatalog.workspacePath === workspacePath) {
      const CATALOG_TTL_MS = 5 * 60 * 1000;
      const fetchedAtMs = skillCatalog.fetchedAt ? Date.parse(skillCatalog.fetchedAt) : 0;
      if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
        return;
      }
    }
    void refreshSkillCatalog({ workspacePath });
  }, [refreshSkillCatalog, skillCatalog.status, skillCatalog.workspacePath, skillCatalog.fetchedAt, skillsEnabled, workspacePath]);

  return (
    <>
      <SectionHeading title="Skills" description="Configure skill discovery, subagent delegation, and automatic prompting." />
      <SectionStack>
        <SettingsCard title="Skills" description="Control skill suggestions and automatic prompting.">
          <LabeledField title="Enabled">
            <ChoiceButtons
              value={skillsEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { skillsEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Auto Suggest">
            <ChoiceButtons
              value={skillsAutoSuggest ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { skillsAutoSuggest: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard title="Subagent" description="Control whether subagents are offered by default and which profile they use.">
          <LabeledField title="Enabled">
            <ChoiceButtons
              value={subagentsEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { subagentsEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Profile">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={subagentsProfile}
              onCommit={(nextValue) => updateSettings({ patch: { subagentsProfile: nextValue } })}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Detected Skills"
          description="Stave scans global, user, and workspace-local skill roots. User roots follow the active Claude/Codex home resolution instead of hardcoded directories."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {skillCatalog.status === "loading"
                  ? "Refreshing catalog..."
                  : skillCatalog.status === "error"
                  ? "Skill discovery failed"
                  : `${skillCatalog.skills.length} skills across ${skillCatalog.roots.length} roots`}
              </p>
              <p className="text-sm text-muted-foreground">{skillCatalog.detail}</p>
              {skillCatalog.fetchedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatTaskUpdatedAt({ value: skillCatalog.fetchedAt })}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshSkillCatalog({ workspacePath })}
            >
              Refresh
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Roots</p>
            {skillCatalog.roots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill roots were discovered for the current workspace.</p>
            ) : (
              skillCatalog.roots.map((root) => (
                <div key={root.id} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{root.path}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                      {root.scope}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                      {root.provider}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {skillCountByRootPath.get(root.path) ?? 0} skills
                    </Badge>
                  </div>
                  {root.detail ? <p className="mt-1 text-xs text-muted-foreground">{root.detail}</p> : null}
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Catalog</p>
            {skillCatalog.skills.length === 0 ? (
              skillCatalog.status === "loading" ? (
                <p className="text-sm text-muted-foreground">Loading skills...</p>
              ) : (
                <p className="text-sm text-muted-foreground">No SKILL.md entries were found.</p>
              )
            ) : (
              Array.from(skillsByRoot.entries()).map(([rootPath, group]) => {
                const isCollapsed = collapsedGroups.includes(rootPath);
                return (
                  <div key={rootPath} className="rounded-lg border border-border/70 bg-background/40">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30"
                      onClick={() => {
                        setCollapsedGroups((current) =>
                          current.includes(rootPath)
                            ? current.filter((v) => v !== rootPath)
                            : [...current, rootPath],
                        );
                      }}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{rootPath}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {group.skills.length}
                        </Badge>
                        {group.root ? (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                            {group.root.scope}
                          </Badge>
                        ) : null}
                      </div>
                      {isCollapsed ? (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {!isCollapsed ? (
                      <div className="space-y-2 border-t border-border/70 px-3 py-2">
                        {group.skills.map((skill) => (
                          <div key={skill.id} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{skill.invocationToken}</span>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {skill.scope}
                              </Badge>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                {skill.provider}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{skill.path}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function CommandPaletteSection() {
  const [
    commandPaletteShowRecent,
    commandPalettePinnedCommandIds,
    commandPaletteHiddenCommandIds,
    commandPaletteRecentCommandIds,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.commandPaletteShowRecent,
      state.settings.commandPalettePinnedCommandIds,
      state.settings.commandPaletteHiddenCommandIds,
      state.settings.commandPaletteRecentCommandIds,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const commands = useMemo(() => getCommandPaletteCoreCommands(), []);

  function togglePinnedCommand(commandId: string) {
    const isPinned = commandPalettePinnedCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPalettePinnedCommandIds: isPinned
          ? commandPalettePinnedCommandIds.filter((id) => id !== commandId)
          : [...commandPalettePinnedCommandIds, commandId],
        commandPaletteHiddenCommandIds: commandPaletteHiddenCommandIds.filter((id) => id !== commandId),
      },
    });
  }

  function toggleHiddenCommand(commandId: string) {
    const isHidden = commandPaletteHiddenCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPaletteHiddenCommandIds: isHidden
          ? commandPaletteHiddenCommandIds.filter((id) => id !== commandId)
          : [...commandPaletteHiddenCommandIds, commandId],
        commandPalettePinnedCommandIds: commandPalettePinnedCommandIds.filter((id) => id !== commandId),
        commandPaletteRecentCommandIds: isHidden
          ? commandPaletteRecentCommandIds
          : commandPaletteRecentCommandIds.filter((id) => id !== commandId),
      },
    });
  }

  return (
    <>
      <SectionHeading title="Command Palette" description="Configure the global command launcher opened with Cmd/Ctrl+Shift+P. This is separate from slash commands in the chat input." />
      <SectionStack>
        <SettingsCard title="Behavior" description="Pinned commands appear first, hidden commands stay out of the palette, and recent history can be shown as its own section.">
          <LabeledField title="Recent Commands">
            <ChoiceButtons
              value={commandPaletteShowRecent ? "show" : "hide"}
              onChange={(value) => updateSettings({ patch: { commandPaletteShowRecent: value === "show" } })}
              options={[
                { value: "show", label: "Show" },
                { value: "hide", label: "Hide" },
              ]}
            />
          </LabeledField>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateSettings({ patch: { commandPaletteRecentCommandIds: [] } })}
              disabled={commandPaletteRecentCommandIds.length === 0}
            >
              Clear Recent History
            </Button>
            <Button
              variant="outline"
              onClick={() => updateSettings({
                patch: {
                  commandPalettePinnedCommandIds: [],
                  commandPaletteHiddenCommandIds: [],
                  commandPaletteRecentCommandIds: [],
                  commandPaletteShowRecent: true,
                },
              })}
              disabled={
                commandPalettePinnedCommandIds.length === 0
                && commandPaletteHiddenCommandIds.length === 0
                && commandPaletteRecentCommandIds.length === 0
                && commandPaletteShowRecent
              }
            >
              Reset Palette Settings
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Command Visibility" description="Pin the core actions you use most, or hide the ones you never want in the global palette.">
          <div className="space-y-2">
            {commands.map((command) => {
              const isPinned = commandPalettePinnedCommandIds.includes(command.id);
              const isHidden = commandPaletteHiddenCommandIds.includes(command.id);

              return (
                <div key={command.id} className="rounded-lg border border-border/70 bg-card/60 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{command.title}</p>
                        <Badge variant="outline">{COMMAND_PALETTE_GROUP_LABELS[command.group]}</Badge>
                        {command.shortcut ? <Badge variant="secondary">{command.shortcut}</Badge> : null}
                        {isPinned ? <Badge>Pinned</Badge> : null}
                        {isHidden ? <Badge variant="destructive">Hidden</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{command.description}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{command.id}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant={isPinned ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePinnedCommand(command.id)}
                      >
                        {isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        variant={isHidden ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleHiddenCommand(command.id)}
                      >
                        {isHidden ? "Show" : "Hide"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard title="Programmatic Contributors" description="The palette is backed by a registry so internal modules can add commands without coupling to the dialog component.">
          <p className="text-sm leading-6 text-muted-foreground">
            Use
            {" "}
            <code>registerCommandPaletteContributor()</code>
            {" "}
            to inject additional commands. Core Stave commands are customizable here; dynamic workspace/task entries and future contributed commands inherit the same execution surface automatically.
          </p>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function CommandsSection() {
  const [commandPolicy, commandAllowlist, customCommands] = useAppStore(
    useShallow((state) => [
      state.settings.commandPolicy,
      state.settings.commandAllowlist,
      state.settings.customCommands,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Slash Commands" description="Control Stave-local slash commands and provider passthrough behavior in the chat input." />
      <SectionStack>
        <SettingsCard title="Slash Command Defaults" description="`/stave:*` commands are handled locally by Stave. Claude-native commands are validated against the current SDK catalog before passthrough; Codex slash commands are still forwarded unchanged.">
          <LabeledField title="Command Policy">
            <ChoiceButtons
              value={commandPolicy}
              onChange={(value) => updateSettings({ patch: { commandPolicy: value } })}
              options={[
                { value: "confirm", label: "Confirm" },
                { value: "auto-safe", label: "Auto Safe" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Allowlist">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={commandAllowlist}
              onCommit={(nextValue) => updateSettings({ patch: { commandAllowlist: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Custom Commands"
            description="One per line. Format: `/stave:name = response` or `/stave:name => response`. Legacy `/name` entries are normalized into the Stave namespace."
          >
            <DraftTextarea
              className="min-h-[140px] rounded-md border-border/80 bg-background font-mono text-sm"
              value={customCommands}
              onCommit={(nextValue) => updateSettings({ patch: { customCommands: nextValue } })}
              placeholder="/stave:clear = @clear&#10;/stave:hello = Hello from {provider} ({model})&#10;/stave:stats = Users: {user_count}, Assistant: {assistant_count}"
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function EditorSection() {
  const [
    editorFontSize,
    editorFontFamily,
    editorWordWrap,
    editorMinimap,
    editorLineNumbers,
    editorTabSize,
    editorLspEnabled,
    editorAiCompletions,
    editorEslintEnabled,
    editorFormatOnSave,
    pythonLspCommand,
    typescriptLspCommand,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.editorFontSize,
      state.settings.editorFontFamily,
      state.settings.editorWordWrap,
      state.settings.editorMinimap,
      state.settings.editorLineNumbers,
      state.settings.editorTabSize,
      state.settings.editorLspEnabled,
      state.settings.editorAiCompletions,
      state.settings.editorEslintEnabled,
      state.settings.editorFormatOnSave,
      state.settings.pythonLspCommand,
      state.settings.typescriptLspCommand,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Editor" description="Configure code editor defaults used by tabs and previews." />
      <SectionStack>
        <SettingsCard title="Typography" description="Base editor type and spacing defaults.">
          <LabeledField title="Font Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={10}
              max={32}
              value={String(editorFontSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { editorFontSize: readInt(nextValue, editorFontSize) },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono"
              value={editorFontFamily}
              onCommit={(nextValue) => updateSettings({ patch: { editorFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField title="Tab Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={1}
              max={8}
              value={String(editorTabSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { editorTabSize: readInt(nextValue, editorTabSize) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Display" description="Toggle editor line wrapping and chrome.">
          <LabeledField title="Word Wrap">
            <ChoiceButtons
              value={editorWordWrap ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorWordWrap: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Line Numbers">
            <ChoiceButtons
              value={editorLineNumbers}
              columns={3}
              onChange={(value) => updateSettings({ patch: { editorLineNumbers: value } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
                { value: "relative", label: "Relative" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Minimap">
            <ChoiceButtons
              value={editorMinimap ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorMinimap: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="AI Inline Completions"
          description="Ghost-text code suggestions powered by Claude. Uses the Claude SDK with your local Claude auth when available, or falls back to the Anthropic API (requires ANTHROPIC_API_KEY)."
        >
          <LabeledField
            title="Enable AI Completions"
            description="Shows AI-generated inline suggestions as you type. Press Tab to accept. Uses Claude Haiku for fast, low-cost completions."
          >
            <ChoiceButtons
              value={editorAiCompletions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorAiCompletions: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Project Language Servers"
          description="LSP-backed intelligence for TypeScript/JavaScript and Python. Uses Electron-managed stdio language-server sessions per active workspace."
        >
          <LabeledField
            title="Enable LSP Runtime"
            description="Uses Electron-managed stdio language-server sessions per active workspace. Keep this off if you only want Monaco's built-in syntax support."
          >
            <ChoiceButtons
              value={editorLspEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorLspEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="TypeScript LSP Command"
            description="Leave empty to auto-discover `typescript-language-server` from PATH. Install via `npm i -g typescript-language-server typescript`. Handles .ts, .tsx, .js, and .jsx files."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
              placeholder="typescript-language-server"
              value={typescriptLspCommand}
              onCommit={(nextValue) => updateSettings({ patch: { typescriptLspCommand: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Python LSP Command"
            description="Leave empty to auto-discover `pyright-langserver` or `basedpyright-langserver` from PATH. You can also point this at an absolute executable path."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
              placeholder="pyright-langserver"
              value={pythonLspCommand}
              onCommit={(nextValue) => updateSettings({ patch: { pythonLspCommand: nextValue } })}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard title="ESLint">
          <LabeledField
            title="Enable ESLint"
            description="Reads ESLint config from the opened project and shows diagnostics in the editor. Requires ESLint installed in the project's node_modules."
          >
            <ChoiceButtons
              value={editorEslintEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorEslintEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Format on Save"
            description="Automatically apply ESLint auto-fix when saving a file."
          >
            <ChoiceButtons
              value={editorFormatOnSave ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { editorFormatOnSave: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

export function SettingsDialogSectionContent(args: {
  sectionId: SectionId;
  highlightedProjectPath?: string | null;
}) {
  switch (args.sectionId) {
    case "general":
      return <GeneralSection />;
    case "projects":
      return (
        <ProjectsSection highlightedProjectPath={args.highlightedProjectPath} />
      );
    case "theme":
      return <ThemeSection />;
    case "terminal":
      return <TerminalSection />;
    case "chat":
      return <ChatSection />;
    case "assistant":
      return <AssistantSection />;
    case "tooling":
      return <ToolingSection />;
    case "skills":
      return <SkillsSection />;
    case "commandPalette":
      return <CommandPaletteSection />;
    case "commands":
      return <CommandsSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "prompts":
      return <PromptsSection />;
    case "developer":
      return <DeveloperSection />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Prompts section – customisable AI prompt templates
// ---------------------------------------------------------------------------

interface PromptFieldProps {
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onCommit: (value: string) => void;
}

function PromptField({ title, description, value, defaultValue, onCommit }: PromptFieldProps) {
  const [draft, setDraft] = useState(value);
  const isDefault = draft === defaultValue;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleBlur() {
    if (draft !== value) {
      onCommit(draft);
    }
  }

  function handleReset() {
    setDraft(defaultValue);
    onCommit(defaultValue);
  }

  return (
    <LabeledField title={title} description={description}>
      <Textarea
        className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
        placeholder="(empty = disabled)"
      />
      <div className="flex items-center justify-between">
        <p className={cn("text-xs", isDefault ? "text-muted-foreground" : "text-primary")}>
          {isDefault ? "Using default" : "Customised"}
        </p>
        {!isDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleReset}
          >
            <RefreshCcw className="size-3" />
            Reset to default
          </Button>
        )}
      </div>
    </LabeledField>
  );
}

function PromptsSection() {
  const [
    promptResponseStyle,
    promptPrDescription,
    promptSupervisorBreakdown,
    promptSupervisorSynthesis,
    promptPreprocessorClassifier,
    promptInlineCompletion,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.promptResponseStyle,
      state.settings.promptPrDescription,
      state.settings.promptSupervisorBreakdown,
      state.settings.promptSupervisorSynthesis,
      state.settings.promptPreprocessorClassifier,
      state.settings.promptInlineCompletion,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Prompts"
        description="Customise the AI prompts used by Stave for automated features. Each field has a sensible default; leave empty to disable."
      />

      <SectionStack>
        <SettingsCard
          title="Response Style"
          description="Formatting guidance injected into every Claude and Codex turn. Controls how the model structures its answers — headings, bullet lists, conciseness, etc."
        >
          <PromptField
            title="Response Formatting Rules"
            description="Appended to the system prompt (Claude) or prepended to the user prompt (Codex). Empty disables the injection."
            value={promptResponseStyle}
            defaultValue={DEFAULT_PROMPT_RESPONSE_STYLE}
            onCommit={(v) => updateSettings({ patch: { promptResponseStyle: v } })}
          />
        </SettingsCard>

        <SettingsCard
          title="Pull Request Description"
          description="Template used when Stave auto-generates a PR title and body from the branch diff."
        >
          <PromptField
            title="PR Description Prompt"
            description="The instruction part of the prompt. Branch context (diff, commit log, file list) is appended automatically."
            value={promptPrDescription}
            defaultValue={DEFAULT_PROMPT_PR_DESCRIPTION}
            onCommit={(v) => updateSettings({ patch: { promptPrDescription: v } })}
          />
        </SettingsCard>

        <SettingsCard
          title="Stave Auto — Orchestration"
          description="Prompts used by the Stave meta-provider for task breakdown and result synthesis."
        >
          <PromptField
            title="Supervisor Breakdown"
            description="Instructs the supervisor how to decompose a request into subtasks. Use {maxSubtasks} and {providerNote} placeholders for dynamic values."
            value={promptSupervisorBreakdown}
            defaultValue={DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN}
            onCommit={(v) => updateSettings({ patch: { promptSupervisorBreakdown: v } })}
          />
          <PromptField
            title="Supervisor Synthesis"
            description="Instructs the supervisor how to merge subtask results into a final response."
            value={promptSupervisorSynthesis}
            defaultValue={DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS}
            onCommit={(v) => updateSettings({ patch: { promptSupervisorSynthesis: v } })}
          />
          <PromptField
            title="Preprocessor Classifier"
            description="Classifies user intent for direct routing vs orchestration. Use {orchestrationGuidance} for mode-aware phrasing."
            value={promptPreprocessorClassifier}
            defaultValue={DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER}
            onCommit={(v) => updateSettings({ patch: { promptPreprocessorClassifier: v } })}
          />
        </SettingsCard>

        <SettingsCard
          title="Inline Code Completion"
          description="System prompt for the FIM (fill-in-the-middle) code completion engine in the editor."
        >
          <PromptField
            title="Completion System Prompt"
            description="Controls how the model generates code completions. Must instruct the model to output raw code only."
            value={promptInlineCompletion}
            defaultValue={DEFAULT_PROMPT_INLINE_COMPLETION}
            onCommit={(v) => updateSettings({ patch: { promptInlineCompletion: v } })}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
