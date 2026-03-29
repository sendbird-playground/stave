import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import { listWorkspaceSummaries, loadWorkspaceSnapshot, upsertWorkspace } from "@/lib/db/workspaces.db";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

function setWindowContext(args: { api?: unknown; localStorage?: ReturnType<typeof createMemoryStorage> }) {
  (globalThis as { window: unknown }).window = {
    api: args.api,
    ...(args.localStorage ? { localStorage: args.localStorage } : {}),
  } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("push stream race handling", () => {
  test("captures done event even when emitted before startPushTurn resolves", async () => {
    let listener: ((payload: { streamId: string; event: unknown; done: boolean }) => void) | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (cb: (payload: { streamId: string; event: unknown; done: boolean }) => void) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async () => {
          listener?.({ streamId: "stream-1", event: { type: "done" }, done: true });
          return { ok: true, streamId: "stream-1" };
        },
      },
    });

    const source = createBridgeProviderSource<{ type: string }>({ providerId: "claude-code" });
    const out: Array<{ type: string }> = [];
    for await (const event of source.streamTurn({ prompt: "quick fail" })) {
      out.push(event);
    }

    expect(out).toEqual([{ type: "done" }]);
  });
});

describe("push stream memory release", () => {
  test("releases push sessions after completion", async () => {
    process.env.STAVE_PROVIDER_TIMEOUT_MS = "50";
    const runtimeModule = await import("../electron/providers/runtime");
    const runtime = runtimeModule.providerRuntime;
    let doneResolver: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      doneResolver = resolve;
    });

    const started = runtime.startTurnStream(
      { providerId: "claude-code", prompt: "smoke" },
      {
        onEvent: () => {},
        onDone: () => {
          doneResolver?.();
        },
      }
    );

    expect(started.ok).toBe(true);
    await donePromise;

    const page = runtime.readTurnStream({ streamId: started.streamId, cursor: 0 });
    expect(page.ok).toBe(false);
    expect(page.done).toBe(true);
  });
});

