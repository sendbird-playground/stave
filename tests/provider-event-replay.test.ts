import { describe, expect, test } from "bun:test";
import { appendProviderEventToAssistant } from "@/lib/session/provider-event-replay";
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
});
