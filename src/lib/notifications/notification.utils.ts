import type { AppNotification } from "@/lib/notifications/notification.types";

const STOP_REASON_LABELS: Record<string, string> = {
  end_turn: "Completed normally",
  max_tokens: "Token limit reached",
  tool_use: "Paused on tool call",
  stop_sequence: "Stop sequence hit",
  error: "Ended with error",
};

export function formatNotificationStopReason(stopReason: unknown): string | null {
  if (typeof stopReason !== "string") {
    return null;
  }

  const normalizedStopReason = stopReason.trim();
  if (!normalizedStopReason) {
    return null;
  }

  return STOP_REASON_LABELS[normalizedStopReason] ?? normalizedStopReason;
}

export function formatApprovalNotificationDetail(payload: Record<string, unknown>): string | null {
  const toolName = typeof payload.toolName === "string"
    ? payload.toolName.trim()
    : "";
  const description = typeof payload.description === "string"
    ? payload.description.trim()
    : "";

  if (toolName && description) {
    return `${toolName}: ${description}`;
  }
  if (toolName) {
    return toolName;
  }
  if (description) {
    return description;
  }

  return null;
}

export function buildNotificationDetail(
  notification: Pick<AppNotification, "kind" | "payload">,
): string | null {
  if (notification.kind === "task.turn_completed") {
    return formatNotificationStopReason(notification.payload.stopReason);
  }
  if (notification.kind === "task.approval_requested") {
    return formatApprovalNotificationDetail(notification.payload);
  }

  return null;
}
