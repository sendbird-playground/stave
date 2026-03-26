import { memo, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { Bot, Code2, Cog, Globe, KeyRound, Monitor, Moon, Palette, RefreshCcw, ScrollText, SearchCheck, Shield, Sun, TerminalSquare, TriangleAlert, Wrench } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLAUDE_SDK_MODEL_OPTIONS,
  CODEX_SDK_MODEL_OPTIONS,
  getDefaultModelForProvider,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import {
  buildStaveAutoModelSettingsPatch,
  DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  detectStaveAutoModelPreset,
  STAVE_AUTO_MODEL_PRESETS,
} from "@/lib/providers/stave-auto-profile";

// All real (non-meta) model IDs available for Stave routing rule overrides
const STAVE_ROUTING_MODEL_OPTIONS = [...CLAUDE_SDK_MODEL_OPTIONS, ...CODEX_SDK_MODEL_OPTIONS] as const;
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PRESET_THEME_TOKENS,
  PROVIDER_TIMEOUT_OPTIONS,
  THEME_TOKEN_NAMES,
  type ThemeModeName,
  type ThemeTokenName,
  useAppStore,
} from "@/store/app.store";

export const settingsSections = [
  { id: "general", label: "General", icon: Cog },
  { id: "theme", label: "Design", icon: Palette },
  { id: "chat", label: "Chat", icon: Bot },
  { id: "providers", label: "Providers", icon: Wrench },
  { id: "subagents", label: "Subagent", icon: Wrench },
  { id: "skills", label: "Skills", icon: SearchCheck },
  { id: "commands", label: "Command", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "developer", label: "Developer", icon: Wrench },
] as const;

export type SectionId = (typeof settingsSections)[number]["id"];

export const settingsSectionGroups: Array<{ label: string; ids: SectionId[] }> = [
  { label: "Workspace", ids: ["general", "theme", "editor", "terminal"] },
  { label: "Agents", ids: ["chat", "providers"] },
  { label: "Automation", ids: ["subagents", "skills", "commands", "developer"] },
];

function readInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatChatFontSizeLabel(size: "base" | "lg" | "xl") {
  if (size === "xl") {
    return "Extra Large · 20px";
  }
  if (size === "lg") {
    return "Large · 18px";
  }
  return "Base · 16px";
}

function formatThemeTokenLabel(token: ThemeTokenName) {
  return token
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatProviderTimeoutLabel(value: number) {
  const minutes = Math.round(value / 60000);
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? `${hours} hour` : `${hours} hours`;
  }
  return `${minutes} min`;
}

interface GpuStatusSnapshot {
  hardwareAccelerationEnabled: boolean;
  featureStatus: Record<string, string>;
}

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

function SectionHeading(args: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-2xl font-semibold tracking-tight">{args.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{args.description}</p>
    </div>
  );
}

function SectionStack(args: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4">{args.children}</section>;
}

