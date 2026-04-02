import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, ClipboardList, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusBadge, type ToolState } from "./tool";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export interface TodoProgress {
  todos: TodoItem[];
  totalCount: number;
  completedCount: number;
  hasPendingTodos: boolean;
  hasInProgressTodos: boolean;
}

export function parseTodoInput(args: { input: string }): { todos: TodoItem[] } {
  try {
    const parsed = JSON.parse(args.input) as Record<string, unknown>;
    if (Array.isArray(parsed.todos)) {
      return {
        todos: parsed.todos
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item) => ({
            content: typeof item.content === "string" ? item.content : String(item.content ?? ""),
            status: (["pending", "in_progress", "completed"].includes(item.status as string)
              ? item.status
              : "pending") as TodoStatus,
          })),
      };
    }
  } catch {
    /* fall through */
  }
  return { todos: [] };
}

export function getTodoProgress(args: { input: string }): TodoProgress {
  const { todos } = parseTodoInput(args);
  const completedCount = todos.filter((todo) => todo.status === "completed").length;

  return {
    todos,
    totalCount: todos.length,
    completedCount,
    hasPendingTodos: todos.some((todo) => todo.status === "pending"),
    hasInProgressTodos: todos.some((todo) => todo.status === "in_progress"),
  };
}

function TodoItemIcon({ status }: { status: TodoStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />;
  }
  if (status === "in_progress") {
    return <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}

function deriveOverallState(todos: TodoItem[], toolState?: ToolState): ToolState {
  if (toolState === "output-error") return "output-error";
  if (toolState === "input-streaming") return "input-streaming";
  if (todos.some((t) => t.status === "in_progress")) return "input-streaming";
  if (todos.length > 0 && todos.every((t) => t.status === "completed")) return "output-available";
  return "input-available";
}

export function TodoCard({
  input,
  state,
  defaultOpen = true,
  className,
}: {
  input: string;
  output?: string;
  state?: ToolState;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { todos, completedCount } = useMemo(() => getTodoProgress({ input }), [input]);
  const displayState = deriveOverallState(todos, state);

  return (
    <section className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 text-[0.875em] font-semibold",
          open && "border-b",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-1.5">
          <ClipboardList className="size-3.5 text-muted-foreground" />
          Todo
          {todos.length > 0 && (
            <span className="ml-0.5 text-[0.75em] font-normal text-muted-foreground">
              {completedCount}/{todos.length}
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-2">
          {getStatusBadge(displayState)}
          <ChevronDown
            className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")}
          />
        </span>
      </button>
      {open && (
        <div className="px-3 py-2">
          {todos.length === 0 ? (
            <p className="text-[0.875em] text-muted-foreground">No todos.</p>
          ) : (
            <ol className="space-y-1.5">
              {todos.map((todo, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: order is stable for todo list
                <li key={idx} className="flex items-start gap-2">
                  <TodoItemIcon status={todo.status} />
                  <span
                    className={cn(
                      "text-[0.875em] leading-[1.6]",
                      todo.status === "completed" && "text-muted-foreground line-through",
                      todo.status === "in_progress" && "font-medium text-foreground",
                      todo.status === "pending" && "text-muted-foreground",
                    )}
                  >
                    {todo.content}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
