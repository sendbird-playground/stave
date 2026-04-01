import { PromptInput, Suggestion, Suggestions } from "@/components/ai-elements";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { type PermissionModeValue } from "@/components/ai-elements/permission-mode-selector";
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
import { resolveEffectiveCodexApprovalPolicy } from "@/lib/providers/codex-runtime-options";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import { getTaskControlOwner, isTaskManaged } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { findLatestPendingUserInputPart } from "@/store/provider-message.utils";
import {
  resolvePromptDraftRuntimeState,
  transitionClaudePromptDraftPermissionMode,
} from "@/store/prompt-draft-runtime";
import type { Attachment, ChatMessage, ClaudePermissionMode, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import {
  buildChatInputRuntimeQuickControls,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
} from "./chat-input.runtime";
import { getLatestPromptSuggestions, mergePromptSuggestionWithDraft } from "./chat-input.utils";

interface ChatInputProps {
  compact?: boolean;
}

const EMPTY_PROMPT_DRAFT: PromptDraft = { text: "", attachedFilePaths: [], attachments: [] };
const EMPTY_MESSAGES: ChatMessage[] = [];
const PROMPT_DRAFT_SAVE_DELAY_MS = 250;
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
    providerCommandCatalogRefreshNonce,
    setTaskProvider,
    updatePromptDraft,
    clearPromptDraft,
    updateSettings,
    sendUserMessage,
    openFileFromTree,
    abortTaskTurn,
    refreshSkillCatalog,
    resolveUserInput,
  ] = useAppStore(useShallow((state) => [
    state.activeTaskId,
    state.projectFiles,
    state.providerAvailability,
    state.providerCommandCatalogRefreshNonce,
    state.setTaskProvider,
    state.updatePromptDraft,
    state.clearPromptDraft,
    state.updateSettings,
    state.sendUserMessage,
    state.openFileFromTree,
    state.abortTaskTurn,
    state.refreshSkillCatalog,
    state.resolveUserInput,
  ] as const));
  const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId) ?? null);
  const draftProvider = useAppStore((state) => state.draftProvider);
  const activeProvider = activeTask?.provider ?? draftProvider;
  const promptDraft = useAppStore((state) => state.promptDraftByTask[activeTaskId || "draft:session"] ?? EMPTY_PROMPT_DRAFT);
  const promptFocusNonce = useAppStore((state) => state.promptFocusNonce);
  useEffect(() => {
    if (promptFocusNonce === 0) return;
    setFocusNonce((current) => current + 1);
  }, [promptFocusNonce]);
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);
  const activeMessageCount = useAppStore((state) => (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length);
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[state.activeTaskId]));
  const isManagedTask = isTaskManaged(activeTask);
  const isPromptLocked = isTurnActive || isManagedTask;
  const [pendingUserInputMessageId, pendingUserInputPart] = useAppStore(useShallow((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      return [null, null] as const;
    }
    const part = findLatestPendingUserInputPart({ message: lastMessage });
    return [lastMessage.id, part ?? null] as const;
  }));
  // Keep the store snapshot ref-stable. Returning a fresh object directly from
  // the selector can trip React 19 + Zustand 5 into a render loop.
  const pendingUserInput = useMemo(() => {
    if (!pendingUserInputMessageId || !pendingUserInputPart) {
      return null;
    }
    return {
      messageId: pendingUserInputMessageId,
      part: pendingUserInputPart,
    };
  }, [pendingUserInputMessageId, pendingUserInputPart]);
  const managedNotice = isManagedTask
    ? `This task is managed by ${getTaskControlOwner(activeTask) === "external" ? "an external controller" : "Stave"}. Take over to continue here.`
    : null;
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
    claudeTaskBudgetTokens,
    claudeSettingSources,
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
    codexExperimentalPlanMode,
    claudeFastMode,
    codexFastMode,
    claudeFastModeVisible,
    codexFastModeVisible,
    staveAutoFastMode,
    staveAutoOrchestrationMode,
    staveAutoMaxSubtasks,
    staveAutoAllowCrossProviderWorkers,
    staveAutoMaxParallelSubtasks,
    claudePermissionModeBeforePlan,
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
    state.settings.claudeTaskBudgetTokens,
    state.settings.claudeSettingSources,
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
    state.settings.codexExperimentalPlanMode,
    state.settings.claudeFastMode,
    state.settings.codexFastMode,
    state.settings.claudeFastModeVisible,
    state.settings.codexFastModeVisible,
    state.settings.staveAutoFastMode,
    state.settings.staveAutoOrchestrationMode,
    state.settings.staveAutoMaxSubtasks,
    state.settings.staveAutoAllowCrossProviderWorkers,
    state.settings.staveAutoMaxParallelSubtasks,
    state.settings.claudePermissionModeBeforePlan,
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
  const taskRuntimeState = useMemo(() => resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexExperimentalPlanMode,
    },
  }), [claudePermissionMode, claudePermissionModeBeforePlan, codexExperimentalPlanMode, promptDraft]);
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan = taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexExperimentalPlanMode = taskRuntimeState.codexExperimentalPlanMode;
  const permissionMode: PermissionModeValue =
    activeProvider === "codex"
      ? resolveEffectiveCodexApprovalPolicy({
        approvalPolicy: codexApprovalPolicy,
        planMode: effectiveCodexExperimentalPlanMode,
        fallback: "on-request",
      })
      : effectiveClaudePermissionMode;
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
    return buildChatInputRuntimeQuickControls({
      activeProvider,
      permissionMode,
      providerTimeoutMs,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeTaskBudgetTokens,
      claudeSettingSources,
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
      codexExperimentalPlanMode: effectiveCodexExperimentalPlanMode,
      codexPathOverride,
      staveAutoFastMode,
      staveAutoOrchestrationMode,
      staveAutoMaxSubtasks,
      staveAutoAllowCrossProviderWorkers,
      staveAutoMaxParallelSubtasks,
      onClaudePermissionModeChange: (value) => {
        updatePromptDraft({
          taskId: providerSelectionTarget,
          patch: {
            runtimeOverrides: transitionClaudePromptDraftPermissionMode({
              nextMode: value,
              currentMode: effectiveClaudePermissionMode,
              beforePlan: effectiveClaudePermissionModeBeforePlan,
            }),
          },
        });
      },
      updateSettings,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeFastMode,
    claudeSandboxEnabled,
    claudeSettingSources,
    claudeTaskBudgetTokens,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexFastMode,
    codexModelReasoningEffort,
    codexNetworkAccessEnabled,
    codexPathOverride,
    codexReasoningSummary,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexShowRawAgentReasoning,
    codexSupportsReasoningSummaries,
    codexWebSearchMode,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexExperimentalPlanMode,
    permissionMode,
    providerTimeoutMs,
    providerSelectionTarget,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
    staveAutoMaxParallelSubtasks,
    staveAutoMaxSubtasks,
    staveAutoOrchestrationMode,
    updateSettings,
    updatePromptDraft,
  ]);
  const runtimeStatusItems = useMemo(() => {
    return buildChatInputRuntimeStatusItems({
      activeProvider,
      permissionMode,
      providerTimeoutMs,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeTaskBudgetTokens,
      claudeSettingSources,
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
      codexExperimentalPlanMode: effectiveCodexExperimentalPlanMode,
      codexPathOverride,
      staveAutoFastMode,
      staveAutoOrchestrationMode,
      staveAutoMaxSubtasks,
      staveAutoAllowCrossProviderWorkers,
      staveAutoMaxParallelSubtasks,
      updateSettings,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeFastMode,
    claudeSandboxEnabled,
    claudeSettingSources,
    claudeTaskBudgetTokens,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexFastMode,
    codexModelReasoningEffort,
    codexNetworkAccessEnabled,
    codexPathOverride,
    codexReasoningSummary,
    codexSandboxMode,
    codexSkipGitRepoCheck,
    codexShowRawAgentReasoning,
    codexSupportsReasoningSummaries,
    codexWebSearchMode,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexExperimentalPlanMode,
    permissionMode,
    providerTimeoutMs,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
    staveAutoMaxParallelSubtasks,
    staveAutoMaxSubtasks,
    staveAutoOrchestrationMode,
    updateSettings,
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

    const runtimeOptions = buildCommandCatalogRuntimeOptions({
      activeProvider,
      modelClaude,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeSettingSources,
      claudeEffort,
      claudeThinkingMode,
      claudeAgentProgressSummaries,
    });

    void getCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      runtimeOptions,
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
    effectiveClaudePermissionMode,
    claudeSandboxEnabled,
    claudeSettingSources,
    providerCommandCatalogRefreshNonce,
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
    const targetPath = workspaceCwd ?? null;
    if (skillCatalog.status === "loading" && skillCatalog.workspacePath === targetPath) {
      return;
    }
    if (skillCatalog.status === "ready" && skillCatalog.workspacePath === targetPath) {
      const CATALOG_TTL_MS = 5 * 60 * 1000;
      const fetchedAtMs = skillCatalog.fetchedAt ? Date.parse(skillCatalog.fetchedAt) : 0;
      if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
        return;
      }
    }
    void refreshSkillCatalog({ workspacePath: targetPath });
  }, [refreshSkillCatalog, skillsEnabled, skillCatalog.status, skillCatalog.workspacePath, skillCatalog.fetchedAt, workspaceCwd]);

  return (
    <div
      className={cn(
        args.compact ? "bg-transparent px-0 py-0" : "border-t border-border/80 bg-card px-3 py-2.5 sm:px-4",
        isEmpty && !args.compact && "pb-6",
      )}
    >
      <div className={cn("mx-auto max-w-6xl")}>
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
          planMode={
            activeProvider === "codex"
              ? effectiveCodexExperimentalPlanMode
              : (activeProvider === "claude-code" || activeProvider === "stave") && effectiveClaudePermissionMode === "plan"
          }
          onPlanModeChange={
            activeProvider === "codex"
              ? (enabled) => updatePromptDraft({
                  taskId: providerSelectionTarget,
                  patch: {
                    runtimeOverrides: {
                      ...promptDraft.runtimeOverrides,
                      codexExperimentalPlanMode: enabled,
                    },
                  },
                })
              : activeProvider === "claude-code" || activeProvider === "stave"
              ? (enabled) => {
                  const nextMode: ClaudePermissionMode = enabled
                    ? "plan"
                    : (effectiveClaudePermissionModeBeforePlan ?? "acceptEdits");
                  updatePromptDraft({
                    taskId: providerSelectionTarget,
                    patch: {
                      runtimeOverrides: transitionClaudePromptDraftPermissionMode({
                        nextMode,
                        currentMode: effectiveClaudePermissionMode,
                        beforePlan: effectiveClaudePermissionModeBeforePlan,
                      }),
                    },
                  });
                }
              : undefined
          }
          thinkingMode={activeProvider === "claude-code" || activeProvider === "stave" ? claudeThinkingMode : undefined}
          onThinkingModeChange={
            activeProvider === "claude-code" || activeProvider === "stave"
              ? (value) => updateSettings({ patch: { claudeThinkingMode: value } })
              : undefined
          }
          pendingUserInput={pendingUserInput}
          onUserInputSubmit={pendingUserInput ? ({ messageId, answers }) => {
            resolveUserInput({ taskId: activeTaskId, messageId, answers });
          } : undefined}
          onUserInputDeny={pendingUserInput ? ({ messageId }) => {
            resolveUserInput({ taskId: activeTaskId, messageId, denied: true });
          } : undefined}
          permissionMode={permissionMode}
          runtimeQuickControls={runtimeQuickControls}
          runtimeStatusItems={runtimeStatusItems}
          onPermissionModeChange={(value) => {
            if (activeProvider === "claude-code") {
              updatePromptDraft({
                taskId: providerSelectionTarget,
                patch: {
                  runtimeOverrides: transitionClaudePromptDraftPermissionMode({
                    nextMode: value as ClaudePermissionMode,
                    currentMode: effectiveClaudePermissionMode,
                    beforePlan: effectiveClaudePermissionModeBeforePlan,
                  }),
                },
              });
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