describe("workspace persistence fallback", () => {
  test("supports list/load/upsert without electron persistence bridge", async () => {
    setWindowApi({});

    const snapshot = {
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code" as const,
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "user" as const,
            model: "user",
            providerId: "user",
            content: "hello",
            isStreaming: false,
            parts: [{ type: "text", text: "hello" }],
          },
        ],
      },
    };

    await upsertWorkspace({ id: "ws-dev", name: "Dev Workspace", snapshot });
    const rows = await listWorkspaceSummaries();
    const loaded = await loadWorkspaceSnapshot({ workspaceId: "ws-dev" });

    expect(rows.some((row) => row.id === "ws-dev")).toBe(true);
    expect(loaded?.activeTaskId).toBe("task-1");
    expect(loaded?.tasks).toHaveLength(1);
    expect(loaded?.promptDraftByTask).toEqual({});
    expect(loaded?.providerConversationByTask).toEqual({});
  });

  test("preserves each project's workspace list when switching projects", async () => {
    const localStorage = createMemoryStorage();
    const projectRoots = [
      {
        rootPath: "/tmp/stave-project-a",
        rootName: "project-a",
        files: ["package.json", "src/a.ts"],
      },
      {
        rootPath: "/tmp/stave-project-b",
        rootName: "project-b",
        files: ["package.json", "src/b.ts"],
      },
    ];
    let pickIndex = 0;
    const filesByRoot: Record<string, string[]> = {
      "/tmp/stave-project-a": ["package.json", "src/a.ts"],
      "/tmp/stave-project-a/.stave/workspaces/feature-a": ["package.json", "src/a.ts", "src/feature-a.ts"],
      "/tmp/stave-project-b": ["package.json", "src/b.ts"],
    };

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => {
            const root = projectRoots[pickIndex++];
            return root
              ? { ok: true, ...root }
              : { ok: false, files: [] };
          },
          listFiles: async ({ rootPath }: { rootPath: string }) => ({
            ok: true,
            files: filesByRoot[rootPath] ?? [],
          }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    localStorage.clear();
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      recentProjects: [],
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectName: null,
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().createProject({});

    const stateAfterProjectA = useAppStore.getState();
    const projectADefaultWorkspaceId = stateAfterProjectA.activeWorkspaceId;
    const extraWorkspaceId = "ws-a-extra";
    const extraWorkspacePath = "/tmp/stave-project-a/.stave/workspaces/feature-a";
    const emptySnapshot = {
      activeTaskId: "",
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerConversationByTask: {},
    };
    await upsertWorkspace({
      id: extraWorkspaceId,
      name: "feature-a",
      snapshot: emptySnapshot,
    });
    useAppStore.setState({
      workspaces: [
        ...stateAfterProjectA.workspaces,
        { id: extraWorkspaceId, name: "feature-a", updatedAt: "2026-03-20T00:00:00.000Z" },
      ],
      activeWorkspaceId: extraWorkspaceId,
      workspaceBranchById: {
        ...stateAfterProjectA.workspaceBranchById,
        [extraWorkspaceId]: "feature-a",
      },
      workspacePathById: {
        ...stateAfterProjectA.workspacePathById,
        [extraWorkspaceId]: extraWorkspacePath,
      },
      workspaceDefaultById: {
        ...stateAfterProjectA.workspaceDefaultById,
        [extraWorkspaceId]: false,
      },
    });

    await useAppStore.getState().createProject({});
    const stateAfterProjectB = useAppStore.getState();
    expect(stateAfterProjectB.projectPath).toBe("/tmp/stave-project-b");
    expect(stateAfterProjectB.workspaces).toHaveLength(1);

    await useAppStore.getState().openProject({ projectPath: "/tmp/stave-project-a" });

    const nextState = useAppStore.getState();
    expect(nextState.projectPath).toBe("/tmp/stave-project-a");
    expect(nextState.activeWorkspaceId).toBe(extraWorkspaceId);
    expect(nextState.workspaces.map((workspace) => workspace.id)).toEqual([
      projectADefaultWorkspaceId,
      extraWorkspaceId,
    ]);
    expect(nextState.recentProjects.map((project) => project.projectPath)).toEqual([
      "/tmp/stave-project-a",
      "/tmp/stave-project-b",
    ]);
  });

  test("preserves manual project order when opening different projects", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [{ id: "ws-a", name: "Default Workspace", updatedAt: "2026-03-20T00:00:00.000Z" }],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: { "ws-a": "main", "ws-b": "main" },
      workspacePathById: { "ws-a": "/tmp/stave-project-a", "ws-b": "/tmp/stave-project-b" },
      workspaceDefaultById: { "ws-a": true, "ws-b": true },
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws-a", name: "Default Workspace", updatedAt: "2026-03-20T00:00:00.000Z" }],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: { "ws-a": "main" },
          workspacePathById: { "ws-a": "/tmp/stave-project-a" },
          workspaceDefaultById: { "ws-a": true },
        },
        {
          projectPath: "/tmp/stave-project-b",
          projectName: "project-b",
          lastOpenedAt: "2026-03-20T00:00:01.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws-b", name: "Default Workspace", updatedAt: "2026-03-20T00:00:01.000Z" }],
          activeWorkspaceId: "ws-b",
          workspaceBranchById: { "ws-b": "main" },
          workspacePathById: { "ws-b": "/tmp/stave-project-b" },
          workspaceDefaultById: { "ws-b": true },
        },
      ],
    });

    useAppStore.getState().moveProjectInList({ projectPath: "/tmp/stave-project-b", direction: "up" });
    expect(useAppStore.getState().recentProjects.map((project) => project.projectPath)).toEqual([
      "/tmp/stave-project-b",
      "/tmp/stave-project-a",
    ]);

    await useAppStore.getState().openProject({ projectPath: "/tmp/stave-project-b" });
    await useAppStore.getState().openProject({ projectPath: "/tmp/stave-project-a" });

    expect(useAppStore.getState().recentProjects.map((project) => project.projectPath)).toEqual([
      "/tmp/stave-project-b",
      "/tmp/stave-project-a",
    ]);
  });

  test("preserves manual workspace order when switching workspaces", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot: {
              activeTaskId: "",
              tasks: [],
              messagesByTask: {},
              promptDraftByTask: {},
              providerConversationByTask: {},
            },
          }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [
        { id: "ws-a", name: "Default Workspace", updatedAt: "2026-03-20T00:00:00.000Z" },
        { id: "ws-b", name: "feature-b", updatedAt: "2026-03-20T00:00:01.000Z" },
        { id: "ws-c", name: "feature-c", updatedAt: "2026-03-20T00:00:02.000Z" },
      ],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: { "ws-a": "main", "ws-b": "feature-b", "ws-c": "feature-c" },
      workspacePathById: {
        "ws-a": "/tmp/stave-project-a",
        "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
        "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
      },
      workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
      recentProjects: [{
        projectPath: "/tmp/stave-project-a",
        projectName: "project-a",
        lastOpenedAt: "2026-03-20T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [
          { id: "ws-a", name: "Default Workspace", updatedAt: "2026-03-20T00:00:00.000Z" },
          { id: "ws-b", name: "feature-b", updatedAt: "2026-03-20T00:00:01.000Z" },
          { id: "ws-c", name: "feature-c", updatedAt: "2026-03-20T00:00:02.000Z" },
        ],
        activeWorkspaceId: "ws-a",
        workspaceBranchById: { "ws-a": "main", "ws-b": "feature-b", "ws-c": "feature-c" },
        workspacePathById: {
          "ws-a": "/tmp/stave-project-a",
          "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
          "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
        },
        workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
      }],
    });

    useAppStore.getState().moveWorkspaceInProjectList({
      projectPath: "/tmp/stave-project-a",
      workspaceId: "ws-c",
      direction: "up",
    });

    expect(useAppStore.getState().workspaces.map((workspace) => workspace.id)).toEqual([
      "ws-a",
      "ws-c",
      "ws-b",
    ]);

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-c" });
    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });

    expect(useAppStore.getState().workspaces.map((workspace) => workspace.id)).toEqual([
      "ws-a",
      "ws-c",
      "ws-b",
    ]);
  });
});

