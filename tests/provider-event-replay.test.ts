import { describe, expect, test } from "bun:test";
import {
  appendProviderEventToAssistant,
  replayProviderEventsToTaskState,
} from "@/lib/session/provider-event-replay";
import type { ChatMessage, OrchestrationProgressPart, StaveProcessingPart } from "@/types/chat";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "task-1-m-1",
    role: "assistant",
    model: "stave",
    providerId: "stave",
    content: "",
    isStreaming: true,
    parts: [],
    ...overrides,
  };
}

function createStaveProcessingPart(overrides: Partial<StaveProcessingPart> = {}): StaveProcessingPart {
  return {
    type: "stave_processing",
    strategy: "direct",
    model: "claude-sonnet-4-6",
    reason: "General coding task",
    ...overrides,
  };
}

function createOrchestrationProgressPart(): OrchestrationProgressPart {
  return {
    type: "orchestration_progress",
    supervisorModel: "claude-opus-4-6",
    subtasks: [
      {
        id: "st-1",
        title: "Analyze code",
        model: "claude-haiku-4-5",
        status: "running",
      },
    ],
    status: "executing",
  };
}

describe("appendProviderEventToAssistant", () => {
  test("suppresses streamed Stave routing JSON once the payload is complete", () => {
    const initial = createMessage();

    const partial = appendProviderEventToAssistant({
      message: initial,
      event: {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"claude-sonnet-4-6\",",
      },
    });

    expect(partial.content).toContain("\"strategy\":\"direct\"");
    expect(partial.parts).toEqual([
      {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"claude-sonnet-4-6\",",
      },
    ]);

    const finalized = appendProviderEventToAssistant({
      message: partial,
      event: {
        type: "text",
        text: "\"reason\":\"General coding task\"}",
      },
    });

    expect(finalized.content).toBe("");
    expect(finalized.parts).toEqual([]);
  });

  test("suppresses orchestration breakdown JSON while Stave is still in routing mode", () => {
    const message = createMessage({
      parts: [
        createStaveProcessingPart({
          strategy: "orchestrate",
          model: undefined,
          supervisorModel: "claude-opus-4-6",
          reason: "Needs multiple specialists",
        }),
      ],
    });

    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "[{\"id\":\"st-1\",\"title\":\"Analyze code\",\"model\":\"claude-haiku-4-5\",\"prompt\":\"Inspect auth flow\",\"dependsOn\":[]}]",
      },
    });

    expect(updated.content).toBe("");
    expect(updated.parts).toEqual(message.parts);
  });

  test("keeps JSON text after orchestration progress is already visible", () => {
    const message = createMessage({
      parts: [
        createStaveProcessingPart({
          strategy: "orchestrate",
          model: undefined,
          supervisorModel: "claude-opus-4-6",
          reason: "Needs multiple specialists",
        }),
        createOrchestrationProgressPart(),
      ],
    });

    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]",
      },
    });

    expect(updated.content).toBe("[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]");
    expect(updated.parts.at(-1)).toEqual({
      type: "text",
      text: "[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]",
    });
  });

  test("keeps JSON text after the turn resolves to a real provider", () => {
    const resolved = appendProviderEventToAssistant({
      message: createMessage({
        parts: [createStaveProcessingPart()],
      }),
      event: {
        type: "model_resolved",
        resolvedProviderId: "codex",
        resolvedModel: "gpt-5.4",
      },
    });

    const updated = appendProviderEventToAssistant({
      message: resolved,
      event: {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}",
      },
    });

    expect(updated.providerId).toBe("codex");
    expect(updated.content).toBe("{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}");
    expect(updated.parts.at(-1)).toEqual({
      type: "text",
      text: "{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}",
    });
  });

  test("deduplicates code_diff parts for the same file path", () => {
    let message = createMessage();

    // First diff for file1
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "old-a", newContent: "new-a-v1", status: "accepted" },
    });
    // Diff for file2
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/b.ts", oldContent: "old-b", newContent: "new-b", status: "accepted" },
    });
    // Second diff for file1 (same file modified again)
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "old-a", newContent: "new-a-v2", status: "accepted" },
    });

    // Should have exactly 2 code_diff parts (one per unique file), not 3
    const diffParts = message.parts.filter((p) => p.type === "code_diff");
    expect(diffParts).toHaveLength(2);
    expect(diffParts[0]).toMatchObject({ filePath: "src/a.ts", newContent: "new-a-v2" });
    expect(diffParts[1]).toMatchObject({ filePath: "src/b.ts", newContent: "new-b" });
  });

  test("keeps code_diff parts for different file paths separate", () => {
    let message = createMessage();

    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "accepted" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/b.ts", oldContent: "", newContent: "b", status: "accepted" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/c.ts", oldContent: "", newContent: "c", status: "accepted" },
    });

    const diffParts = message.parts.filter((p) => p.type === "code_diff");
    expect(diffParts).toHaveLength(3);
  });

  test("stores thinking timestamps for the actual reasoning window", () => {
    let message = createMessage();

    message = appendProviderEventToAssistant({
      message,
      event: { type: "thinking", text: "Inspecting...", isStreaming: true },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "text", text: "Done." },
    });

    const thinkingPart = message.parts.find((part) => part.type === "thinking");
    expect(thinkingPart).toBeDefined();
    if (!thinkingPart || thinkingPart.type !== "thinking") {
      throw new Error("expected thinking part");
    }

    expect(thinkingPart.isStreaming).toBe(false);
    expect(typeof thinkingPart.startedAt).toBe("string");
    expect(typeof thinkingPart.completedAt).toBe("string");
    expect(Date.parse(thinkingPart.completedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(thinkingPart.startedAt ?? ""));
  });
});

