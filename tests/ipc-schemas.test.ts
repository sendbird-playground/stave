import { describe, expect, test } from "bun:test";
import { FilesystemRepoMapArgsSchema, StreamTurnArgsSchema } from "../electron/main/ipc/schemas";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

describe("provider IPC schemas", () => {
  test("accepts stave_processing in canonical history", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      turnId: "turn-1",
      providerId: "stave",
      prompt: "그럼 수정해보자",
      taskId: "task-1",
      workspaceId: "workspace-1",
      conversation: {
        turnId: "turn-1",
        taskId: "task-1",
        workspaceId: "workspace-1",
        target: {
          providerId: "stave",
          model: "stave-auto",
        },
        mode: "chat",
        history: [{
          messageId: "task-1-m-1",
          role: "assistant",
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
          content: "",
          parts: [{
            type: "stave_processing",
            strategy: "direct",
            model: "claude-sonnet-4-6",
            reason: "General task",
            fastModeRequested: false,
            fastModeApplied: false,
          }],
        }],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "그럼 수정해보자",
          parts: [{
            type: "text",
            text: "그럼 수정해보자",
          }],
        },
        contextParts: [],
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts stave_processing in workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Debug Unexpected Failure",
          provider: "stave",
          updatedAt: "2026-03-25T13:15:32.623Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [{
            id: "task-1-m-1",
            role: "assistant",
            providerId: "stave",
            model: "stave-auto",
            content: "",
            parts: [{
              type: "stave_processing",
              strategy: "direct",
              model: "claude-sonnet-4-6",
              reason: "General task",
              fastModeRequested: false,
              fastModeApplied: false,
            }],
          }],
        },
        promptDraftByTask: {},
        providerConversationByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.messagesByTask["task-1"]?.[0]?.parts[0]).toEqual({
      type: "stave_processing",
      strategy: "direct",
      model: "claude-sonnet-4-6",
      reason: "General task",
      fastModeRequested: false,
      fastModeApplied: false,
    });
  });

  test("accepts repo-map filesystem requests with optional refresh", () => {
    expect(FilesystemRepoMapArgsSchema.safeParse({
      rootPath: "/tmp/project",
      refresh: true,
    }).success).toBe(true);
    expect(FilesystemRepoMapArgsSchema.safeParse({
      rootPath: "/tmp/project",
      refresh: "yes",
    }).success).toBe(false);
  });

});
