import type { CSSProperties } from "react";
import type { ChatMessage } from "@/types/chat";

const PLAN_VIEWER_COLLAPSED_GAP_PX = 8;
const PLAN_VIEWER_EXPANDED_TOP_PX = 12;
const PLAN_VIEWER_SIDE_GAP_PX = 16;
const PLAN_VIEWER_NORMAL_MAX_WIDTH_PX = 672;

export type PlanViewerViewState = "normal" | "minimized" | "expanded";

interface PlanViewerDragPosition {
  x: number;
  y: number;
}

type PlanMessage = Pick<ChatMessage, "role" | "providerId" | "isPlanResponse" | "isStreaming" | "planText">;

function hasPlanContent(message?: PlanMessage | null) {
  return message?.role === "assistant"
    && message.isPlanResponse === true
    && Boolean(message.planText?.trim());
}

export function resolvePlanViewerState(args: {
  activeProvider: "claude-code" | "codex" | "stave";
  claudePermissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto";
  codexExperimentalPlanMode?: boolean;
  latestPlanMessage?: PlanMessage | null;
  lastMessage?: PlanMessage | null;
  isTurnActive: boolean;
}) {
  const planText = args.latestPlanMessage?.planText?.trim() ?? "";

  const isClaudePlanMode =
    (args.activeProvider === "claude-code" || args.activeProvider === "stave")
    && args.claudePermissionMode === "plan";
  const isCodexPlanMode = args.activeProvider === "codex" && args.codexExperimentalPlanMode === true;
  const isPlanModeActive = isClaudePlanMode || isCodexPlanMode;
  const lastMessageHasPlan = hasPlanContent(args.lastMessage);
  const hasHistoricalPlan = hasPlanContent(args.latestPlanMessage);
  const shouldDelayCodexPendingViewer =
    isCodexPlanMode
    && args.isTurnActive
    && args.latestPlanMessage?.isStreaming === true;

  // Stay in "preparing" while plan mode is active and the current turn has not
  // produced a fresh plan response yet. Historical plan text may still exist.
  const isPlanPreparing =
    isPlanModeActive
    && args.isTurnActive
    && (!lastMessageHasPlan || shouldDelayCodexPendingViewer);

  // Render the full viewer only while the task is still in plan review, or
  // when the latest message is itself the plan response awaiting user action.
  const isPlanPending =
    hasHistoricalPlan
    && !shouldDelayCodexPendingViewer
    && (isPlanModeActive || lastMessageHasPlan);
  const canReplyToPlan = isPlanPending && !args.isTurnActive;

  return {
    planText,
    isPlanPreparing,
    isPlanPending,
    canReplyToPlan,
  };
}

export function resolvePlanViewerInsets(args: {
  isExpanded: boolean;
  inputDockHeight: number;
}) {
  const bottomOffset = Math.max(0, Math.round(args.inputDockHeight)) + PLAN_VIEWER_COLLAPSED_GAP_PX;

  return {
    topOffset: args.isExpanded ? PLAN_VIEWER_EXPANDED_TOP_PX : null,
    rightOffset: PLAN_VIEWER_SIDE_GAP_PX,
    bottomOffset,
  };
}

export function resolvePlanViewerLayout(args: {
  viewState: PlanViewerViewState;
  inputDockHeight: number;
  dragPos?: PlanViewerDragPosition | null;
}): {
  wrapperClassName: string;
  wrapperStyle: CSSProperties;
  cardClassName: string;
} {
  const isExpanded = args.viewState === "expanded";
  const isMinimized = args.viewState === "minimized";
  const { topOffset, rightOffset, bottomOffset } = resolvePlanViewerInsets({
    isExpanded,
    inputDockHeight: args.inputDockHeight,
  });

  if (isMinimized && args.dragPos) {
    return {
      wrapperClassName: "pointer-events-none absolute z-20",
      wrapperStyle: {
        top: args.dragPos.y,
        left: args.dragPos.x,
      },
      cardClassName: [
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
        "w-72",
      ].join(" "),
    };
  }

  const wrapperStyle: CSSProperties = isExpanded
    ? {
        right: rightOffset,
        bottom: bottomOffset,
        width: `calc(100% - ${rightOffset * 2}px)`,
        height: `max(0px, calc(100% - ${bottomOffset + (topOffset ?? 0)}px))`,
      }
    : isMinimized
      ? {
          right: rightOffset,
          bottom: bottomOffset,
        }
      : {
          right: rightOffset,
          bottom: bottomOffset,
          width: `calc(100% - ${rightOffset * 2}px)`,
          maxWidth: PLAN_VIEWER_NORMAL_MAX_WIDTH_PX,
        };

  return {
    wrapperClassName: "pointer-events-none absolute z-20",
    wrapperStyle,
    cardClassName: [
      "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg",
      isExpanded ? "h-full w-full" : "",
      isMinimized ? "w-72" : "",
    ].filter(Boolean).join(" "),
  };
}
