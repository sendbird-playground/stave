import type { Task } from "@/types/chat";

export type TaskFilter = "active" | "archived" | "all";

const relativeTimeFormatter = typeof Intl !== "undefined"
  ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  : null;

export function isTaskArchived(task: Pick<Task, "archivedAt">) {
  return Boolean(task.archivedAt);
}

export function getVisibleTasks(args: { tasks: Task[]; filter: TaskFilter }) {
  if (args.filter === "all") {
    return args.tasks;
  }
  return args.tasks.filter((task) =>
    args.filter === "archived" ? isTaskArchived(task) : !isTaskArchived(task)
  );
}

export function getTaskCounts(args: { tasks: Array<Pick<Task, "archivedAt">> }) {
  const archived = args.tasks.filter((task) => isTaskArchived(task)).length;
  return {
    active: args.tasks.length - archived,
    archived,
    all: args.tasks.length,
  };
}

export function getArchiveFallbackTaskId(args: { tasks: Task[]; archivedTaskId: string }) {
  const activeFallback = args.tasks.find((task) => task.id !== args.archivedTaskId && !isTaskArchived(task));
  if (activeFallback) {
    return activeFallback.id;
  }
  return args.tasks.find((task) => task.id !== args.archivedTaskId)?.id ?? "";
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
