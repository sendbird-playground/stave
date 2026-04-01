import { useCallback, useEffect, useState } from "react";
import { ArrowRightCircle, ClipboardCheck, Copy, Minus, Maximize2 } from "lucide-react";
import { Button, Textarea, WaveIndicator } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements";
import { getTaskControlOwner, isTaskManaged } from "@/lib/tasks";
import { APPROVE_PLAN_MESSAGE } from "@/lib/providers/plan-response";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app.store";
import {
  resolvePromptDraftRuntimeState,
  transitionClaudePromptDraftPermissionMode,
} from "@/store/prompt-draft-runtime";
import { resolvePlanViewerInsets, resolvePlanViewerState } from "@/components/session/plan-viewer.utils";
import type { PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

type ViewState = "normal" | "minimized" | "expanded";

interface PlanViewerProps {
  inputDockHeight?: number;
}

const EMPTY_PROMPT_DRAFT: PromptDraft = { text: "", attachedFilePaths: [], attachments: [] };

export function PlanViewer({ inputDockHeight = 0 }: PlanViewerProps) {
  const [revising, setRevising] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [viewState, setViewState] = useState<ViewState>("normal");
  const [copied, setCopied] = useState(false);

  const [activeTaskId, activeTask, draftProvider, promptDraft, claudePermissionMode, claudePermissionModeBeforePlan, codexExperimentalPlanMode, sendUserMessage, createTask, updatePromptDraft] = useAppStore(
    useShallow((state) => [
      state.activeTaskId,
      state.tasks.find((task) => task.id === state.activeTaskId) ?? null,
      state.draftProvider,
      state.promptDraftByTask[state.activeTaskId] ?? EMPTY_PROMPT_DRAFT,
      state.settings.claudePermissionMode,
      state.settings.claudePermissionModeBeforePlan,
      state.settings.codexExperimentalPlanMode,
      state.sendUserMessage,
      state.createTask,
      state.updatePromptDraft,
    ] as const),
  );
  const activeProvider = activeTask?.provider ?? draftProvider;
  const taskRuntimeState = resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexExperimentalPlanMode,
    },
  });
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan = taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexExperimentalPlanMode = taskRuntimeState.codexExperimentalPlanMode;
  const isManagedTask = isTaskManaged(activeTask);
  const managedNotice = isManagedTask
    ? `Plan responses are managed by ${getTaskControlOwner(activeTask) === "external" ? "an external controller" : "Stave"}. Take over to reply here.`
    : null;

  // Find the latest plan message in the task (not just the last message).
  // This ensures the plan viewer can show plans even if newer non-plan messages exist.
  const latestPlanMessage = useAppStore((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === "assistant" && msg.isPlanResponse && msg.planText?.trim()) {
        return msg;
      }
    }
    return null;
  });

  // Also check the actual last message for "preparing" state detection
  const lastMessage = useAppStore((state) => {
    const messages = state.messagesByTask[state.activeTaskId];
    return messages?.at(-1) ?? null;
  });

  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[state.activeTaskId]));

  // Use the latest plan message for the plan text and pending state
  const { planText, isPlanPreparing, isPlanPending } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: effectiveClaudePermissionMode,
    codexExperimentalPlanMode: effectiveCodexExperimentalPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive,
  });

  // Reset view state when a new plan arrives so it opens fully
  useEffect(() => {
    if (isPlanPending) {
      setViewState("normal");
      setRevising(false);
      setRevisionText("");
      setCopied(false);
    }
  }, [isPlanPending]);

  const handleApprove = useCallback(() => {
    if (isManagedTask) {
      return;
    }
    // Restore the permission mode that was active before plan mode
    if ((activeProvider === "claude-code" || activeProvider === "stave") && effectiveClaudePermissionMode === "plan") {
      updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          runtimeOverrides: transitionClaudePromptDraftPermissionMode({
            nextMode: effectiveClaudePermissionModeBeforePlan ?? "acceptEdits",
            currentMode: effectiveClaudePermissionMode,
            beforePlan: effectiveClaudePermissionModeBeforePlan,
          }),
        },
      });
    } else if (activeProvider === "codex" && effectiveCodexExperimentalPlanMode) {
      updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          runtimeOverrides: {
            ...promptDraft.runtimeOverrides,
            codexExperimentalPlanMode: false,
          },
        },
      });
    }
    sendUserMessage({ taskId: activeTaskId, content: APPROVE_PLAN_MESSAGE });
    setRevising(false);
    setRevisionText("");
  }, [
    activeProvider,
    activeTaskId,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexExperimentalPlanMode,
    isManagedTask,
    promptDraft.runtimeOverrides,
    sendUserMessage,
    updatePromptDraft,
  ]);

  if (!isPlanPreparing && !isPlanPending) {
    return null;
  }

  function handleCopy() {
    if (planText) {
      void copyTextToClipboard(planText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleHandoff() {
    if (isManagedTask) {
      return;
    }
    createTask({ title: "Plan handoff" });
    // createTask synchronously sets activeTaskId to the new task.
    const newTaskId = useAppStore.getState().activeTaskId;
    if (newTaskId && newTaskId !== activeTaskId) {
      updatePromptDraft({ taskId: newTaskId, patch: { text: planText } });
    }
  }

  function handleRevise() {
    if (isManagedTask || !revisionText.trim()) return;
    sendUserMessage({ taskId: activeTaskId, content: revisionText.trim() });
    setRevising(false);
    setRevisionText("");
  }

  const isMinimized = viewState === "minimized";
  const isExpanded = viewState === "expanded";
  const providerLabel = activeProvider === "codex" ? "Codex" : "Claude";
  const { topOffset, bottomOffset } = resolvePlanViewerInsets({
    isExpanded,
    inputDockHeight,
  });
  const viewerStyle = isExpanded
    ? { top: topOffset ?? 0, bottom: bottomOffset }
    : { bottom: bottomOffset };

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 px-3 sm:px-4"
      style={viewerStyle}
    >
      <div
        className={[
          "pointer-events-auto mx-auto flex max-w-6xl min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
          isExpanded ? "h-full" : "",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/80 px-4 py-2.5">
          <ClipboardCheck className="size-4 text-primary" />
          <p className="flex-1 text-sm font-medium">
            {isPlanPreparing ? "Preparing plan\u2026" : `Review ${providerLabel}'s Plan`}
          </p>
          {isPlanPreparing ? (
            <WaveIndicator className="text-primary" />
          ) : (
            <>
              <button
                onClick={() => setViewState(isMinimized ? "normal" : "minimized")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isMinimized ? "Restore" : "Minimize"}
              >
                <Minus className="size-4" />
              </button>
              <button
                onClick={() => setViewState(isExpanded ? "normal" : "expanded")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isExpanded ? "Restore" : "Expand"}
              >
                <Maximize2 className="size-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Body — hidden when preparing or minimized */}
        {!isPlanPreparing && !isMinimized && (
          <>
            <div className={["min-h-0 overflow-y-auto px-4 py-3", isExpanded ? "flex-1" : "max-h-72"].join(" ")}>
              <MessageResponse>{planText || "Plan ready."}</MessageResponse>
            </div>
            {revising ? (
              <div className="shrink-0 p-3">
                <Textarea
                  autoFocus
                  value={revisionText}
                  onChange={(e) => setRevisionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleRevise();
                    }
                    if (e.key === "Escape") {
                      setRevising(false);
                      setRevisionText("");
                    }
                  }}
                  placeholder={`Tell ${providerLabel} what to change\u2026`}
                  className="min-h-[72px] rounded-lg border-border/70 bg-background text-base leading-7"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleRevise} disabled={!revisionText.trim()}>
                    Send
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setRevising(false); setRevisionText(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
                <Button size="sm" variant="outline" onClick={handleCopy} disabled={!planText}>
                  <Copy className="size-3.5" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleHandoff} disabled={isManagedTask || !planText}>
                  <ArrowRightCircle className="size-3.5" />
                  Handoff
                </Button>
                <Button size="sm" disabled={isManagedTask} onClick={handleApprove}>
                  <ClipboardCheck className="size-3.5" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={isManagedTask} onClick={() => setRevising(true)}>
                  Revise
                </Button>
                {managedNotice ? (
                  <p className="text-xs text-muted-foreground">{managedNotice}</p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
