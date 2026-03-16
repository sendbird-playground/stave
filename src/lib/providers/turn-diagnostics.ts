import type { PersistedTurnSummary, ReplayedTurnEvent } from "@/lib/db/turns.db";

export interface TurnDiagnosticsSummary {
  status: "running" | "completed" | "error" | "truncated" | "interrupted";
  stopReason: string | null;
  durationMs: number | null;
  totalEvents: number;
  lastEventType: string | null;
  textEvents: number;
  thinkingEvents: number;
  toolEvents: number;
  approvalEvents: number;
  inputEvents: number;
  systemEvents: number;
  errorEvents: number;
}

export function summarizeTurnDiagnostics(args: {
  turn: PersistedTurnSummary;
  replay: ReplayedTurnEvent[];
  isActiveTurn?: boolean;
}): TurnDiagnosticsSummary {
  let stopReason: string | null = null;
  let textEvents = 0;
  let thinkingEvents = 0;
  let toolEvents = 0;
  let approvalEvents = 0;
  let inputEvents = 0;
  let systemEvents = 0;
  let errorEvents = 0;

  for (const item of args.replay) {
    switch (item.event.type) {
      case "text":
        textEvents += 1;
        break;
      case "thinking":
        thinkingEvents += 1;
        break;
      case "provider_conversation":
        systemEvents += 1;
        break;
      case "tool":
      case "tool_result":
        toolEvents += 1;
        break;
      case "approval":
        approvalEvents += 1;
        break;
      case "user_input":
        inputEvents += 1;
        break;
      case "system":
        systemEvents += 1;
        break;
      case "error":
        errorEvents += 1;
        break;
      case "done":
        stopReason = item.event.stop_reason ?? null;
        break;
      default:
        break;
    }
  }

  const durationMs = args.turn.completedAt
    ? Math.max(0, Date.parse(args.turn.completedAt) - Date.parse(args.turn.createdAt))
    : null;
  const lastEventType = args.replay.at(-1)?.event.type ?? null;
  const status = errorEvents > 0
    ? "error"
    : !args.turn.completedAt && !args.isActiveTurn
    ? "interrupted"
    : stopReason === "max_tokens"
    ? "truncated"
    : args.turn.completedAt
    ? "completed"
    : "running";

  return {
    status,
    stopReason,
    durationMs: Number.isNaN(durationMs ?? Number.NaN) ? null : durationMs,
    totalEvents: args.turn.eventCount,
    lastEventType,
    textEvents,
    thinkingEvents,
    toolEvents,
    approvalEvents,
    inputEvents,
    systemEvents,
    errorEvents,
  };
}

export function formatTurnEventLabel(args: { event: ReplayedTurnEvent["event"] }): string {
  switch (args.event.type) {
    case "text":
      return "Text";
    case "thinking":
      return "Reasoning";
    case "provider_conversation":
      return `Conversation: ${args.event.providerId}`;
    case "tool":
      return `Tool: ${args.event.toolName}`;
    case "tool_progress":
      return `Tool progress: ${args.event.toolName}`;
    case "tool_result":
      return "Tool output";
    case "approval":
      return `Approval: ${args.event.toolName}`;
    case "user_input":
      return `User input: ${args.event.toolName}`;
    case "usage":
      return "Usage";
    case "prompt_suggestions":
      return "Prompt suggestions";
    case "plan_ready":
      return "Plan ready";
    case "system":
      return "System";
    case "error":
      return "Error";
    case "done":
      return args.event.stop_reason ? `Done (${args.event.stop_reason})` : "Done";
    case "diff":
      return `Diff: ${args.event.filePath}`;
  }
}

export function formatTurnDuration(args: {
  durationMs: number | null;
  status?: TurnDiagnosticsSummary["status"];
}): string {
  if (args.status === "interrupted") {
    return "Interrupted";
  }

  const durationMs = args.durationMs;
  if (durationMs == null) {
    return "Running";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
