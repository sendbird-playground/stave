import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("workspace integrity regressions", () => {
  test("switchWorkspace ignores workspace ids that are not owned by the active project", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-03-31T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/project-a" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-foreign" });

    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-main");
  });

  test("task-scoped git commands run in the task-owned workspace even when another workspace is active", async () => {
    const localStorage = createMemoryStorage();
    const commandCalls: Array<{ cwd?: string; command: string }> = [];
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        terminal: {
          runCommand: async ({ cwd, command }: { cwd?: string; command: string }) => {
            commandCalls.push({ cwd, command });
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        { id: "ws-owned", name: "feature-a", updatedAt: "2026-03-31T00:00:00.000Z" },
        { id: "ws-active", name: "feature-b", updatedAt: "2026-03-31T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-active",
      workspacePathById: {
        "ws-owned": "/tmp/project-a/.stave/workspaces/feature-a",
        "ws-active": "/tmp/project-a/.stave/workspaces/feature-b",
      },
      workspaceBranchById: { "ws-owned": "feature-a", "ws-active": "feature-b" },
      workspaceDefaultById: { "ws-owned": false, "ws-active": false },
      tasks: [{
        id: "task-1",
        title: "Task 1",
        provider: "codex",
        updatedAt: "2026-03-31T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      }],
      messagesByTask: { "task-1": [] },
      taskWorkspaceIdById: { "task-1": "ws-owned" },
    });

    await useAppStore.getState().viewTaskChanges({ taskId: "task-1" });

    expect(commandCalls[0]).toEqual({
      cwd: "/tmp/project-a/.stave/workspaces/feature-a",
      command: "git status --porcelain",
    });
  });

  test("rehydration realigns the current workspace state with the normalized current project", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());

    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: "/Users/jacob.kim/workspace/stave",
        projectName: "stave",
        defaultBranch: "main",
        workspaces: [{
          id: "base:1i2znya",
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:19.071Z",
        }],
        activeWorkspaceId: "base:1i2znya",
        recentProjects: [{
          projectPath: "/Users/jacob.kim/workspace/stave",
          projectName: "stave",
          lastOpenedAt: "2026-03-31T13:36:33.211Z",
          defaultBranch: "main",
          workspaces: [{
            id: "base:1i2znya",
            name: "Default Workspace",
            updatedAt: "2026-03-31T13:36:19.071Z",
          }],
          activeWorkspaceId: "base:1i2znya",
          workspaceBranchById: { "base:1i2znya": "master" },
          workspacePathById: { "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard" },
          workspaceDefaultById: { "base:1i2znya": true },
        }],
        workspaceBranchById: { "base:1i2znya": "master" },
        workspacePathById: { "base:1i2znya": "/Users/jacob.kim/projects/sbdashboard" },
        workspaceDefaultById: { "base:1i2znya": true },
      },
      version: 0,
    }));

    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        rehydrate: () => Promise<void>;
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };
    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });
    await persistedStore.persist.rehydrate();

    expect(useAppStore.getState().activeWorkspaceId).toBe("base:75px8d");
    expect(useAppStore.getState().workspacePathById).toEqual({
      "base:75px8d": "/Users/jacob.kim/workspace/stave",
    });
    expect(useAppStore.getState().workspaceDefaultById).toEqual({
      "base:75px8d": true,
    });
  });
});
