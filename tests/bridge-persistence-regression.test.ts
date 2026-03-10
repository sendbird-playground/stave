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
      attachedFilePath: "",
    });
    expect(loaded?.providerConversationByTask).toEqual({});
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
  });

  test("migrates legacy single-provider conversation state into per-provider ids", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [{ id: "legacy", name: "Legacy", updatedAt: "2026-03-10T00:00:00.000Z" }],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            version: 2,
            activeTaskId: "task-3",
            tasks: [
              {
                id: "task-3",
                title: "Task 3",
                provider: "codex",
                updatedAt: "2026-03-10T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-3": [],
            },
            promptDraftByTask: {},
            providerConversationByTask: {
              "task-3": {
                providerId: "codex",
                nativeConversationId: "thread-legacy-3",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "legacy" });

    expect(loaded?.providerConversationByTask).toEqual({
      "task-3": {
        codex: "thread-legacy-3",
      },
    });
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
              version: 3,
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
                  attachedFilePath: "",
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
              version: 3,
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

  test("switchWorkspace interrupts active turns before persisting the current workspace", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    const abortCalls: Array<string> = [];
    const cleanupCalls: Array<string> = [];

    setWindowContext({
      localStorage,
      api: {
        provider: {
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
                  version: 3,
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
    });

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
      tasks: [{
        id: "task-main",
        title: "Main Task",
        provider: "codex",
        updatedAt: "2026-03-10T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      }],
      messagesByTask: {
        "task-main": [{
          id: "task-main-m-1",
          role: "assistant",
          model: "gpt-5",
          providerId: "codex",
          content: "streaming",
          isStreaming: true,
          parts: [{ type: "text", text: "streaming" }],
        }],
      },
      activeTurnIdsByTask: {
        "task-main": "turn-main-1",
      },
      promptDraftByTask: {},
      providerConversationByTask: {},
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    expect(abortCalls).toEqual(["turn-main-1"]);
    expect(cleanupCalls).toEqual(["task-main"]);
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
      "Generation interrupted because you switched workspaces before this turn completed."
    );

    const nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alt");
    expect(nextState.activeTaskId).toBe("task-alt");
    expect(nextState.activeTurnIdsByTask["task-main"]).toBeUndefined();
  });
});
