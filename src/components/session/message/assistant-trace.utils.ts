import { getTodoProgress, type TodoItem } from "@/components/ai-elements/todo";
import type { ToolUsePart } from "@/types/chat";

export function deriveTodoTraceStatus(args: {
  input: string;
  state?: ToolUsePart["state"];
}) {
  const progress = getTodoProgress({ input: args.input });

  if (progress.totalCount > 0 && progress.completedCount === progress.totalCount) {
    return "done" as const;
  }

  if (
    args.state === "input-streaming"
    || args.state === "input-available"
    || progress.hasInProgressTodos
    || progress.hasPendingTodos
  ) {
    return "active" as const;
  }

  if (args.state === "output-available" || args.state === "output-error") {
    return "done" as const;
  }

  return "pending" as const;
}

export function deriveTodoTraceItems(args: {
  input: string;
  state?: ToolUsePart["state"];
}): TodoItem[] {
  const progress = getTodoProgress({ input: args.input });
  if (args.state !== "input-streaming" && args.state !== "input-available") {
    return progress.todos;
  }
  if (progress.hasInProgressTodos) {
    return progress.todos;
  }

  const firstPendingIndex = progress.todos.findIndex((todo) => todo.status === "pending");
  if (firstPendingIndex === -1) {
    return progress.todos;
  }

  return progress.todos.map((todo, index) => (
    index === firstPendingIndex
      ? { ...todo, status: "in_progress" as const }
      : todo
  ));
}