describe("workspace snapshot schema compatibility", () => {
  test("loads legacy snapshots with missing prompt draft fields and failed tool states", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [{ id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" }],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
                  activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "codex",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-1": [
                {
                  id: "m-1",
                  role: "assistant",
                  model: "gpt-5",
                  providerId: "codex",
                  content: "",
                  parts: [
                    {
                      type: "tool_use",
                      toolUseId: "tool-1",
                      toolName: "apply_patch",
                      input: "patch",
                      output: "failed",
                      state: "output-error",
                    },
                    {
                      type: "code_diff",
                      filePath: "src/app.ts",
                      oldContent: "a",
                      newContent: "b",
                    },
                  ],
                },
              ],
            },
            promptDraftByTask: {
              "task-1": {
                text: "draft only",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded).not.toBeNull();
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[0]).toMatchObject({
      type: "tool_use",
      toolUseId: "tool-1",
      state: "output-error",
    });
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[1]).toMatchObject({
      type: "code_diff",
      status: "accepted",
    });
    expect(loaded?.promptDraftByTask["task-1"]).toEqual({
      text: "draft only",
      attachedFilePaths: [],
      attachments: [],
    });
    expect(loaded?.providerConversationByTask).toEqual({});
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });

  test("loads snapshots that include usage and prompt suggestions", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [{ id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" }],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
                  activeTaskId: "task-2",
            tasks: [
              {
                id: "task-2",
                title: "Task 2",
                provider: "claude-code",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-2": [
                {
                  id: "m-2",
                  role: "assistant",
                  model: "claude-sonnet-4-6",
                  providerId: "claude-code",
                  content: "Done",
                  usage: {
                    inputTokens: 10,
                    outputTokens: 20,
                    cacheReadTokens: 5,
                    totalCostUsd: 0.02,
                  },
                  promptSuggestions: ["Open a PR with these changes"],
                  parts: [{ type: "text", text: "Done" }],
                },
              ],
            },
            providerConversationByTask: {
              "task-2": {
                "claude-code": "session-live-2",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded?.messagesByTask["task-2"]?.[0]?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      totalCostUsd: 0.02,
    });
    expect(loaded?.messagesByTask["task-2"]?.[0]?.promptSuggestions).toEqual([
      "Open a PR with these changes",
    ]);
    expect(loaded?.providerConversationByTask).toEqual({
      "task-2": {
        "claude-code": "session-live-2",
      },
    });
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });

});

