import { describe, expect, test } from "bun:test";
import {
  buildCanonicalConversationRequest,
  buildLegacyPromptFromCanonicalRequest,
} from "@/lib/providers/canonical-request";
import type { ChatMessage } from "@/types/chat";

const history: ChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    model: "user",
    providerId: "user",
    content: "Summarize the repo status.",
    parts: [{ type: "text", text: "Summarize the repo status." }],
  },
  {
    id: "assistant-1",
    role: "assistant",
    model: "gpt-5.4",
    providerId: "codex",
    content: "",
    isPlanResponse: true,
    planText: "1. Check git status\n2. Review recent changes",
    parts: [{ type: "system_event", content: "Plan response generated." }],
  },
];

describe("canonical request builder", () => {
  test("builds a provider-agnostic request snapshot from task history and current input", () => {
    const request = buildCanonicalConversationRequest({
      turnId: "turn-1",
      taskId: "task-1",
      workspaceId: "workspace-1",
      providerId: "codex",
      model: "gpt-5.4",
      history,
      userInput: "Proceed with step 1.",
      mode: "chat",
      fileContext: {
        filePath: "src/store/app.store.ts",
        content: "const answer = 42;",
        language: "ts",
        instruction: "Focus on the provider request path.",
      },
      nativeConversationId: "thread_123",
    });

    expect(request.target).toEqual({
      providerId: "codex",
      model: "gpt-5.4",
    });
    expect(request.mode).toBe("chat");
    expect(request.history).toHaveLength(2);
    expect(request.input.content).toBe("Proceed with step 1.");
    expect(request.contextParts).toEqual([
      {
        type: "file_context",
        filePath: "src/store/app.store.ts",
        content: "const answer = 42;",
        language: "ts",
        instruction: "Focus on the provider request path.",
      },
    ]);
    expect(request.resume).toEqual({
      nativeConversationId: "thread_123",
    });
  });

  test("rebuilds the current legacy prompt from the canonical request history and input", () => {
    const request = buildCanonicalConversationRequest({
      providerId: "codex",
      model: "gpt-5.4",
      history,
      userInput: "Add a migration plan.",
      mode: "chat",
    });

    const prompt = buildLegacyPromptFromCanonicalRequest({
      request,
    });

    expect(prompt).toContain("[Task Shared Context]");
    expect(prompt).toContain("assistant: 1. Check git status");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("Add a migration plan.");
  });
});
