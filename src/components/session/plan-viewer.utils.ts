import type { ChatMessage } from "@/types/chat";

const PLAN_VIEWER_COLLAPSED_GAP_PX = 8;
const PLAN_VIEWER_EXPANDED_TOP_PX = 12;

export function resolvePlanViewerState(args: {
  activeProvider: "claude-code" | "codex" | "stave";
  claudePermissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  codexExperimentalPlanMode?: boolean;
  lastMessage?: Pick<ChatMessage, "role" | "providerId" | "isPlanResponse" | "isStreaming" | "planText"> | null;
  isTurnActive: boolean;
}) {
  const planText = args.lastMessage?.planText?.trim() ?? "";

  const isClaudePlanMode =
    (args.activeProvider === "claude-code" || args.activeProvider === "stave")
    && args.claudePermissionMode === "plan";
  const isCodexPlanMode = args.activeProvider === "codex" && args.codexExperimentalPlanMode === true;
  const lastMessageHasPlan =
    args.lastMessage?.role === "assistant" &&
    args.lastMessage.isPlanResponse === true;
  const hasPlanContent = lastMessageHasPlan && Boolean(planText);

  // "Preparing" only while in plan mode, turn is active, and plan hasn't arrived yet.
  // Once plan_ready fires (hasPlanContent becomes true), we switch to "pending"
  // even though the turn may still be active (done event hasn't arrived yet).
  const isPlanPreparing = (isClaudePlanMode || isCodexPlanMode) && args.isTurnActive && !hasPlanContent;

  // Plan is viewable as soon as it has content, regardless of isTurnActive/isStreaming.
  // This fixes the bug where the viewer stayed on "Preparing plan…" because
  // plan_ready fires before the done event that clears isTurnActive.
  const isPlanPending = hasPlanContent;

  return {
    planText,
    isPlanPreparing,
    isPlanPending,
  };
}

export function resolvePlanViewerInsets(args: {
  isExpanded: boolean;
  inputDockHeight: number;
}) {
  const bottomOffset = Math.max(0, Math.round(args.inputDockHeight)) + PLAN_VIEWER_COLLAPSED_GAP_PX;

  return {
    topOffset: args.isExpanded ? PLAN_VIEWER_EXPANDED_TOP_PX : null,
    bottomOffset,
  };
}
