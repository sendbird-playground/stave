import { describe, expect, test } from "bun:test";
import { buildAssistantTrace, joinReasoningText } from "@/components/session/message/assistant-trace-builder";
import type { ChatMessage } from "@/types/chat";

function createAssistantMessage(args: Partial<Pick<ChatMessage, "content" | "parts" | "isStreaming">>): Pick<ChatMessage, "content" | "parts" | "isStreaming"> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    isStreaming: args.isStreaming,
  };
}

describe("buildAssistantTrace", () => {
  test("groups consecutive thinking into a single reasoning entry and keeps trailing text as response", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "thinking", text: "Inspecting files. ", isStreaming: true },
          { type: "thinking", text: "Checking providers.", isStreaming: false },
          { type: "text", text: "Patched the renderer." },
        ],
      }),
    });

    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0]?.kind).toBe("reasoning");
    expect(trace.entries[0]?.kind === "reasoning" ? joinReasoningText(trace.entries[0].parts) : "").toBe(
      "Inspecting files. Checking providers."
    );
    expect(trace.responseParts.map((part) => part.text)).toEqual(["Patched the renderer."]);
  });

  test("keeps pre-final assistant text inside chain of thought and reserves trailing text for final response", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "I will inspect the repo first." },
          { type: "tool_use", toolName: "bash", input: "rg Message src", output: "src/App.tsx", state: "output-available" },
          { type: "text", text: "The refactor is complete." },
        ],
      }),
    });

    expect(trace.entries.map((entry) => entry.kind)).toEqual(["assistant_text", "tool"]);
    expect(
      trace.entries[0]?.kind === "assistant_text"
        ? trace.entries[0].parts.map((part) => part.text)
        : []
    ).toEqual(["I will inspect the repo first."]);
    expect(trace.responseParts.map((part) => part.text)).toEqual(["The refactor is complete."]);
  });

  test("classifies tools, filters replay-only system noise, and groups diffs", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          {
            type: "tool_use",
            toolName: "Agent",
            input: "{\"description\":\"Review IPC\",\"prompt\":\"Check schemas\"}",
            output: "Done",
            state: "output-available",
            progressMessages: ["Reading schemas"],
          },
          {
            type: "tool_use",
            toolName: "TodoWrite",
            input: "{\"todos\":[{\"content\":\"Ship UI\",\"status\":\"completed\"}]}",
            state: "output-available",
          },
          { type: "system_event", content: "Modifying: src/components/session/ChatPanel.tsx" },
          { type: "system_event", content: "Subagent progress: Reading schemas" },
          { type: "system_event", content: "Context compacted (auto)." },
          { type: "code_diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "pending" },
          { type: "code_diff", filePath: "src/b.ts", oldContent: "", newContent: "b", status: "accepted" },
        ],
      }),
    });

    expect(trace.entries.map((entry) => entry.kind)).toEqual(["subagent", "todo", "system", "diff"]);
    expect(trace.entries[0]?.kind === "subagent" ? trace.entries[0].part.progressMessages : undefined).toEqual(["Reading schemas"]);
    expect(trace.entries[3]?.kind === "diff" ? trace.entries[3].parts.map((part) => part.filePath) : []).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  test("shows a streaming placeholder when nothing renderable has arrived yet", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
    });

    expect(trace.entries).toEqual([]);
    expect(trace.responseParts).toEqual([]);
    expect(trace.showStreamingPlaceholder).toBe(true);
  });
});
