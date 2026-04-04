import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { ChatMessage } from "@/types/chat";

function createAssistantMessage(
  args: Partial<Pick<ChatMessage, "content" | "parts" | "isStreaming">>,
): Pick<ChatMessage, "content" | "parts" | "isStreaming"> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    isStreaming: args.isStreaming,
  };
}

async function loadAssistantMessageBody() {
  const localStorageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    },
    configurable: true,
  });

  const module = await import("@/components/session/message/assistant-trace");
  return module.AssistantMessageBody;
}

describe("AssistantMessageBody", () => {
  test("shows only the CoT trigger before the first streaming trace entry arrives", async () => {
    const AssistantMessageBody = await loadAssistantMessageBody();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Thinking...</p>");
    expect(html).not.toContain("No response.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("renders the reasoning step once thinking content arrives", async () => {
    const AssistantMessageBody = await loadAssistantMessageBody();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("Inspecting files.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(2);
  });

  test("keeps markdown rendering for the pre-plan assistant message after plan splitting", async () => {
    const AssistantMessageBody = await loadAssistantMessageBody();
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "## Review\n\n- Keep markdown\n- Preserve bullets" },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    const priorAssistantMessage = replayed.messages[0];
    if (!priorAssistantMessage) {
      throw new Error("expected prior assistant message");
    }

    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: priorAssistantMessage,
      taskId: "task-1",
      messageId: priorAssistantMessage.id,
      streamingEnabled: true,
    }));

    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("Keep markdown");
  });
});
