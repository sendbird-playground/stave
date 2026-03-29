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
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { Attachment, ChatMessage } from "@/types/chat";
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

const EMPTY_PROMPT_DRAFT = { text: "", attachedFilePaths: [] as string[], attachments: [] as Attachment[] };
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
    return buildChatInputRuntimeQuickControls({
      activeProvider,
      permissionMode,
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
      codexPathOverride,
      staveAutoFastMode,
      staveAutoOrchestrationMode,
      staveAutoMaxSubtasks,
      staveAutoAllowCrossProviderWorkers,
      staveAutoMaxParallelSubtasks,
      updateSettings,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeFastMode,
    claudePermissionMode,
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
    permissionMode,
    providerTimeoutMs,
    staveAutoAllowCrossProviderWorkers,
    staveAutoFastMode,
    staveAutoMaxParallelSubtasks,
    staveAutoMaxSubtasks,
    staveAutoOrchestrationMode,
    updateSettings,
  ]);
  const runtimeStatusItems = useMemo(() => {
    return buildChatInputRuntimeStatusItems({
      activeProvider,
      permissionMode,
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
      codexPathOverride,
      staveAutoFastMode,
      staveAutoOrchestrationMode,
      staveAutoMaxSubtasks,
      staveAutoAllowCrossProviderWorkers,
      staveAutoMaxParallelSubtasks,
      updateSettings,
    });
  }, [
    activeProvider,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeFastMode,
    claudePermissionMode,
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
      claudePermissionMode,
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
    claudePermissionMode,
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
