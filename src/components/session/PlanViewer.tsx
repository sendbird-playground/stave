import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
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

interface DragState {
  pointerId: number;
  startMouseX: number;
  startMouseY: number;
  startPosX: number;
  startPosY: number;
  containerWidth: number;
  containerHeight: number;
  cardWidth: number;
  cardHeight: number;
  /** True once movement exceeds the activation threshold. */
  active: boolean;
}

export function PlanViewer({ inputDockHeight = 0 }: PlanViewerProps) {
  const [revising, setRevising] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [viewState, setViewState] = useState<ViewState>("normal");
  const [copied, setCopied] = useState(false);
  /** Absolute pixel position of the minimised pill within the chat content div. */
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const outerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

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
  const providerLabel = activeProvider === "codex" ? "Codex" : "Claude";
  const isManagedTask = isTaskManaged(activeTask);
  const managedNotice = isManagedTask
    ? `Plan responses are managed by ${getTaskControlOwner(activeTask) === "external" ? "an external controller" : "Stave"}. Take over to reply here.`
    : null;

  const [latestPlanMessage, lastMessage, isTurnActive] = useAppStore(useShallow((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? [];
    const lastMessage = messages.at(-1) ?? null;
    let latestPlanMessage: (typeof lastMessage) | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.role === "assistant" && message.isPlanResponse && message.planText?.trim()) {
        latestPlanMessage = message;
        break;
      }
    }
    return [
      latestPlanMessage,
      lastMessage,
      Boolean(state.activeTurnIdsByTask[state.activeTaskId]),
    ] as const;
  }));

  // Use the latest plan message for the plan text and pending state
  const { planText, isPlanPreparing, isPlanPending, canReplyToPlan } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: effectiveClaudePermissionMode,
    codexExperimentalPlanMode: effectiveCodexExperimentalPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive,
  });
  const planReplyNotice = !isManagedTask && isPlanPending && !canReplyToPlan
    ? `Wait for ${providerLabel} to finish the current turn before replying to the plan.`
    : null;
  const replyNotice = managedNotice ?? planReplyNotice;

  // Reset view state when a new plan arrives so it opens fully.
  useEffect(() => {
    if (isPlanPending) {
      setViewState("normal");
      setRevising(false);
      setRevisionText("");
      setCopied(false);
    }
  }, [isPlanPending]);

  // Clear drag position whenever the viewer is not minimised.
  useEffect(() => {
    if (viewState !== "minimized") {
      setDragPos(null);
    }
  }, [viewState]);

  const handleApprove = useCallback(() => {
    if (isManagedTask || !canReplyToPlan) {
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
    canReplyToPlan,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexExperimentalPlanMode,
    isManagedTask,
    promptDraft.runtimeOverrides,
    sendUserMessage,
    updatePromptDraft,
  ]);

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
    if (isManagedTask || !canReplyToPlan || !revisionText.trim()) return;
    sendUserMessage({ taskId: activeTaskId, content: revisionText.trim() });
    setRevising(false);
    setRevisionText("");
  }

  // ---------------------------------------------------------------------------
  // Drag logic for the minimised pill
  // ---------------------------------------------------------------------------

  const onHeaderPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (dragRef.current !== null) return; // already dragging
    const outer = outerRef.current;
    if (!outer) return;
    const containerRect = outer.parentElement?.getBoundingClientRect();
    if (!containerRect) return;
    const outerRect = outer.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      // Use stored position if we have it, otherwise derive from current render.
      startPosX: dragPos?.x ?? (outerRect.left - containerRect.left),
      startPosY: dragPos?.y ?? (outerRect.top - containerRect.top),
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      cardWidth: outer.offsetWidth,
      cardHeight: outer.offsetHeight,
      active: false,
    };
  }, [dragPos]);

  const onHeaderPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const dx = e.clientX - state.startMouseX;
    const dy = e.clientY - state.startMouseY;
    // Activate drag only after a small movement threshold to preserve button clicks.
    if (!state.active) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      state.active = true;
      e.currentTarget.setPointerCapture(state.pointerId);
    }
    const newX = Math.max(0, Math.min(state.containerWidth - state.cardWidth, state.startPosX + dx));
    const newY = Math.max(0, Math.min(state.containerHeight - state.cardHeight, state.startPosY + dy));
    setDragPos({ x: newX, y: newY });
  }, []);

  const onHeaderPointerUp = useCallback((_e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // Layout computation
  // ---------------------------------------------------------------------------

  const isMinimized = viewState === "minimized";
  const isExpanded = viewState === "expanded";

  // bottomOffset keeps the viewer above the chat input dock.
  const { bottomOffset } = resolvePlanViewerInsets({ isExpanded: false, inputDockHeight });

  let outerWrapperClass: string;
  let outerWrapperStyle: React.CSSProperties;

  if (isExpanded) {
    // Fill ~90 % of the chat area (5 % inset on every side).
    outerWrapperClass = "pointer-events-none absolute z-20";
    outerWrapperStyle = { inset: "5%" };
  } else if (isMinimized && dragPos !== null) {
    // Freely positioned after the user has dragged the pill.
    outerWrapperClass = "pointer-events-none absolute z-20";
    outerWrapperStyle = { top: dragPos.y, left: dragPos.x };
  } else if (isMinimized) {
    // Default minimised position: bottom-right corner above the input dock.
    outerWrapperClass = "pointer-events-none absolute z-20";
    outerWrapperStyle = { right: "1rem", bottom: bottomOffset };
  } else {
    // Normal: full-width strip pinned to the bottom.
    outerWrapperClass = "pointer-events-none absolute left-0 right-0 z-20 px-3 sm:px-4";
    outerWrapperStyle = { bottom: bottomOffset };
  }

  const innerCardClass = [
    "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
    isExpanded ? "h-full" : "",
    isMinimized ? "w-72" : (!isExpanded ? "mx-auto max-w-6xl" : ""),
  ].filter(Boolean).join(" ");

  if (!isPlanPreparing && !isPlanPending) {
    return null;
  }

  return (
    <div ref={outerRef} className={outerWrapperClass} style={outerWrapperStyle}>
      <div className={innerCardClass}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/80 px-4 py-2.5">
          {/* Drag handle: title area only — buttons remain independently clickable */}
          <div
            className={[
              "flex min-w-0 flex-1 select-none items-center gap-2 overflow-hidden",
              isMinimized ? "cursor-grab" : "",
            ].join(" ")}
            onPointerDown={isMinimized ? onHeaderPointerDown : undefined}
            onPointerMove={isMinimized ? onHeaderPointerMove : undefined}
            onPointerUp={isMinimized ? onHeaderPointerUp : undefined}
            onPointerCancel={isMinimized ? onHeaderPointerUp : undefined}
          >
            <ClipboardCheck className="size-4 shrink-0 text-primary" />
            <p className="flex-1 truncate text-sm font-medium">
              {isPlanPreparing ? "Preparing plan\u2026" : `Review ${providerLabel}'s Plan`}
            </p>
          </div>
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
                  disabled={!canReplyToPlan}
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
                  <Button size="sm" onClick={handleRevise} disabled={!canReplyToPlan || !revisionText.trim()}>
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
                <Button size="sm" disabled={isManagedTask || !canReplyToPlan} onClick={handleApprove}>
                  <ClipboardCheck className="size-3.5" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={isManagedTask || !canReplyToPlan} onClick={() => setRevising(true)}>
                  Revise
                </Button>
                {replyNotice ? (
                  <p className="text-xs text-muted-foreground">{replyNotice}</p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
