import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, ListTodo, LoaderCircle } from "lucide-react";
import { getTodoProgress, type TodoItem } from "@/components/ai-elements/todo";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import {
  resolvePlanViewerInsets,
  resolvePlanViewerState,
  SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
} from "@/components/session/plan-viewer.utils";
import { resolveTodoFloaterVisibility } from "@/components/session/todo-floater.utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { resolvePromptDraftRuntimeState } from "@/store/prompt-draft-runtime";
import { useShallow } from "zustand/react/shallow";
import type { ChatMessage, PromptDraft, ToolUsePart } from "@/types/chat";

/** Keep the floater visible briefly after all todos complete so the user sees the final state. */
const COMPLETION_LINGER_MS = 2000;

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PROMPT_DRAFT: PromptDraft = { text: "", attachedFilePaths: [], attachments: [] };

/**
 * Scan messages in reverse to find the latest TodoWrite tool_use part.
 */
function findLatestTodoPart(messages: ChatMessage[]): ToolUsePart | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "assistant") {
      continue;
    }
    for (let j = (message.parts?.length ?? 0) - 1; j >= 0; j -= 1) {
      const part = message.parts![j];
      if (part?.type === "tool_use" && part.toolName.trim().toLowerCase() === "todowrite") {
        return part;
      }
    }
  }
  return null;
}

interface TodoFloaterProps {
  inputDockHeight?: number;
}

export function TodoFloater({ inputDockHeight = 0 }: TodoFloaterProps) {
  const [
    activeTask,
    draftProvider,
    promptDraft,
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    codexPlanMode,
    messages,
    isTurnActive,
  ] = useAppStore(
    useShallow((state) => {
      const taskId = state.activeTaskId;
      return [
        state.tasks.find((task) => task.id === taskId) ?? null,
        state.draftProvider,
        state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT,
        state.settings.claudePermissionMode,
        state.settings.claudePermissionModeBeforePlan,
        state.settings.codexPlanMode,
        state.messagesByTask[taskId] ?? EMPTY_MESSAGES,
        Boolean(state.activeTurnIdsByTask[taskId]),
      ] as const;
    }),
  );
  const activeProvider = activeTask?.provider ?? draftProvider;
  const taskRuntimeState = resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
    },
  });

  const todoPart = useMemo(() => findLatestTodoPart(messages), [messages]);
  const lastMessage = messages.at(-1) ?? null;
  const latestPlanMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.role === "assistant" && message.isPlanResponse && message.planText?.trim()) {
        return message;
      }
    }
    return null;
  }, [messages]);
  const { isPlanPreparing, isPlanPending } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: taskRuntimeState.claudePermissionMode,
    codexPlanMode: taskRuntimeState.codexPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive,
  });
  const planViewerVisible = isPlanPreparing || isPlanPending;

  const progress = useMemo(() => {
    if (!todoPart) return null;
    return getTodoProgress({ input: todoPart.input });
  }, [todoPart]);

  const displayTodos = useMemo<TodoItem[]>(() => {
    if (!todoPart) return [];
    return deriveTodoTraceItems({ input: todoPart.input, state: todoPart.state });
  }, [todoPart]);

  // ── Visibility logic ──────────────────────────────────────────────
  // Show when: active turn + todos exist + at least one is not completed.
  // Linger briefly after all complete, then fade out.

  const allCompleted =
    progress !== null &&
    progress.totalCount > 0 &&
    progress.completedCount === progress.totalCount;

  // Linger after completion
  const [lingering, setLingering] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // When all todos just completed while we were showing the floater, start linger timer.
    if (allCompleted && isTurnActive && progress && progress.totalCount > 0) {
      setLingering(true);
      lingerTimer.current = setTimeout(() => {
        setLingering(false);
      }, COMPLETION_LINGER_MS);
      return () => {
        if (lingerTimer.current) {
          clearTimeout(lingerTimer.current);
        }
      };
    }
    setLingering(false);
    if (lingerTimer.current) {
      clearTimeout(lingerTimer.current);
      lingerTimer.current = null;
    }
  }, [allCompleted, isTurnActive, progress]);

  // Turn end → immediately clear linger.
  useEffect(() => {
    if (!isTurnActive) {
      setLingering(false);
      if (lingerTimer.current) {
        clearTimeout(lingerTimer.current);
        lingerTimer.current = null;
      }
    }
  }, [isTurnActive]);

  const shouldShow = resolveTodoFloaterVisibility({
    progress,
    todoState: todoPart?.state,
    isTurnActive,
    lingering,
    planViewerVisible,
  });

  if (!shouldShow || !progress) {
    return null;
  }

  const { rightOffset, bottomOffset } = resolvePlanViewerInsets({
    isExpanded: false,
    inputDockHeight,
  });
  const progressPercent =
    progress.totalCount > 0
      ? Math.round((progress.completedCount / progress.totalCount) * 100)
      : 0;

  return (
    <div
      className={cn(
        SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
        // Anchor todo progress in the same slot the plan viewer uses above the chat input.
        "transition-opacity duration-300",
        lingering ? "opacity-50" : "opacity-100 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
      )}
      style={{
        right: rightOffset,
        bottom: bottomOffset,
        width: `calc(100% - ${rightOffset * 2}px)`,
        maxWidth: 400,
      }}
    >
      <div className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          <ListTodo className="size-3.5 shrink-0 text-primary" />
          <span className="flex-1 truncate text-[0.8125rem] font-medium">
            Todo
          </span>
          <span className="text-[0.75rem] tabular-nums text-muted-foreground">
            {progress.completedCount}/{progress.totalCount}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 w-full bg-border/40">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out",
              allCompleted ? "bg-success" : "bg-primary",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Todo items */}
        <div className="max-h-52 overflow-y-auto px-3 py-2">
          <ol className="space-y-1">
            {displayTodos.map((todo, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: stable todo list ordering
                key={idx}
                className="flex items-start gap-2"
              >
                <TodoFloaterItemIcon status={todo.status} />
                <span
                  className={cn(
                    "text-[0.8125rem] leading-[1.5]",
                    todo.status === "completed" &&
                      "text-muted-foreground line-through",
                    todo.status === "in_progress" &&
                      "font-medium text-foreground",
                    todo.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function TodoFloaterItemIcon({ status }: { status: TodoItem["status"] }) {
  if (status === "completed") {
    return (
      <CheckCircle2 className="mt-[0.1875rem] size-3.5 shrink-0 text-success" />
    );
  }
  if (status === "in_progress") {
    return (
      <LoaderCircle className="mt-[0.1875rem] size-3.5 shrink-0 animate-spin text-primary" />
    );
  }
  return (
    <Circle className="mt-[0.1875rem] size-3.5 shrink-0 text-muted-foreground/50" />
  );
}
