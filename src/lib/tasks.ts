import type { ProviderId } from "@/lib/providers/provider.types";
import { resolveProviderDisplayId } from "@/lib/providers/model-catalog";
import type { ChatMessage, Task } from "@/types/chat";

export type TaskFilter = "active" | "archived" | "all";

const relativeTimeFormatter = typeof Intl !== "undefined"
  ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  : null;

export function isTaskArchived(task: Pick<Task, "archivedAt">) {
  return Boolean(task.archivedAt);
}

function matchesTaskFilter(args: { task: Pick<Task, "archivedAt">; filter: TaskFilter }) {
  if (args.filter === "all") {
    return true;
  }
  return args.filter === "archived" ? isTaskArchived(args.task) : !isTaskArchived(args.task);
}

export function getVisibleTasks(args: { tasks: Task[]; filter: TaskFilter }) {
  return args.tasks.filter((task) => matchesTaskFilter({ task, filter: args.filter }));
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  if (typeof movedItem === "undefined") {
    return items;
  }
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function reorderTasksWithinFilter(args: {
  tasks: Task[];
  activeTaskId: string;
  overTaskId: string;
  filter: TaskFilter;
}) {
  if (args.activeTaskId === args.overTaskId) {
    return args.tasks;
  }

  const visibleTasks = getVisibleTasks({ tasks: args.tasks, filter: args.filter });
  const fromIndex = visibleTasks.findIndex((task) => task.id === args.activeTaskId);
  const toIndex = visibleTasks.findIndex((task) => task.id === args.overTaskId);
  if (fromIndex < 0 || toIndex < 0) {
    return args.tasks;
  }

  const reorderedVisibleTasks = moveArrayItem(visibleTasks, fromIndex, toIndex);
  if (reorderedVisibleTasks === visibleTasks) {
    return args.tasks;
  }

  let reorderedVisibleIndex = 0;
  return args.tasks.map((task) => {
    if (!matchesTaskFilter({ task, filter: args.filter })) {
      return task;
    }

    const nextTask = reorderedVisibleTasks[reorderedVisibleIndex];
    reorderedVisibleIndex += 1;
    return nextTask ?? task;
  });
}

export function getTaskCounts(args: { tasks: Array<Pick<Task, "archivedAt">> }) {
  const archived = args.tasks.filter((task) => isTaskArchived(task)).length;
  return {
    active: args.tasks.length - archived,
    archived,
    all: args.tasks.length,
  };
}

export function filterTasksByName(args: { tasks: Task[]; query: string }) {
  const trimmed = args.query.trim();
  if (!trimmed) {
    return args.tasks;
  }
  const lower = trimmed.toLowerCase();
  return args.tasks.filter((task) => task.title.toLowerCase().includes(lower));
}

export function getArchiveFallbackTaskId(args: { tasks: Task[]; archivedTaskId: string }) {
  const activeFallback = args.tasks.find((task) => task.id !== args.archivedTaskId && !isTaskArchived(task));
  return activeFallback?.id ?? "";
}

export function getRespondingProviderId(args: {
  fallbackProviderId: ProviderId;
  messages: ChatMessage[];
}) {
  let latestResolvedAssistantProviderId: ProviderId | null = null;

  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    const message = args.messages[index];
    if (message?.role !== "assistant" || message.providerId === "user") {
      continue;
    }

    const resolvedProviderId = resolveProviderDisplayId({
      providerId: message.providerId,
      model: message.model,
    });

    if (message.isStreaming) {
      return resolvedProviderId;
    }

    if (!latestResolvedAssistantProviderId) {
      latestResolvedAssistantProviderId = resolvedProviderId;
    }
  }

  return latestResolvedAssistantProviderId ?? resolveProviderDisplayId({ providerId: args.fallbackProviderId });
}

export function formatTaskUpdatedAt(args: { value: string; now?: number | Date }) {
  const parsed = Date.parse(args.value);
  if (Number.isNaN(parsed)) {
    return args.value;
  }

  const now = args.now instanceof Date ? args.now.getTime() : (args.now ?? Date.now());
  const diffMs = parsed - now;
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 45) {
    return "just now";
  }

  if (absSeconds < 60 * 60) {
    return relativeTimeFormatter?.format(Math.round(diffSeconds / 60), "minute")
      ?? `${Math.round(absSeconds / 60)} min ago`;
  }

  if (absSeconds < 60 * 60 * 24) {
    return relativeTimeFormatter?.format(Math.round(diffSeconds / (60 * 60)), "hour")
      ?? `${Math.round(absSeconds / (60 * 60))} hr ago`;
  }

  if (absSeconds < 60 * 60 * 24 * 7) {
    return relativeTimeFormatter?.format(Math.round(diffSeconds / (60 * 60 * 24)), "day")
      ?? `${Math.round(absSeconds / (60 * 60 * 24))} days ago`;
  }

  const date = new Date(parsed);
  const currentYear = new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === currentYear ? {} : { year: "numeric" }),
  }).format(date);
}
