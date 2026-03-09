import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import { listWorkspaceSummaries, loadWorkspaceSnapshot, upsertWorkspace } from "@/lib/db/workspaces.db";

const originalWindow = globalThis.window;

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
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
  });
});