describe("plan response replay", () => {
  test("appends a dedicated plan message after prior assistant content", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "I have a plan ready." },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      content: "I have a plan ready.",
    });
    expect(replayed.messages[0]?.isPlanResponse).not.toBe(true);
    expect(replayed.messages[1]).toMatchObject({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      content: "1. Inspect\n2. Patch",
      isPlanResponse: true,
      planText: "1. Inspect\n2. Patch",
      isStreaming: false,
    });
  });

  test("stores a standalone plan response when plan_ready arrives first", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "plan_ready", planText: "1. Reproduce\n2. Fix" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      content: "1. Reproduce\n2. Fix",
      isPlanResponse: true,
      planText: "1. Reproduce\n2. Fix",
      isStreaming: false,
    });
  });
});

describe("subagent progress integration", () => {
  test("appends progress to matching Agent tool_use by toolUseId", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
        { type: "tool_use", toolUseId: "toolu_2", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Reading files" },
    });
    const part1 = updated.parts[0] as import("@/types/chat").ToolUsePart;
    const part2 = updated.parts[1] as import("@/types/chat").ToolUsePart;
    expect(part1.progressMessages).toEqual(["Reading files"]);
    expect(part2.progressMessages).toBeUndefined();
  });

  test("appends to last active Agent when toolUseId is not provided", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "output-available" },
        { type: "tool_use", toolUseId: "toolu_2", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", content: "Compiling" },
    });
    const part1 = updated.parts[0] as import("@/types/chat").ToolUsePart;
    const part2 = updated.parts[1] as import("@/types/chat").ToolUsePart;
    expect(part1.progressMessages).toBeUndefined();
    expect(part2.progressMessages).toEqual(["Compiling"]);
  });

  test("accumulates multiple progress messages on the same agent", () => {
    let message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Step 1" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Step 2" },
    });
    const part = message.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Step 1", "Step 2"]);
  });

  test("degrades to system_event when no Agent tool_use exists", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_bash", toolName: "Bash", input: "ls", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", content: "Orphan progress" },
    });
    expect(updated.parts).toHaveLength(2);
    expect(updated.parts[1]).toEqual({
      type: "system_event",
      content: "Subagent progress: Orphan progress",
    });
  });

  test("migrates legacy 'Subagent progress:' system events into Agent tool parts", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "system", content: "Subagent progress: Reading CONVENTIONS.md" },
    });
    const part = updated.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Reading CONVENTIONS.md"]);
  });
});
