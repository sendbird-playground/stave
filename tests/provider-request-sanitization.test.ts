import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MAX_FILE_CONTEXT_CONTENT_CHARS } from "@/lib/file-context-sanitization";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("provider request sanitization", () => {
  test("sanitizes oversized file_context payloads before starting a turn", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-oversized",
              turnId: "turn-oversized",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [],
      },
      activeTurnIdsByTask: {},
      nativeConversationReadyByTask: {},
      providerConversationByTask: {},
    });

    const oversizedImagePayload = `data:image/svg+xml;base64,${"z".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 64)}`;
    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Please inspect this image.",
      fileContexts: [{
        filePath: "public/unnamed88.svg",
        content: oversizedImagePayload,
        language: "svg",
      }],
    });

    await Bun.sleep(0);

    const conversationContextParts = startedConversation?.contextParts as Array<Record<string, unknown>> | undefined;
    expect(conversationContextParts?.[0]?.type).toBe("file_context");
    expect(conversationContextParts?.[0]?.content).toBeString();
    expect(String(conversationContextParts?.[0]?.content)).toContain("image payload omitted");
    expect(String(conversationContextParts?.[0]?.content)).not.toContain("data:image/svg+xml;base64");
    expect(String(conversationContextParts?.[0]?.content).length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);

    const storedMessagePart = useAppStore.getState().messagesByTask["task-1"]?.[0]?.parts[0];
    expect(storedMessagePart?.type).toBe("file_context");
    if (storedMessagePart?.type !== "file_context") {
      throw new Error("expected stored file_context part");
    }
    expect(storedMessagePart.content).toContain("image payload omitted");
    expect(storedMessagePart.content).not.toContain("data:image/svg+xml;base64");
    expect(storedMessagePart.content.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized historical tool outputs before starting a follow-up turn", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-history",
              turnId: "turn-history",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const oversizedToolOutput = "o".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 256);

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            parts: [{
              type: "tool_use",
              toolUseId: "tool-1",
              toolName: "bash",
              input: "cat huge.log",
              output: oversizedToolOutput,
              state: "output-available",
            }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      nativeConversationReadyByTask: {},
      providerConversationByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Please continue.",
    });

    await Bun.sleep(0);

    const history = startedConversation?.history as Array<Record<string, unknown>> | undefined;
    const historyParts = history?.[0]?.parts as Array<Record<string, unknown>> | undefined;
    expect(historyParts?.[0]?.type).toBe("tool_use");
    expect(String(historyParts?.[0]?.output)).toContain("tool output truncated");
    expect(String(historyParts?.[0]?.output).length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("strips renderer-only tool metadata from historical tool parts before follow-up turns", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-tool-metadata",
              turnId: "turn-tool-metadata",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            parts: [{
              type: "tool_use",
              toolUseId: "tool-agent-1",
              toolName: "agent",
              input: "{\"task\":\"inspect\"}",
              output: "done",
              state: "output-available",
              elapsedSeconds: 19,
              progressMessages: ["Reading files", "Checking IPC contract"],
            }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      nativeConversationReadyByTask: {},
      providerConversationByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Continue.",
    });

    await Bun.sleep(0);

    const history = startedConversation?.history as Array<Record<string, unknown>> | undefined;
    const historyPart = history?.[0]?.parts as Array<Record<string, unknown>> | undefined;

    expect(historyPart?.[0]).toEqual({
      type: "tool_use",
      toolUseId: "tool-agent-1",
      toolName: "agent",
      input: "{\"task\":\"inspect\"}",
      output: "done",
      state: "output-available",
    });

    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "Continue.",
      conversation: startedConversation,
      taskId: "task-1",
      workspaceId: "ws-main",
    });

    expect(parsed.success).toBe(true);
  });
});
