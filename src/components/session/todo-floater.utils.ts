import type { ToolUsePart } from "@/types/chat";

export interface TodoFloaterProgressSnapshot {
  totalCount: number;
  hasPendingTodos: boolean;
  hasInProgressTodos: boolean;
}

export function resolveTodoFloaterVisibility(args: {
  progress: TodoFloaterProgressSnapshot | null;
  todoState?: ToolUsePart["state"];
  isTurnActive: boolean;
  lingering: boolean;
  planViewerVisible: boolean;
}) {
  if (args.planViewerVisible || !args.progress) {
    return false;
  }

  const isPartStillLive =
    args.todoState === "input-streaming" || args.todoState === "input-available";
  const hasActiveTodos =
    args.progress.totalCount > 0
    && (args.progress.hasPendingTodos || args.progress.hasInProgressTodos);
  const wantVisible =
    args.isTurnActive
    && args.progress.totalCount > 0
    && (hasActiveTodos || isPartStillLive);

  return wantVisible || args.lingering;
}
