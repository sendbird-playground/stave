import { PromptInput, Suggestion, Suggestions } from "@/components/ai-elements";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import {
  getPermissionModeOptions,
  type PermissionModeValue,
} from "@/components/ai-elements/permission-mode-selector";
import { buildCommandPaletteItems } from "@/lib/commands";
import {
  getCachedProviderCommandCatalog,
  getInitialProviderCommandCatalog,
  setCachedProviderCommandCatalog,
  toProviderCommandCatalogState,
  type ProviderCommandCatalogState,
} from "@/lib/providers/provider-command-catalog";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  normalizeModelSelection,
  providerSupportsNativeCommandCatalog,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { Attachment, ChatMessage } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { getLatestPromptSuggestions, mergePromptSuggestionWithDraft } from "./chat-input.utils";

interface ChatInputProps {
  compact?: boolean;
}

const EMPTY_PROMPT_DRAFT = { text: "", attachedFilePaths: [] as string[], attachments: [] as Attachment[] };
const EMPTY_MESSAGES: ChatMessage[] = [];
const PROMPT_DRAFT_SAVE_DELAY_MS = 250;
const CLAUDE_THINKING_OPTIONS = [
  { value: "adaptive", label: "Adaptive" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
] as const;
const CLAUDE_EFFORT_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
] as const;
const CODEX_EFFORT_OPTIONS = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "X-High" },
] as const;
const CODEX_WEB_SEARCH_OPTIONS = [
  { value: "disabled", label: "Disabled" },
  { value: "cached", label: "Cached" },
  { value: "live", label: "Live" },
] as const;
const CODEX_REASONING_SUMMARY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
  { value: "none", label: "None" },
] as const;
const CODEX_REASONING_SUPPORT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
] as const;

function findOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatProviderTimeout(value: number) {
  const minutes = Math.round(value / 60000);
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? `${hours} hour` : `${hours} hours`;
  }
  return `${minutes} min`;
}

