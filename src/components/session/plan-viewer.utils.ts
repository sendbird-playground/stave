import type { ChatMessage } from "@/types/chat";

export function resolvePlanViewerState(args: {
  activeProvider: "claude-code" | "codex" | "stave";
  claudePermissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  lastMessage?: Pick<ChatMessage, "role" | "providerId" | "isPlanResponse" | "isStreaming" | "planText"> | null;
  isTurnActive: boolean;
}) {
  const planText = args.lastMessage?.planText?.trim() ?? "";
  const isClaudePlanMode = args.activeProvider === "claude-code" && args.claudePermissionMode === "plan";
  const isPlanPreparing = isClaudePlanMode && args.isTurnActive;
  const isPlanPending =
    args.activeProvider === "claude-code" &&
    !args.isTurnActive &&
    args.lastMessage?.role === "assistant" &&
    args.lastMessage.providerId === "claude-code" &&
    args.lastMessage.isPlanResponse === true &&
    !args.lastMessage.isStreaming;

  return {
    planText,
    isPlanPreparing,
    isPlanPending,
  };
}
