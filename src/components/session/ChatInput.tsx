import { PromptInput, PromptSuggestion, PromptSuggestions } from "@/components/ai-elements";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { PermissionModeValue } from "@/components/ai-elements/permission-mode-selector";
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
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { getLatestPromptSuggestions, mergePromptSuggestionWithDraft } from "./chat-input.utils";

interface ChatInputProps {
  compact?: boolean;
}

const EMPTY_PROMPT_DRAFT = { text: "", attachedFilePath: "" };
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
    <PromptSuggestions>
      {promptSuggestions.map((suggestion) => (
        <PromptSuggestion
          key={suggestion}
          onClick={() => args.onSelectSuggestion(suggestion)}
          title={suggestion}
        >
          {suggestion}
        </PromptSuggestion>
      ))}
    </PromptSuggestions>
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
  ] as const));
  const activeProvider = useAppStore((state) => (
    state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? state.draftProvider
  ));
  const promptDraft = useAppStore((state) => state.promptDraftByTask[activeTaskId || "draft:session"] ?? EMPTY_PROMPT_DRAFT);
  const workspaceCwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.projectPath ?? undefined);
  const activeMessageCount = useAppStore((state) => (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length);
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[state.activeTaskId]));
  const [
    modelClaude,
    modelCodex,
    customCommands,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeThinkingMode,
    codexApprovalPolicy,
  ] = useAppStore(useShallow((state) => [
    state.settings.modelClaude,
    state.settings.modelCodex,
    state.settings.customCommands,
    state.settings.claudePermissionMode,
    state.settings.claudeAllowDangerouslySkipPermissions,
    state.settings.claudeSandboxEnabled,
    state.settings.claudeAllowUnsandboxedCommands,
    state.settings.claudeEffort,
    state.settings.claudeThinkingMode,
    state.settings.codexApprovalPolicy,
  ] as const));
  const providerSelectionTarget = activeTaskId || "draft:session";
  const [draftText, setDraftText] = useState(promptDraft.text);
  const draftTextRef = useRef(promptDraft.text);
  const syncedDraftRef = useRef({
    taskId: providerSelectionTarget,
    text: promptDraft.text,
  });
  const draftSaveTimerRef = useRef<number | null>(null);
  const permissionMode: PermissionModeValue =
    activeProvider === "claude-code" ? claudePermissionMode : codexApprovalPolicy;
  const isEmpty = activeMessageCount === 0;
  const activeModel = activeProvider === "claude-code" ? modelClaude : modelCodex;
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

  return (
    <div
      className={cn(
        args.compact ? "bg-transparent px-0 py-0" : "border-t border-border/80 bg-card px-3 py-2.5 sm:px-4",
        isEmpty && !args.compact && "pb-6",
      )}
    >
      <div className={cn("mx-auto", args.compact || isEmpty ? "max-w-xl" : "max-w-4xl")}>
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
          attachedFilePath={promptDraft.attachedFilePath}
          commandPaletteItems={commandPalette.items}
          commandPaletteProviderNote={commandPalette.providerNote}
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
            updateSettings({
              patch: {
                modelCodex: normalizeModelSelection({
                  value: selection.model,
                  fallback: getDefaultModelForProvider({ providerId: selection.providerId }),
                }),
              },
            });
          }}
          permissionMode={permissionMode}
          onPermissionModeChange={(value) => {
            if (activeProvider === "claude-code") {
              updateSettings({ patch: { claudePermissionMode: value as typeof claudePermissionMode } });
            } else {
              updateSettings({ patch: { codexApprovalPolicy: value as typeof codexApprovalPolicy } });
            }
          }}
          onAttachFileChange={({ filePath }) =>
            updatePromptDraft({ taskId: providerSelectionTarget, patch: { attachedFilePath: filePath } })}
          onSubmit={async ({ text, filePath }) => {
            cancelPendingDraftSave();
            if (filePath) {
              await openFileFromTree({ filePath });
            }

            const latestTabs = useAppStore.getState().editorTabs;
            const tab = filePath ? latestTabs.find((item) => item.filePath === filePath) : null;
            sendUserMessage({
              taskId: activeTaskId,
              content: text,
              fileContext: tab
                ? {
                    filePath: tab.filePath,
                    content: tab.content,
                    language: tab.language,
                  }
                : undefined,
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