function formatTitleCaseValue(value: string) {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatShortPath(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `.../${parts.slice(-2).join("/")}`;
}

interface ChatInputSuggestionsProps {
  activeTaskId: string;
  isTurnActive: boolean;
  onSelectSuggestion: (suggestion: string) => void;
}

const ChatInputSuggestions = memo(function ChatInputSuggestions(args: ChatInputSuggestionsProps) {
  const activeMessages = useAppStore((state) => {
    if (args.isTurnActive || !args.activeTaskId) {
      return EMPTY_MESSAGES;
    }
    return state.messagesByTask[args.activeTaskId] ?? EMPTY_MESSAGES;
  });
  const promptSuggestions = useMemo(() => getLatestPromptSuggestions(activeMessages), [activeMessages]);

  if (args.isTurnActive || promptSuggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Suggestions
      </p>
      <Suggestions aria-label="Suggestions">
        {promptSuggestions.map((suggestion) => (
          <Suggestion
            key={suggestion}
            onClick={args.onSelectSuggestion}
            suggestion={suggestion}
            title={suggestion}
          />
        ))}
      </Suggestions>
    </div>
  );
});

export function ChatInput(args: ChatInputProps = {}) {
  const [focusNonce, setFocusNonce] = useState(0);
  const [providerCommandCatalog, setProviderCommandCatalog] = useState(() => getCachedProviderCommandCatalog({
    providerId: "claude-code",
  }));
  const [
    activeTaskId,
    projectFiles,
    providerAvailability,
    setTaskProvider,
    updatePromptDraft,
    clearPromptDraft,
    updateSettings,
    sendUserMessage,
    openFileFromTree,
    abortTaskTurn,
    refreshSkillCatalog,
  ] = useAppStore(useShallow((state) => [
    state.activeTaskId,
    state.projectFiles,
    state.providerAvailability,
    state.setTaskProvider,
    state.updatePromptDraft,
    state.clearPromptDraft,
    state.updateSettings,
    state.sendUserMessage,
    state.openFileFromTree,
    state.abortTaskTurn,
    state.refreshSkillCatalog,
  ] as const));
  const activeProvider = useAppStore((state) => (
    state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? state.draftProvider
  ));
  const promptDraft = useAppStore((state) => state.promptDraftByTask[activeTaskId || "draft:session"] ?? EMPTY_PROMPT_DRAFT);
  const promptFocusNonce = useAppStore((state) => state.promptFocusNonce);
  useEffect(() => {
    if (promptFocusNonce === 0) return;
    setFocusNonce((current) => current + 1);
  }, [promptFocusNonce]);
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);
  const activeMessageCount = useAppStore((state) => (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length);
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[state.activeTaskId]));
  const [
    modelClaude,
    modelCodex,
    modelStave,
    skillsEnabled,
    skillsAutoSuggest,
    customCommands,
    providerTimeoutMs,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexNetworkAccessEnabled,
    codexApprovalPolicy,
    codexModelReasoningEffort,
    codexWebSearchMode,
    codexShowRawAgentReasoning,
    codexReasoningSummary,
    codexSupportsReasoningSummaries,
    codexPathOverride,
    claudeFastMode,
    codexFastMode,
    claudeFastModeVisible,
    codexFastModeVisible,
    staveAutoFastMode,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoMaxParallelSubtasks,
  ] = useAppStore(useShallow((state) => [
    state.settings.modelClaude,
    state.settings.modelCodex,
    state.settings.modelStave,
    state.settings.skillsEnabled,
    state.settings.skillsAutoSuggest,
    state.settings.customCommands,
    state.settings.providerTimeoutMs,
    state.settings.claudePermissionMode,
    state.settings.claudeAllowDangerouslySkipPermissions,
    state.settings.claudeSandboxEnabled,
    state.settings.claudeAllowUnsandboxedCommands,
    state.settings.claudeEffort,
    state.settings.claudeThinkingMode,
    state.settings.claudeAgentProgressSummaries,
    state.settings.codexSandboxMode,
    state.settings.codexSkipGitRepoCheck,
    state.settings.codexNetworkAccessEnabled,
    state.settings.codexApprovalPolicy,
    state.settings.codexModelReasoningEffort,
    state.settings.codexWebSearchMode,
    state.settings.codexShowRawAgentReasoning,
    state.settings.codexReasoningSummary,
    state.settings.codexSupportsReasoningSummaries,
    state.settings.codexPathOverride,
    state.settings.claudeFastMode,
    state.settings.codexFastMode,
    state.settings.claudeFastModeVisible,
    state.settings.codexFastModeVisible,
    state.settings.staveAutoFastMode,
    state.settings.staveAutoOrchestrationMode,
    state.settings.staveAutoMaxSubtasks,
    state.settings.staveAutoAllowCrossProviderWorkers,
    state.settings.staveAutoMaxParallelSubtasks,
  ] as const));
  const providerSelectionTarget = activeTaskId || "draft:session";
  const skillCatalog = useAppStore((state) => state.skillCatalog);
  const [draftText, setDraftText] = useState(promptDraft.text);
  const draftTextRef = useRef(promptDraft.text);
  const syncedDraftRef = useRef({
    taskId: providerSelectionTarget,
    text: promptDraft.text,
  });
  const draftSaveTimerRef = useRef<number | null>(null);
  const permissionMode: PermissionModeValue =
    activeProvider === "codex" ? codexApprovalPolicy : claudePermissionMode;
  const isEmpty = activeMessageCount === 0;
  const activeModel = activeProvider === "claude-code"
    ? modelClaude
    : activeProvider === "stave"
      ? modelStave
      : modelCodex;
  const selectedModelOption: ModelSelectorOption = {
    key: `${activeProvider}:${activeModel}`,
    providerId: activeProvider,
    model: activeModel,
    label: toHumanModelName({ model: activeModel }),
    available: providerAvailability[activeProvider],
  };
  const modelOptions: ModelSelectorOption[] = listProviderIds().flatMap((providerId) =>
    getSdkModelOptions({ providerId }).map((model) => ({
      key: `${providerId}:${model}`,
      providerId,
      model,
      label: toHumanModelName({ model }),
      available: providerAvailability[providerId],
    }))
  );
  const runtimeQuickControls = useMemo(() => {
    // Stave Auto dedicated controls
    if (activeProvider === "stave") {
      return [
        {
          id: "orchestration-mode",
          label: "Orchestration",
          value: staveAutoOrchestrationMode,
          options: [
            { label: "Off", value: "off" },
            { label: "Auto", value: "auto" },
            { label: "Aggressive", value: "aggressive" },
          ],
          onSelect: (value: string) => updateSettings({ patch: { staveAutoOrchestrationMode: value as "off" | "auto" | "aggressive" } }),
        },
        {
          id: "fast-mode",
          label: "Fast Mode",
          value: staveAutoFastMode ? "on" : "off",
          options: [
            { label: "Off", value: "off" },
            { label: "On", value: "on" },
          ],
          onSelect: (value: string) => updateSettings({ patch: { staveAutoFastMode: value === "on" } }),
        },
        {
          id: "max-subtasks",
          label: "Max Subtasks",
          value: String(staveAutoMaxSubtasks),
          options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ label: String(n), value: String(n) })),
          onSelect: (value: string) => updateSettings({ patch: { staveAutoMaxSubtasks: Number(value) } }),
        },
      ];
    }

    // For the permission-mode selector, stave defaults to the Claude options
    // since Claude is the primary routing target.
    const effectiveProvider = activeProvider;
    const permissionOptions = getPermissionModeOptions(effectiveProvider).map((option) => ({
      value: option.value,
      label: option.label,
    }));

    if (activeProvider === "claude-code") {
      return [
        {
          id: "permission-mode",
          label: "Permission",
          value: permissionMode,
          options: permissionOptions,
          onSelect: (value: string) => updateSettings({
            patch: {
              claudePermissionMode: value as typeof claudePermissionMode,
            },
          }),
        },
        {
          id: "thinking-mode",
          label: "Thinking",
          value: claudeThinkingMode,
          options: CLAUDE_THINKING_OPTIONS,
          onSelect: (value: string) => updateSettings({
            patch: {
              claudeThinkingMode: value as typeof claudeThinkingMode,
            },
          }),
        },
        {
          id: "effort",
          label: "Effort",
          value: claudeEffort,
          options: CLAUDE_EFFORT_OPTIONS,
          onSelect: (value: string) => updateSettings({
            patch: {
              claudeEffort: value as typeof claudeEffort,
            },
          }),
        },
      ];
    }

    return [
      {
        id: "permission-mode",
        label: "Approval",
        value: permissionMode,
        options: permissionOptions,
        onSelect: (value: string) => updateSettings({
          patch: {
            codexApprovalPolicy: value as typeof codexApprovalPolicy,
          },
        }),
      },
      {
        id: "effort",
        label: "Effort",
        value: codexModelReasoningEffort,
        options: CODEX_EFFORT_OPTIONS,
        onSelect: (value: string) => updateSettings({
          patch: {
            codexModelReasoningEffort: value as typeof codexModelReasoningEffort,
          },
        }),
      },
      {
        id: "web-search",
        label: "Web Search",
        value: codexWebSearchMode,
        options: CODEX_WEB_SEARCH_OPTIONS,
        onSelect: (value: string) => updateSettings({
          patch: {
            codexWebSearchMode: value as typeof codexWebSearchMode,
          },
        }),
      },
    ];
  }, [
    activeProvider,
    claudeEffort,
    claudePermissionMode,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexModelReasoningEffort,
    codexWebSearchMode,
    permissionMode,
    staveAutoFastMode,
    staveAutoMaxSubtasks,
    staveAutoOrchestrationMode,
    updateSettings,
  ]);
  const runtimeStatusItems = useMemo(() => {
    if (activeProvider === "stave") {
      return [
        {
          id: "timeout",
          label: "Timeout",
          value: formatProviderTimeout(providerTimeoutMs),
        },
        {
          id: "cross-provider",
          label: "Cross-Provider",
          value: staveAutoAllowCrossProviderWorkers ? "On" : "Off",
        },
        {
          id: "max-parallel",
          label: "Max Parallel",
          value: String(staveAutoMaxParallelSubtasks),
        },
      ];
    }

    if (activeProvider === "claude-code") {
      return [
        {
          id: "timeout",
          label: "Timeout",
          value: formatProviderTimeout(providerTimeoutMs),
        },
        {
          id: "sandbox",
          label: "Sandbox",
          value: claudeSandboxEnabled ? "Enabled" : "Disabled",
        },
        {
          id: "unsandboxed",
          label: "Unsandboxed",
          value: claudeAllowUnsandboxedCommands ? "On" : "Off",
        },
        {
          id: "dangerous-skip",
          label: "Dangerous Skip",
          value: claudeAllowDangerouslySkipPermissions ? "On" : "Off",
        },
        {
          id: "progress-summaries",
          label: "Progress Summaries",
          value: claudeAgentProgressSummaries ? "On" : "Off",
        },
        {
          id: "fast-mode",
          label: "Fast Mode",
          value: claudeFastMode ? "On" : "Off",
          tone: claudeFastMode ? "warning" as const : "default" as const,
        },
      ];
    }

    return [
      {
        id: "timeout",
        label: "Timeout",
        value: formatProviderTimeout(providerTimeoutMs),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        value: formatTitleCaseValue(codexSandboxMode),
        tone: codexSandboxMode === "danger-full-access" ? "warning" as const : "default" as const,
      },
      {
        id: "network",
        label: "Network",
        value: codexNetworkAccessEnabled ? "On" : "Off",
      },
      {
        id: "git-check",
        label: "Git Check",
        value: codexSkipGitRepoCheck ? "Skipped" : "Required",
      },
      {
        id: "raw-reasoning",
        label: "Raw Reasoning",
        value: codexShowRawAgentReasoning ? "On" : "Off",
      },
      {
        id: "summary",
        label: "Summary",
        value: findOptionLabel(CODEX_REASONING_SUMMARY_OPTIONS, codexReasoningSummary),
      },
      {
        id: "summary-support",
        label: "Summary Support",
        value: findOptionLabel(CODEX_REASONING_SUPPORT_OPTIONS, codexSupportsReasoningSummaries),
      },
      {
        id: "fast-mode",
        label: "Fast Mode",
        value: codexFastMode ? "On" : "Off",
        tone: codexFastMode ? "warning" as const : "default" as const,
      },
      ...(codexPathOverride.trim()
        ? [{
            id: "codex-binary",
            label: "Binary",
            value: formatShortPath(codexPathOverride),
          }]
        : []),
    ];
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeFastMode,
    claudeSandboxEnabled,
    codexFastMode,
    codexNetworkAccessEnabled,
    codexPathOverride,
    codexReasoningSummary,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexShowRawAgentReasoning,
    codexSupportsReasoningSummaries,
    providerTimeoutMs,
    staveAutoAllowCrossProviderWorkers,
    staveAutoMaxParallelSubtasks,
  ]);

  function cancelPendingDraftSave() {
    if (draftSaveTimerRef.current === null) {
      return;
    }
    window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = null;
  }

  function adoptPromptDraftText(nextDraft: { taskId: string; text: string }) {
    syncedDraftRef.current = nextDraft;
    draftTextRef.current = nextDraft.text;
    setDraftText(nextDraft.text);
  }

  function commitPromptDraftText(nextDraft: { taskId: string; text: string }) {
    cancelPendingDraftSave();
    const store = useAppStore.getState();
    const currentText = store.promptDraftByTask[nextDraft.taskId]?.text ?? "";
    if (currentText !== nextDraft.text) {
      store.updatePromptDraft({
        taskId: nextDraft.taskId,
        patch: { text: nextDraft.text },
      });
    }
    syncedDraftRef.current = nextDraft;
  }

  function schedulePromptDraftSave(nextDraft: { taskId: string; text: string }) {
    cancelPendingDraftSave();
    draftSaveTimerRef.current = window.setTimeout(() => {
      commitPromptDraftText(nextDraft);
    }, PROMPT_DRAFT_SAVE_DELAY_MS);
  }

  useEffect(() => {
    const syncedDraft = syncedDraftRef.current;
    if (providerSelectionTarget !== syncedDraft.taskId) {
      commitPromptDraftText({
        taskId: syncedDraft.taskId,
        text: draftTextRef.current,
      });
      adoptPromptDraftText({
        taskId: providerSelectionTarget,
        text: promptDraft.text,
      });
      return;
    }
    if (promptDraft.text !== syncedDraft.text) {
      adoptPromptDraftText({
        taskId: providerSelectionTarget,
        text: promptDraft.text,
      });
    }
  }, [promptDraft.text, providerSelectionTarget]);

  useEffect(() => () => {
    commitPromptDraftText({
      taskId: syncedDraftRef.current.taskId,
      text: draftTextRef.current,
    });
  }, []);

  useEffect(() => {
    const flushDraftText = () => {
      commitPromptDraftText({
        taskId: syncedDraftRef.current.taskId,
        text: draftTextRef.current,
      });
    };
    window.addEventListener("beforeunload", flushDraftText);
    return () => window.removeEventListener("beforeunload", flushDraftText);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!providerSupportsNativeCommandCatalog({ providerId: activeProvider })) {
      const nextCatalog = getInitialProviderCommandCatalog({ providerId: activeProvider });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const getCommandCatalog = window.api?.provider?.getCommandCatalog;
    if (!getCommandCatalog) {
      const nextCatalog: ProviderCommandCatalogState = {
        providerId: activeProvider,
        status: "error",
        commands: [],
        detail: "Provider command catalog API is unavailable in this build.",
      };
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const loadingCatalog: ProviderCommandCatalogState = {
      providerId: activeProvider,
      status: "loading",
      commands: [],
      detail: `Loading ${getProviderLabel({ providerId: activeProvider })} native slash commands...`,
    };
    setProviderCommandCatalog(loadingCatalog);
    setCachedProviderCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      catalog: loadingCatalog,
    });

    void getCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      runtimeOptions: {
        model: modelClaude,
        claudePermissionMode,
        claudeAllowDangerouslySkipPermissions,
        claudeSandboxEnabled,
        claudeAllowUnsandboxedCommands,
        claudeEffort,
        claudeThinkingMode,
        claudeAgentProgressSummaries,
      },
    }).then((response) => {
      if (cancelled) {
        return;
      }
      const nextCatalog = toProviderCommandCatalogState({
        providerId: activeProvider,
        response,
      });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
    }).catch((error) => {
      if (cancelled) {
        return;
      }
      const nextCatalog = toProviderCommandCatalogState({
        providerId: activeProvider,
        error,
      });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudePermissionMode,
    claudeSandboxEnabled,
    claudeThinkingMode,
    modelClaude,
    workspaceCwd,
  ]);

  const commandPalette = useMemo(() => buildCommandPaletteItems({
    provider: activeProvider,
    settings: {
      customCommands,
    },
    providerCommandCatalog,
  }), [activeProvider, customCommands, providerCommandCatalog]);
  const skillPalette = useMemo(() => getEffectiveSkillEntries({
    skills: skillCatalog.skills,
    providerId: activeProvider,
  }), [activeProvider, skillCatalog.skills]);

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    void refreshSkillCatalog({
      workspacePath: workspaceCwd ?? null,
    });
  }, [refreshSkillCatalog, skillsEnabled, workspaceCwd]);

  return (
    <div
      className={cn(
        args.compact ? "bg-transparent px-0 py-0" : "border-t border-border/80 bg-card px-3 py-2.5 sm:px-4",
        isEmpty && !args.compact && "pb-6",
      )}
    >
      <div className={cn("mx-auto max-w-5xl")}>
        <ChatInputSuggestions
          activeTaskId={activeTaskId}
          isTurnActive={isTurnActive}
          onSelectSuggestion={(suggestion) => {
            const nextText = mergePromptSuggestionWithDraft({
              currentDraft: draftTextRef.current,
              suggestion,
            });
            draftTextRef.current = nextText;
            setDraftText(nextText);
            commitPromptDraftText({
              taskId: providerSelectionTarget,
              text: nextText,
            });
            setFocusNonce((current) => current + 1);
          }}
        />
        <PromptInput
          focusToken={`${providerSelectionTarget}:${focusNonce}`}
          value={draftText}
          disabled={isTurnActive}
          isTurnActive={isTurnActive}
          selectedModel={selectedModelOption}
          modelOptions={modelOptions}
          projectFiles={projectFiles}
          attachedFilePaths={promptDraft.attachedFilePaths}
          commandPaletteItems={commandPalette.items}
          commandPaletteProviderNote={commandPalette.providerNote}
          skillsEnabled={skillsEnabled}
          skillsAutoSuggest={skillsAutoSuggest}
          skillPaletteItems={skillPalette}
          onValueChange={(value) => {
            draftTextRef.current = value;
            setDraftText(value);
            schedulePromptDraftSave({
              taskId: providerSelectionTarget,
              text: value,
            });
          }}
          onModelSelect={({ selection }) => {
            setTaskProvider({ taskId: providerSelectionTarget, provider: selection.providerId });
            if (selection.providerId === "claude-code") {
              updateSettings({
                patch: {
                  modelClaude: normalizeModelSelection({
                    value: selection.model,
                    fallback: getDefaultModelForProvider({ providerId: selection.providerId }),
                  }),
                },
              });
              return;
            }
            if (selection.providerId === "stave") {
              updateSettings({
                patch: {
                  modelStave: normalizeModelSelection({
                    value: selection.model,
                    fallback: getDefaultModelForProvider({ providerId: selection.providerId }),
                  }),
                },
              });
              return;
            }
            updateSettings({
              patch: {
                modelCodex: normalizeModelSelection({
                  value: selection.model,
                  fallback: getDefaultModelForProvider({ providerId: selection.providerId }),
                }),
              },
            });
          }}
          fastMode={activeProvider === "stave" ? staveAutoFastMode : activeProvider === "codex" ? codexFastMode : claudeFastMode}
          onFastModeChange={
            activeProvider === "stave"
              ? (enabled) => updateSettings({ patch: { staveAutoFastMode: enabled } })
              : (activeProvider === "codex" ? codexFastModeVisible : claudeFastModeVisible)
                ? (enabled) => {
                    if (activeProvider === "codex") {
                      updateSettings({ patch: { codexFastMode: enabled } });
                    } else {
                      updateSettings({ patch: { claudeFastMode: enabled } });
                    }
                  }
                : undefined
          }
          permissionMode={permissionMode}
          runtimeQuickControls={runtimeQuickControls}
          runtimeStatusItems={runtimeStatusItems}
          onPermissionModeChange={(value) => {
            if (activeProvider === "claude-code") {
              updateSettings({ patch: { claudePermissionMode: value as typeof claudePermissionMode } });
            } else {
              updateSettings({ patch: { codexApprovalPolicy: value as typeof codexApprovalPolicy } });
            }
          }}
          attachments={promptDraft.attachments}
          onAttachFilesChange={({ filePaths }) =>
            updatePromptDraft({ taskId: providerSelectionTarget, patch: { attachedFilePaths: filePaths } })}
          onAttachmentsChange={({ attachments }) =>
            updatePromptDraft({ taskId: providerSelectionTarget, patch: { attachments } })}
          onCaptureScreenshot={window.api?.capture?.screenshot ? async () => {
            const result = await window.api!.capture!.screenshot();
            if (!result.ok || !result.dataUrl) {
              return;
            }
            const imageAttachment: Attachment = {
              kind: "image",
              id: crypto.randomUUID(),
              dataUrl: result.dataUrl,
              label: "Screenshot",
            };
            const current = useAppStore.getState().promptDraftByTask[providerSelectionTarget]?.attachments ?? [];
            updatePromptDraft({
              taskId: providerSelectionTarget,
              patch: { attachments: [...current, imageAttachment] },
            });
          } : undefined}
          onSubmit={async ({ text, filePaths }) => {
            cancelPendingDraftSave();
            for (const fp of filePaths) {
              await openFileFromTree({ filePath: fp });
            }

            const latestTabs = useAppStore.getState().editorTabs;
            const fileContexts = filePaths
              .map((fp) => latestTabs.find((item) => item.filePath === fp))
              .filter((tab): tab is NonNullable<typeof tab> => tab != null)
              .map((tab) => ({
                filePath: tab.filePath,
                content: tab.content,
                language: tab.language,
              }));
            const currentAttachments = useAppStore.getState().promptDraftByTask[providerSelectionTarget]?.attachments ?? [];
            const imageContexts = currentAttachments
              .filter((a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image")
              .map((a) => ({
                dataUrl: a.dataUrl,
                label: a.label,
                mimeType: "image/png",
              }));
            sendUserMessage({
              taskId: activeTaskId,
              content: text,
              fileContexts: fileContexts.length > 0 ? fileContexts : undefined,
              imageContexts: imageContexts.length > 0 ? imageContexts : undefined,
            });
            clearPromptDraft({ taskId: providerSelectionTarget });
            adoptPromptDraftText({
              taskId: providerSelectionTarget,
              text: "",
            });
          }}
          onAbort={() => abortTaskTurn({ taskId: activeTaskId })}
        />
      </div>
    </div>
  );
}
