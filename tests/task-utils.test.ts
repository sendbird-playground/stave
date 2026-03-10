import { describe, expect, test } from "bun:test";
import { getArchiveFallbackTaskId, getTaskCounts, getVisibleTasks, isTaskArchived } from "../src/lib/tasks";
import type { Task } from "../src/types/chat";

const tasks: Task[] = [
  {
    id: "task-active-1",
    title: "Active One",
    provider: "claude-code",
    updatedAt: "2026-03-10T01:00:00.000Z",
    unread: false,
    archivedAt: null,
  },
  {
    id: "task-archived-1",
    title: "Archived One",
    provider: "codex",
    updatedAt: "2026-03-10T02:00:00.000Z",
    unread: false,
    archivedAt: "2026-03-08T01:00:00.000Z",
  },
  {
    id: "task-active-2",
    title: "Active Two",
    provider: "codex",
    updatedAt: "2026-03-10T03:00:00.000Z",
    unread: true,
    archivedAt: null,
  },
];

describe("task utils", () => {
  test("filters archived and active task views", () => {
    expect(getVisibleTasks({ tasks, filter: "active" }).map((task) => task.id)).toEqual(["task-active-1", "task-active-2"]);
    expect(getVisibleTasks({ tasks, filter: "archived" }).map((task) => task.id)).toEqual(["task-archived-1"]);
    expect(getVisibleTasks({ tasks, filter: "all" }).map((task) => task.id)).toEqual(tasks.map((task) => task.id));
  });

  test("counts task buckets", () => {
    expect(getTaskCounts({ tasks })).toEqual({ active: 2, archived: 1, all: 3 });
  });

  test("selects an unarchived fallback after archive", () => {
    expect(getArchiveFallbackTaskId({ tasks, archivedTaskId: "task-active-1" })).toBe("task-active-2");
    expect(getArchiveFallbackTaskId({
      tasks: tasks.filter((task) => task.id !== "task-active-2"),
      archivedTaskId: "task-active-1",
    })).toBe("");
    expect(getArchiveFallbackTaskId({ tasks: [tasks[1]!], archivedTaskId: "task-archived-1" })).toBe("");
  });

  test("detects archived tasks", () => {
    expect(isTaskArchived(tasks[0]!)).toBe(false);
    expect(isTaskArchived(tasks[1]!)).toBe(true);
  });
});