function SettingsCard(args: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/80 bg-card/90 shadow-xs", args.className)}>
      <CardHeader className="pb-2.5">
        <CardTitle className="text-base">{args.title}</CardTitle>
        {args.description ? <CardDescription>{args.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3.5">{args.children}</CardContent>
    </Card>
  );
}

function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className={cn("grid gap-2", args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {args.options.map((option) => (
        <Button
          key={option.value}
          className="h-9 rounded-md"
          variant={args.value === option.value ? "default" : "outline"}
          onClick={() => args.onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function LabeledField(args: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <p className="text-sm font-medium">{args.title}</p>
        {args.description ? <p className="text-sm text-muted-foreground">{args.description}</p> : null}
      </div>
      {args.children}
    </div>
  );
}

type DraftInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

const DraftInput = memo(function DraftInput(args: DraftInputProps) {
  const { value, onCommit, onBlur, onKeyDown, ...inputProps } = args;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (nextValue: string) => {
    if (nextValue === value) {
      return;
    }
    onCommit(nextValue);
  };

  return (
    <Input
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
        }
        onKeyDown?.(event);
      }}
    />
  );
});

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

function GeneralSection() {
  const [language, confirmBeforeClose, projectPath, recentProjects, activeWorkspaceId, workspacePathById] = useAppStore(
    useShallow((state) => [
      state.settings.language,
      state.settings.confirmBeforeClose,
      state.projectPath,
      state.recentProjects,
      state.activeWorkspaceId,
      state.workspacePathById,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setProjectWorkspaceInitCommand = useAppStore((state) => state.setProjectWorkspaceInitCommand);
  const projectWorkspaceInitCommand = (projectPath
    ? recentProjects.find((project) => project.projectPath === projectPath)?.newWorkspaceInitCommand
    : ""
  ) ?? "";
  const repositoryLookupCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
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
    detail: "Open a project to inspect repository details.",
  });

  useEffect(() => {
    if (!projectPath) {
      setRepositoryState({
        status: "idle",
        rootPath: null,
        remotes: [],
        detail: "Open a project to inspect repository details.",
      });
      return;
    }

    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand || !repositoryLookupCwd) {
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
          cwd: repositoryLookupCwd,
          command: "git rev-parse --show-toplevel",
        }),
        runCommand({
          cwd: repositoryLookupCwd,
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
          detail: rootResult.stderr?.trim() || "Current project is not a git repository.",
        });
        return;
      }

      const rootPath = rootResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? projectPath;
      const remotes = remoteResult.ok ? parseGitRemotes({ stdout: remoteResult.stdout }) : [];
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
  }, [projectPath, repositoryLookupCwd, repositoryRefreshNonce]);

  return (
    <>
      <SectionHeading title="General" description="Global preferences plus per-repository workspace defaults." />
      <SectionStack>
        <SettingsCard title="Language" description="Reserved for future localization support.">
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={language}
            onCommit={(nextValue) => updateSettings({ patch: { language: nextValue } })}
          />
        </SettingsCard>
        <SettingsCard
          title="Repository Workspace Defaults"
          description="Each repository can keep its own post-create bootstrap command for new worktree workspaces."
        >
          <LabeledField
            title="Post-Create Command"
            description="Runs once in the new workspace root after creation. Useful for `bun install`, `npm install`, or multi-line bootstrap commands."
          >
            <DraftTextarea
              className="min-h-[120px] rounded-md border-border/80 bg-background font-mono text-sm"
              value={projectWorkspaceInitCommand}
              onCommit={(nextValue) => setProjectWorkspaceInitCommand({ command: nextValue })}
              placeholder="bun install"
              disabled={!projectPath}
            />
          </LabeledField>
          {projectPath ? (
            <p className="text-xs text-muted-foreground">
              Current repository: <span className="font-mono">{projectPath}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Open a project to configure this value.</p>
          )}
        </SettingsCard>
        <SettingsCard
          title="Repository Metadata"
          description="Quick inspection of the active repository root path and remote configuration."
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{repositoryState.detail}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={!projectPath || repositoryState.status === "loading"}
              onClick={() => setRepositoryRefreshNonce((value) => value + 1)}
            >
              <RefreshCcw className={cn("size-3.5", repositoryState.status === "loading" ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>
          <LabeledField title="Repository Root Path">
            <div className="rounded-md border border-border/80 bg-background px-3 py-2.5 font-mono text-xs break-all">
              {repositoryState.rootPath ?? "Not detected"}
            </div>
          </LabeledField>
          <LabeledField title="Remote Status">
            {repositoryState.status === "error" ? (
              <p className="text-sm text-destructive">{repositoryState.detail}</p>
            ) : repositoryState.remotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No remotes configured.</p>
            ) : (
              <div className="space-y-2">
                {repositoryState.remotes.map((remote) => (
                  <div key={remote.name} className="rounded-md border border-border/80 bg-background px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{remote.name}</p>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">configured</Badge>
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
        </SettingsCard>
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
      </SectionStack>
    </>
  );
}

function ThemeSection() {
  const [themeEditorMode, setThemeEditorMode] = useState<ThemeModeName>("light");
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Design" description="Control theme mode and the shadcn token values that shape the interface." />
      <SectionStack>
        <SettingsCard title="Appearance" description="Choose how the app resolves light and dark mode.">
          <div className="grid gap-2 sm:grid-cols-3">
            <Button className="h-10 rounded-md" variant={themeMode === "light" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "light" } })}>
              <Sun className="size-4" />
              Light
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "dark" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "dark" } })}>
              <Moon className="size-4" />
              Dark
            </Button>
            <Button className="h-10 rounded-md" variant={themeMode === "system" ? "default" : "outline"} onClick={() => updateSettings({ patch: { themeMode: "system" } })}>
              <Monitor className="size-4" />
              System
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Design Tokens"
          description="Defaults follow `bunx --bun shadcn@latest init --preset bNQ7GS20w`. Override any token below."
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
  const [smartSuggestions, chatSendPreview, chatStreamingEnabled, messageFontSize, messageCodeFontSize, messageFontFamily, messageMonoFontFamily, messageKoreanFontFamily, reasoningDefaultExpanded, claudeFastModeVisible, codexFastModeVisible] = useAppStore(
    useShallow((state) => [
      state.settings.smartSuggestions,
      state.settings.chatSendPreview,
      state.settings.chatStreamingEnabled,
      state.settings.messageFontSize,
      state.settings.messageCodeFontSize,
      state.settings.messageFontFamily,
      state.settings.messageMonoFontFamily,
      state.settings.messageKoreanFontFamily,
      state.settings.reasoningDefaultExpanded,
      state.settings.claudeFastModeVisible,
      state.settings.codexFastModeVisible,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Chat" description="Adjust how the compose box and message stream behave." />
      <SectionStack>
        <SettingsCard title="Chat Defaults" description="These apply to the shared chat surface across tasks.">
          <LabeledField
            title="Message Font Size"
            description="Controls the prose size for chat messages. Tailwind sizes are shown with their exact pixel value."
          >
            <ChoiceButtons
              value={messageFontSize}
              columns={3}
              onChange={(value) => updateSettings({ patch: { messageFontSize: value } })}
              options={[
                { value: "base", label: formatChatFontSizeLabel("base") },
                { value: "lg", label: formatChatFontSizeLabel("lg") },
                { value: "xl", label: formatChatFontSizeLabel("xl") },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Message Code Font Size"
            description="Controls inline code and code blocks in chat messages. Default is Base · 16px."
          >
            <ChoiceButtons
              value={messageCodeFontSize}
              columns={3}
              onChange={(value) => updateSettings({ patch: { messageCodeFontSize: value } })}
              options={[
                { value: "base", label: formatChatFontSizeLabel("base") },
                { value: "lg", label: formatChatFontSizeLabel("lg") },
                { value: "xl", label: formatChatFontSizeLabel("xl") },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Message Font Family"
            description="Base sans-serif font for chat messages. Falls back to the Korean font, then sans-serif."
          >
            <DraftInput
              value={messageFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) => updateSettings({ patch: { messageFontFamily: nextValue } })}
            />
          </LabeledField>
          <LabeledField
            title="Message Mono Font Family"
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
            description="When enabled, thinking/reasoning blocks in messages are expanded by default. When disabled, they start collapsed."
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

function PermissionsSection() {
  const permissionMode = useAppStore((state) => state.settings.permissionMode);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Permissions" description="Choose the baseline approval policy used for new tasks." />
      <SectionStack>
        <SettingsCard title="Permission Defaults" description="This sets the general Stave-side permission mode.">
          <ChoiceButtons
            value={permissionMode}
            onChange={(value) => updateSettings({ patch: { permissionMode: value } })}
            options={[
              { value: "require-approval", label: "Require Approval" },
              { value: "auto-safe", label: "Auto Approve Safe" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SubagentsSection() {
  const [subagentsEnabled, subagentsProfile] = useAppStore(
    useShallow((state) => [state.settings.subagentsEnabled, state.settings.subagentsProfile] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Subagent" description="Default behavior for skill and helper-agent delegation." />
      <SectionStack>
        <SettingsCard title="Subagent Defaults" description="Control whether subagents are offered by default and which profile they use.">
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
      </SectionStack>
    </>
  );
}

function SkillsSection() {
  const [skillsEnabled, skillsAutoSuggest, skillCatalog, activeWorkspaceId, projectPath, workspacePathById] = useAppStore(
    useShallow((state) => [
      state.settings.skillsEnabled,
      state.settings.skillsAutoSuggest,
      state.skillCatalog,
      state.activeWorkspaceId,
      state.projectPath,
      state.workspacePathById,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath = workspacePathById[activeWorkspaceId] ?? projectPath ?? null;

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    if (skillCatalog.status === "loading" && skillCatalog.workspacePath === workspacePath) {
      return;
    }
    if (skillCatalog.status === "ready" && skillCatalog.workspacePath === workspacePath) {
      return;
    }
    void refreshSkillCatalog({ workspacePath });
  }, [refreshSkillCatalog, skillCatalog.status, skillCatalog.workspacePath, skillsEnabled, workspacePath]);

  return (
    <>
      <SectionHeading title="Skills" description="Configure discovery and auto-suggestion of installed skills." />
      <SectionStack>
        <SettingsCard title="Skills Defaults" description="These settings control skill suggestions and automatic prompting.">
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
                  </div>
                  {root.detail ? <p className="mt-1 text-xs text-muted-foreground">{root.detail}</p> : null}
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Catalog</p>
            {skillCatalog.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No `SKILL.md` entries were found.</p>
            ) : (
              skillCatalog.skills.slice(0, 18).map((skill) => (
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
                </div>
              ))
            )}
            {skillCatalog.skills.length > 18 ? (
              <p className="text-xs text-muted-foreground">
                Showing the first 18 skills. Use the `$` selector in the composer to search the full catalog.
              </p>
            ) : null}
          </div>
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
      <SectionHeading title="Command" description="Control Stave-local slash commands and provider passthrough behavior." />
      <SectionStack>
        <SettingsCard title="Command Defaults" description="`/stave:*` commands are handled locally by Stave. Claude-native commands are validated against the current SDK catalog before passthrough; Codex slash commands are still forwarded unchanged.">
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

function ReviewSection() {
  const [reviewStrictMode, reviewChecklistPreset] = useAppStore(
    useShallow((state) => [state.settings.reviewStrictMode, state.settings.reviewChecklistPreset] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Review" description="Review-mode defaults used for code and change review flows." />
      <SectionStack>
        <SettingsCard title="Review Defaults" description="Tighten review output or switch to a different checklist preset.">
          <LabeledField title="Strict Mode">
            <ChoiceButtons
              value={reviewStrictMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { reviewStrictMode: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Checklist Preset">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={reviewChecklistPreset}
              onCommit={(nextValue) => updateSettings({ patch: { reviewChecklistPreset: nextValue } })}
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
    pythonLspCommand,
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
      state.settings.pythonLspCommand,
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
          description="Ghost-text code suggestions powered by Claude. Requires the ANTHROPIC_API_KEY environment variable to be set."
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
          description="Optional LSP-backed intelligence for non-TypeScript languages. Python is supported first through a `pyright-langserver`-compatible server."
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
      </SectionStack>
    </>
  );
}

function StaveAutoCard() {
  const [
    staveAutoClassifierModel,
    staveAutoSupervisorModel,
    staveAutoPlanModel,
    staveAutoAnalyzeModel,
    staveAutoImplementModel,
    staveAutoQuickEditModel,
    staveAutoGeneralModel,
    staveAutoVerifyModel,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoMaxParallelSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.staveAutoClassifierModel,
      state.settings.staveAutoSupervisorModel,
      state.settings.staveAutoPlanModel,
      state.settings.staveAutoAnalyzeModel,
      state.settings.staveAutoImplementModel,
      state.settings.staveAutoQuickEditModel,
      state.settings.staveAutoGeneralModel,
      state.settings.staveAutoVerifyModel,
      state.settings.staveAutoOrchestrationMode,
      state.settings.staveAutoMaxSubtasks,
      state.settings.staveAutoMaxParallelSubtasks,
      state.settings.staveAutoAllowCrossProviderWorkers,
      state.settings.staveAutoFastMode,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const currentPresetId = detectStaveAutoModelPreset({
    settings: {
      staveAutoClassifierModel,
      staveAutoSupervisorModel,
      staveAutoPlanModel,
      staveAutoAnalyzeModel,
      staveAutoImplementModel,
      staveAutoQuickEditModel,
      staveAutoGeneralModel,
      staveAutoVerifyModel,
    },
  });
  const currentPreset = STAVE_AUTO_MODEL_PRESETS.find((preset) => preset.id === currentPresetId) ?? null;
  const fallbackPreset = buildStaveAutoModelSettingsPatch({
    presetId: currentPresetId ?? DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  });

  return (
    <SettingsCard
      title="Stave Auto"
      description="Role-based defaults for Stave Auto. Apply a preset for a full role map, then fine-tune any individual model below."
    >
      <LabeledField
        title="Model Preset"
        description="Applying a preset rewrites every Stave Auto role model at once."
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {STAVE_AUTO_MODEL_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                className="h-auto min-h-20 items-start justify-start whitespace-normal px-4 py-3 text-left"
                variant={currentPresetId === preset.id ? "default" : "outline"}
                onClick={() => updateSettings({ patch: buildStaveAutoModelSettingsPatch({ presetId: preset.id }) })}
              >
                <div className="w-full space-y-1">
                  <p className="text-sm font-medium">{preset.label}</p>
                  <p className="text-xs opacity-80">{preset.description}</p>
                </div>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
            <Badge variant={currentPreset ? "default" : "secondary"}>
              {currentPreset ? `Current: ${currentPreset.label}` : "Current: Custom"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {currentPreset
                ? currentPreset.description
                : "Manual overrides are active. Pick a preset again to reapply a full Stave Auto model map."}
            </p>
          </div>
        </div>
      </LabeledField>
      <LabeledField title="Orchestration Mode" description="Off = direct routing only. Auto = orchestrate only when needed. Aggressive = bias toward multi-step workflows.">
        <Select
          value={staveAutoOrchestrationMode}
          onValueChange={(value) =>
            updateSettings({
              patch: { staveAutoOrchestrationMode: value as "off" | "auto" | "aggressive" },
            })}
        >
          <SelectTrigger className="h-10 rounded-md border-border/80 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">off</SelectItem>
            <SelectItem value="auto">auto</SelectItem>
            <SelectItem value="aggressive">aggressive</SelectItem>
          </SelectContent>
        </Select>
      </LabeledField>
      <LabeledField title="Fast Mode" description="Requests fast execution for Stave Auto turns. It is only applied to providers whose fast mode is available in this workspace.">
        <ChoiceButtons
          value={staveAutoFastMode ? "on" : "off"}
          onChange={(value) => updateSettings({ patch: { staveAutoFastMode: value === "on" } })}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </LabeledField>
      <LabeledField title="Supervisor Model" description="Used for orchestration planning and synthesis. Default: claude-opus-4-6.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoSupervisorModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoSupervisorModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoSupervisorModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Plan Model" description="Used for strategy, design, and plan-only requests.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoPlanModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoPlanModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoPlanModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Analyze Model" description="Used for debugging, review, explanation, architecture, and root-cause analysis.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoAnalyzeModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoAnalyzeModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoAnalyzeModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Implement Model" description="Used for feature work, code generation, patching, refactors, and test writing.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoImplementModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoImplementModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoImplementModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Quick Edit Model" description="Used for rename, typo, and tiny targeted edits.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoQuickEditModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoQuickEditModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoQuickEditModel }) } })}
        />
      </LabeledField>
      <LabeledField title="General Model" description="Used when the request does not strongly match another role.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoGeneralModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoGeneralModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoGeneralModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Verify Model" description="Used for validation, sanity checks, and review after implementation.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoVerifyModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoVerifyModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoVerifyModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Classifier Model" description="Lightweight model that decides whether to route directly or orchestrate.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          list="stave-auto-model-options"
          value={staveAutoClassifierModel}
          onCommit={(value) => updateSettings({ patch: { staveAutoClassifierModel: normalizeModelSelection({ value, fallback: fallbackPreset.staveAutoClassifierModel }) } })}
        />
      </LabeledField>
      <LabeledField title="Max Subtasks" description="Upper bound for supervisor-generated subtasks per orchestration run.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxSubtasks)}
          onCommit={(value) =>
            updateSettings({ patch: { staveAutoMaxSubtasks: Math.min(8, Math.max(1, readInt(value, 3))) } })}
        />
      </LabeledField>
      <LabeledField title="Max Parallel Subtasks" description="How many independent subtasks Stave may execute at the same time.">
        <DraftInput
          className="h-10 rounded-md border-border/80 bg-background"
          value={String(staveAutoMaxParallelSubtasks)}
          onCommit={(value) =>
            updateSettings({ patch: { staveAutoMaxParallelSubtasks: Math.min(8, Math.max(1, readInt(value, 2))) } })}
        />
      </LabeledField>
      <LabeledField title="Cross-Provider Workers" description="Allow orchestration to mix Claude and Codex workers in the same request.">
        <ChoiceButtons
          value={staveAutoAllowCrossProviderWorkers ? "on" : "off"}
          onChange={(value) => updateSettings({ patch: { staveAutoAllowCrossProviderWorkers: value === "on" } })}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </LabeledField>
      <datalist id="stave-auto-model-options">
        {STAVE_ROUTING_MODEL_OPTIONS.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
    </SettingsCard>
  );
}

function ProvidersSection() {
  const [
    providerTimeoutMs,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudeFastMode,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexNetworkAccessEnabled,
    codexApprovalPolicy,
    codexModelReasoningEffort,
    codexWebSearchMode,
    codexShowRawAgentReasoning,
    codexReasoningSummary,
    codexSupportsReasoningSummaries,
    codexFastMode,
  ] = useAppStore(
    useShallow((state) => [
      state.settings.providerTimeoutMs,
      state.settings.claudePermissionMode,
      state.settings.claudeAllowDangerouslySkipPermissions,
      state.settings.claudeSandboxEnabled,
      state.settings.claudeAllowUnsandboxedCommands,
      state.settings.claudeEffort,
      state.settings.claudeThinkingMode,
      state.settings.claudeAgentProgressSummaries,
      state.settings.claudeFastMode,
      state.settings.codexSandboxMode,
      state.settings.codexSkipGitRepoCheck,
      state.settings.codexNetworkAccessEnabled,
      state.settings.codexApprovalPolicy,
      state.settings.codexModelReasoningEffort,
      state.settings.codexWebSearchMode,
      state.settings.codexShowRawAgentReasoning,
      state.settings.codexReasoningSummary,
      state.settings.codexSupportsReasoningSummaries,
      state.settings.codexFastMode,
    ] as const),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading title="Providers" description="Runtime controls for Claude and Codex execution behavior." />
      <SectionStack>
        <SettingsCard
          title="Provider Timeout"
          description="Maximum time to wait for a Claude or Codex SDK response before showing a timeout error."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(providerTimeoutMs)}
              onValueChange={(value) => updateSettings({ patch: { providerTimeoutMs: readInt(value, providerTimeoutMs) } })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TIMEOUT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {formatProviderTimeoutLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{formatProviderTimeoutLabel(providerTimeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS)}</span>
          </div>
        </SettingsCard>

        <SettingsCard title="Claude Runtime Controls" description="Permission, sandbox, thinking, and subagent progress behavior passed into each Claude turn.">
          <LabeledField title="Permission Mode">
            <Select
              value={claudePermissionMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudePermissionMode: value as "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="acceptEdits">acceptEdits</SelectItem>
                <SelectItem value="bypassPermissions">bypassPermissions</SelectItem>
                <SelectItem value="plan">plan</SelectItem>
                <SelectItem value="dontAsk">dontAsk</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Dangerous Skip Permissions">
            <ChoiceButtons
              value={claudeAllowDangerouslySkipPermissions ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowDangerouslySkipPermissions: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Sandbox Enabled">
            <ChoiceButtons
              value={claudeSandboxEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeSandboxEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Allow Unsandboxed Commands">
            <ChoiceButtons
              value={claudeAllowUnsandboxedCommands ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAllowUnsandboxedCommands: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Thinking Mode">
            <Select
              value={claudeThinkingMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeThinkingMode: value as "adaptive" | "enabled" | "disabled",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adaptive">adaptive</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Effort">
            <Select
              value={claudeEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeEffort: value as "low" | "medium" | "high" | "max",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="max">max</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Agent Progress Summaries"
            description="Enables Claude SDK `task_progress.summary` updates for running subagents."
          >
            <ChoiceButtons
              value={claudeAgentProgressSummaries ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeAgentProgressSummaries: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Claude's /fast mode, which uses Haiku for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={claudeFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { claudeFastMode: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard title="Codex Runtime Controls" description="Per-turn Codex sandbox, approval, reasoning, and web-search settings.">
          <LabeledField title="Network Access">
            <ChoiceButtons
              value={codexNetworkAccessEnabled ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexNetworkAccessEnabled: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Skip Git Repo Check"
            description="Allows Codex turns to run in folders that are not Git repositories."
          >
            <ChoiceButtons
              value={codexSkipGitRepoCheck ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexSkipGitRepoCheck: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField title="Sandbox Mode">
            <Select
              value={codexSandboxMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSandboxMode: value as "read-only" | "workspace-write" | "danger-full-access",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read-only">read-only</SelectItem>
                <SelectItem value="workspace-write">workspace-write</SelectItem>
                <SelectItem value="danger-full-access">danger-full-access</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Approval Policy">
            <Select
              value={codexApprovalPolicy}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexApprovalPolicy: value as "never" | "on-request" | "on-failure" | "untrusted",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">never</SelectItem>
                <SelectItem value="on-request">on-request</SelectItem>
                <SelectItem value="on-failure">on-failure</SelectItem>
                <SelectItem value="untrusted">untrusted</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Reasoning Effort">
            <Select
              value={codexModelReasoningEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexModelReasoningEffort: value as "minimal" | "low" | "medium" | "high" | "xhigh",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">minimal</SelectItem>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="xhigh">xhigh</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Reasoning Summary"
            description="Codex config for model-side reasoning summaries when supported."
          >
            <Select
              value={codexReasoningSummary}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexReasoningSummary: value as "auto" | "concise" | "detailed" | "none",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="concise">concise</SelectItem>
                <SelectItem value="detailed">detailed</SelectItem>
                <SelectItem value="none">none</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Supports Reasoning Summaries"
            description="Override Codex capability detection when a model supports reasoning summaries but the CLI cannot infer it."
          >
            <Select
              value={codexSupportsReasoningSummaries}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexSupportsReasoningSummaries: value as "auto" | "enabled" | "disabled",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField title="Raw Agent Reasoning">
            <ChoiceButtons
              value={codexShowRawAgentReasoning ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexShowRawAgentReasoning: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
          <LabeledField
            title="Web Search Mode"
            description="Default is `disabled` to match the current Codex CLI opt-in `--search` behavior."
          >
            <Select
              value={codexWebSearchMode}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexWebSearchMode: value as "disabled" | "cached" | "live",
                  },
                })
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">disabled</SelectItem>
                <SelectItem value="cached">cached</SelectItem>
                <SelectItem value="live">live</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Fast Mode"
            description="Enables Codex fast_mode feature flag for faster responses on simpler tasks."
          >
            <ChoiceButtons
              value={codexFastMode ? "on" : "off"}
              onChange={(value) => updateSettings({ patch: { codexFastMode: value === "on" } })}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </LabeledField>
        </SettingsCard>

        <StaveAutoCard />
      </SectionStack>
    </>
  );
}

function DeveloperSection() {
  const [codexPathOverride, providerDebugStream, turnDiagnosticsVisible] = useAppStore(
    useShallow((state) => [state.settings.codexPathOverride, state.settings.providerDebugStream, state.settings.turnDiagnosticsVisible] as const),
  );
  const [gpuStatus, setGpuStatus] = useState<GpuStatusSnapshot | null>(null);
  const [gpuStatusError, setGpuStatusError] = useState("");
  const updateSettings = useAppStore((state) => state.updateSettings);
  const gpuStatusRows = gpuStatus ? Object.entries(gpuStatus.featureStatus).sort(([left], [right]) => left.localeCompare(right)) : [];

  useEffect(() => {
    let cancelled = false;

    async function loadGpuStatus() {
      const getGpuStatus = window.api?.window?.getGpuStatus;
      if (!getGpuStatus) {
        if (!cancelled) {
          setGpuStatusError("GPU status API unavailable.");
        }
        return;
      }

      try {
        const nextStatus = await getGpuStatus();
        if (cancelled) {
          return;
        }
        setGpuStatus(nextStatus);
        setGpuStatusError("");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGpuStatusError(error instanceof Error ? error.message : "Failed to load GPU status.");
      }
    }

    void loadGpuStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SectionHeading title="Developer" description="Advanced diagnostics and local provider tooling overrides." />
      <SectionStack>
        <SettingsCard title="Codex Binary Path" description="Override the path to the local `codex` binary. Leave empty to use the system install discovered from your PATH/home bin locations.">
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
            placeholder="/usr/local/bin/codex"
            value={codexPathOverride}
            onCommit={(nextValue) => updateSettings({ patch: { codexPathOverride: nextValue } })}
          />
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <TriangleAlert className="size-4 text-warning" />
              Supported Codex baseline
            </p>
            <p className="mt-1">
              Stave targets Codex SDK `0.115.0` and expects a local `codex` CLI around `0.115.0`.
              If your installed CLI is older, update it or point this field at the version you want Stave to use.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Provider Debug Logging"
          description="Enables verbose stream event logging for all providers in the Electron main-process console."
        >
          <ChoiceButtons
            value={providerDebugStream ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { providerDebugStream: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </SettingsCard>

        <SettingsCard
          title="GPU Acceleration"
          description="Electron-reported compositor status for diagnosing WSL2 and filtered transparency performance."
        >
          {gpuStatus ? (
            <div className="space-y-2 rounded-md border border-border/80 bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Hardware acceleration</span>
                <span className="font-mono text-muted-foreground">
                  {gpuStatus.hardwareAccelerationEnabled ? "enabled" : "disabled"}
                </span>
              </div>
              <div className="space-y-1">
                {gpuStatusRows.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : gpuStatusError ? null : (
            <p className="text-sm text-muted-foreground">Loading GPU status…</p>
          )}
          {gpuStatusError ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {gpuStatusError}
            </p>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Session Replay UI"
          description="Shows the Session Replay entry point for the active chat session."
        >
          <ChoiceButtons
            value={turnDiagnosticsVisible ? "on" : "off"}
            onChange={(value) => updateSettings({ patch: { turnDiagnosticsVisible: value === "on" } })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

export function SettingsDialogSectionContent(args: { sectionId: SectionId }) {
  switch (args.sectionId) {
    case "general":
      return <GeneralSection />;
    case "theme":
      return <ThemeSection />;
    case "terminal":
      return <TerminalSection />;
    case "chat":
      return <ChatSection />;
    case "subagents":
      return <SubagentsSection />;
    case "skills":
      return <SkillsSection />;
    case "commands":
      return <CommandsSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "developer":
      return <DeveloperSection />;
    default:
      return null;
  }
}