describe("workspace store hydration ordering", () => {
  test("hydrateWorkspaces loads the persisted DB snapshot without overwriting it from renderer defaults", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
                      activeTaskId: "task-db",
              tasks: [
                {
                  id: "task-db",
                  title: "Recovered Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-db": [
                  {
                    id: "task-db-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "loaded from db",
                    parts: [{ type: "text", text: "loaded from db" }],
                  },
                ],
              },
              promptDraftByTask: {
                "task-db": {
                  text: "draft from db",
                },
              },
              providerConversationByTask: {
                "task-db": {
                  codex: "thread-db-1",
                },
              },
            },
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerConversationByTask: {},
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    expect(upsertCalls).toHaveLength(0);
    expect(nextState.hasHydratedWorkspaces).toBe(true);
    expect(nextState.activeTaskId).toBe("task-db");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-db"]);
    expect(nextState.messagesByTask["task-db"]?.[0]?.content).toBe("loaded from db");
    expect(nextState.promptDraftByTask["task-db"]?.text).toBe("draft from db");
    expect(nextState.providerConversationByTask["task-db"]).toEqual({ codex: "thread-db-1" });
  });

  test("hydrateWorkspaces appends an interruption note for incomplete turns from a previous app session", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
                      activeTaskId: "task-stale",
              tasks: [
                {
                  id: "task-stale",
                  title: "Interrupted Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-stale": [
                  {
                    id: "task-stale-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "partial response",
                    parts: [{ type: "text", text: "partial response" }],
                  },
                ],
              },
              promptDraftByTask: {},
              providerConversationByTask: {},
            },
          }),
          listLatestWorkspaceTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-stale-1",
                workspaceId: "ws-main",
                taskId: "task-stale",
                providerId: "codex",
                createdAt: "2026-03-10T00:00:00.000Z",
                completedAt: null,
                eventCount: 1,
              },
            ],
          }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const messages = useAppStore.getState().messagesByTask["task-stale"] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages.at(-1)?.content).toBe("Generation interrupted because Stave was closed before this turn completed.");
    expect(messages.at(-1)?.parts).toEqual([{
      type: "system_event",
      content: "Generation interrupted because Stave was closed before this turn completed.",
    }]);
  });

  test("hydrateWorkspaces restores projectFiles for the explorer on boot", async () => {
    const localStorage = createMemoryStorage();
    const listedFiles = ["package.json", "src/App.tsx"];
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: listedFiles }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [{ id: "ws-main", name: "default", updatedAt: "2026-03-10T00:00:00.000Z" }],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    });

    const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
      import("../src/lib/fs"),
      import("../src/store/app.store"),
    ]);
    await (workspaceFsAdapter as { setRoot?: (args: { rootPath: string; rootName: string; files?: string[] }) => Promise<void> }).setRoot?.({
      rootPath: "/tmp/stave-project",
      rootName: "fixture",
      files: [],
    });

    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [{ id: "ws-main", name: "default", updatedAt: "2026-03-09T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      projectName: "fixture",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    expect(useAppStore.getState().projectFiles).toEqual(listedFiles);
  });

  test("hydrateWorkspaces auto-imports existing git worktrees missing from the DB", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async (args: { id: string; name: string; snapshot: unknown }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({ command }: { cwd?: string; command: string }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return { ok: false, code: 1, stdout: "", stderr: `Unexpected command: ${command}` };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    const importedWorkspace = nextState.workspaces.find((workspace) => workspace.name === "feature/perf");

    expect(importedWorkspace).not.toBeUndefined();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.name).toBe("feature/perf");
    expect(importedWorkspace?.id).toBe(upsertCalls[0]?.id);
    expect(nextState.workspaceBranchById[importedWorkspace?.id ?? ""]).toBe("feature/perf");
    expect(nextState.workspacePathById[importedWorkspace?.id ?? ""]).toBe("/tmp/stave-project/.stave/workspaces/feature__perf");
  });

  test("flushActiveWorkspaceSnapshot is blocked until workspace hydration completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "persist me",
            parts: [{ type: "text", text: "persist me" }],
          },
        ],
      },
    });

    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(0);

    useAppStore.setState({ hasHydratedWorkspaces: true });
    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(1);
  });

  test("switchWorkspace preserves inactive workspace turn state and persists it when the stream completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    const abortCalls: Array<string> = [];
    const cleanupCalls: Array<string> = [];
    let streamListener: ((payload: { streamId: string; event: unknown; done: boolean }) => void) | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "turn-main-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
              { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
            ],
          }),
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot: workspaceId === "ws-alt"
              ? {
                              activeTaskId: "task-alt",
                  tasks: [{
                    id: "task-alt",
                    title: "Alt Task",
                    provider: "claude-code",
                    updatedAt: "2026-03-10T00:00:01.000Z",
                    unread: false,
                  }],
                  messagesByTask: { "task-alt": [] },
                  promptDraftByTask: {},
                  providerConversationByTask: {},
                }
              : null,
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [{
        id: "task-main",
        title: "Main Task",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      }],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeConversationReadyByTask: {},
      providerConversationByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Keep streaming while I switch workspaces.",
    });

    await Bun.sleep(0);

    const startedState = useAppStore.getState();
    const activeTurnId = startedState.activeTurnIdsByTask["task-main"];
    expect(activeTurnId).toBeString();
    expect(streamListener).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    const switchedState = useAppStore.getState();
    expect(abortCalls).toEqual([]);
    expect(cleanupCalls).toEqual([]);
    expect(upsertCalls).toHaveLength(0);
    expect(switchedState.activeWorkspaceId).toBe("ws-alt");
    expect(switchedState.activeTaskId).toBe("task-alt");
    expect(switchedState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(switchedState.workspaceRuntimeCacheById["ws-main"]?.activeTurnIdsByTask["task-main"]).toBe(activeTurnId);
    expect(switchedState.workspaceRuntimeCacheById["ws-main"]?.messagesByTask["task-main"]).toHaveLength(2);

    streamListener?.({
      streamId: "stream-1",
      event: { type: "text", text: "Task 1 kept updating after the workspace switch." },
      done: false,
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const completedState = useAppStore.getState();
    const inactiveWorkspaceSession = completedState.workspaceRuntimeCacheById["ws-main"];
    const inactiveWorkspaceAssistant = inactiveWorkspaceSession?.messagesByTask["task-main"]?.at(-1);

    expect(inactiveWorkspaceSession?.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(inactiveWorkspaceAssistant?.content).toBe("Task 1 kept updating after the workspace switch.");
    expect(inactiveWorkspaceAssistant?.isStreaming).toBe(false);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      id: "ws-main",
      name: "Main",
      snapshot: {
        activeTaskId: "task-main",
      },
    });
    expect((upsertCalls[0] as {
      snapshot: {
        messagesByTask: Record<string, Array<{ content: string }>>;
      };
    }).snapshot.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch."
    );

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-main" });

    const restoredState = useAppStore.getState();
    expect(restoredState.activeWorkspaceId).toBe("ws-main");
    expect(restoredState.activeTaskId).toBe("task-main");
    expect(restoredState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(restoredState.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch."
    );
  });

  test("switchWorkspace restores per-workspace editor tabs", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify([
      {
        id: "ws-alpha",
        name: "alpha",
        updatedAt: "2026-03-10T00:00:00.000Z",
        snapshot: {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          editorTabs: [{
            id: "file:src/alpha.ts",
            filePath: "src/alpha.ts",
            kind: "text",
            language: "typescript",
            content: "export const alpha = 1;\n",
            originalContent: "export const alpha = 1;\n",
            savedContent: "export const alpha = 1;\n",
            baseRevision: "rev-alpha",
            hasConflict: false,
            isDirty: false,
          }],
          activeEditorTabId: "file:src/alpha.ts",
        },
      },
      {
        id: "ws-beta",
        name: "beta",
        updatedAt: "2026-03-10T00:01:00.000Z",
        snapshot: {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          editorTabs: [{
            id: "file:src/beta.ts",
            filePath: "src/beta.ts",
            kind: "text",
            language: "typescript",
            content: "export const beta = 2;\n",
            originalContent: "export const beta = 2;\n",
            savedContent: "export const beta = 2;\n",
            baseRevision: "rev-beta",
            hasConflict: false,
            isDirty: false,
          }],
          activeEditorTabId: "file:src/beta.ts",
        },
      },
    ]));

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-alpha", name: "alpha", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-beta", name: "beta", updatedAt: "2026-03-10T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    let nextState = useAppStore.getState();
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual(["src/alpha.ts"]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual(["src/beta.ts"]);
    expect(nextState.activeEditorTabId).toBe("file:src/beta.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alpha");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual(["src/alpha.ts"]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");
  });
});
