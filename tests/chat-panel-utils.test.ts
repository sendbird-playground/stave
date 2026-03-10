import { describe, expect, test } from "bun:test";
import {
  getLatestUserMessageId,
  getMessageBodyFallbackState,
  getMessageScrollFingerprint,
  getRenderableMessageParts,
  groupMessageParts,
  isPendingDiffStatus,
  shouldAutoOpenToolGroup,
  shouldAutoOpenToolPart,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";

describe("isPendingDiffStatus", () => {
  test("returns true only for pending diffs", () => {
    expect(isPendingDiffStatus("pending")).toBe(true);
    expect(isPendingDiffStatus("accepted")).toBe(false);
    expect(isPendingDiffStatus("rejected")).toBe(false);
  });
});

describe("getRenderableMessageParts", () => {
  test("falls back to content when assistant parts are empty", () => {
    expect(getRenderableMessageParts({
      content: "Non-streamed response",
      parts: [],
    })).toEqual([{ type: "text", text: "Non-streamed response" }]);
  });

  test("preserves existing parts when present", () => {
    expect(getRenderableMessageParts({
      content: "Ignored content",
      parts: [{ type: "text", text: "Structured part" }],
    })).toEqual([{ type: "text", text: "Structured part" }]);
  });
});

describe("getLatestUserMessageId", () => {
  test("returns the newest user message id", () => {
    expect(getLatestUserMessageId([
      { id: "assistant-1", role: "assistant" },
      { id: "user-1", role: "user" },
      { id: "assistant-2", role: "assistant" },
      { id: "user-2", role: "user" },
    ])).toBe("user-2");
  });

  test("returns undefined when there is no user message", () => {
    expect(getLatestUserMessageId([
      { id: "assistant-1", role: "assistant" },
    ])).toBeUndefined();
  });
});

describe("getMessageScrollFingerprint", () => {
  test("changes when streaming text grows", () => {
    const initial = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "hello",
      isStreaming: true,
      parts: [{ type: "text", text: "hello" }],
    });
    const updated = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "hello world",
      isStreaming: true,
      parts: [{ type: "text", text: "hello world" }],
    });

    expect(updated).not.toBe(initial);
  });

  test("changes when tool output or state changes", () => {
    const initial = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "",
      isStreaming: true,
      parts: [{ type: "tool_use", toolName: "bash", input: "ls", output: "a", state: "input-streaming" }],
    });
    const updated = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "",
      isStreaming: true,
      parts: [{ type: "tool_use", toolName: "bash", input: "ls", output: "a\nb", state: "output-available" }],
    });

    expect(updated).not.toBe(initial);
  });
});

describe("summarizeDiffLineChanges", () => {
  test("counts inserted and removed lines", () => {
    expect(summarizeDiffLineChanges({
      oldContent: ["alpha", "beta", "gamma"].join("\n"),
      newContent: ["alpha", "beta 2", "gamma", "delta"].join("\n"),
    })).toEqual({
      added: 2,
      removed: 1,
    });
  });

  test("ignores unchanged prefix and suffix lines", () => {
    expect(summarizeDiffLineChanges({
      oldContent: ["same", "old", "tail"].join("\n"),
      newContent: ["same", "new", "tail"].join("\n"),
    })).toEqual({
      added: 1,
      removed: 1,
    });
  });
});

describe("groupMessageParts", () => {
  test("groups consecutive code_diff and file_context parts", () => {
    const segments = groupMessageParts([
      { type: "text", text: "Before" },
      { type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
      { type: "code_diff", filePath: "src/b.ts", oldContent: "x", newContent: "y", status: "pending" },
      { type: "file_context", filePath: "src/c.ts", content: "export {};", language: "ts" },
      { type: "file_context", filePath: "README.md", content: "# title", language: "md" },
      { type: "text", text: "After" },
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "other",
      "diffs",
      "file_contexts",
      "other",
    ]);
    expect(segments[1]).toMatchObject({
      kind: "diffs",
      startIndex: 1,
      parts: [
        { filePath: "src/a.ts" },
        { filePath: "src/b.ts" },
      ],
    });
    expect(segments[2]).toMatchObject({
      kind: "file_contexts",
      startIndex: 3,
      parts: [
        { filePath: "src/c.ts" },
        { filePath: "README.md" },
      ],
    });
  });

  test("keeps subagent and todo tool parts outside tool groups", () => {
    const segments = groupMessageParts([
      { type: "tool_use", toolName: "Read", input: "", state: "output-available", output: "ok" },
      { type: "tool_use", toolName: "agent", input: "", state: "output-available", output: "ok" },
      { type: "tool_use", toolName: "TodoWrite", input: "", state: "output-available", output: "ok" },
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "tools",
      "other",
      "other",
    ]);
  });
});

describe("tool auto-open behavior", () => {
  test("auto-opens individual tool cards only while streaming", () => {
    expect(shouldAutoOpenToolPart("input-streaming")).toBe(true);
    expect(shouldAutoOpenToolPart("input-available")).toBe(false);
    expect(shouldAutoOpenToolPart("output-available")).toBe(false);
    expect(shouldAutoOpenToolPart("output-error")).toBe(false);
  });

  test("auto-opens grouped tools only when at least one tool is streaming", () => {
    expect(shouldAutoOpenToolGroup(["output-error"])).toBe(false);
    expect(shouldAutoOpenToolGroup(["output-available", "output-error"])).toBe(false);
    expect(shouldAutoOpenToolGroup(["output-error", "input-streaming"])).toBe(true);
  });
});

describe("getMessageBodyFallbackState", () => {
  test("shows streaming placeholder only for actively streaming empty turns", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [],
    })).toBe("streaming-placeholder");
  });

  test("treats reasoning-only turns as content", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [{ type: "thinking", text: "step", isStreaming: true }],
    })).toBe("content");
  });

  test("treats tool-only turns as content", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [{ type: "tool_use", toolName: "bash", input: "ls", state: "input-streaming", output: "file.txt" }],
    })).toBe("content");
  });

  test("shows empty completed fallback only for truly empty completed turns", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: false,
      renderableParts: [],
    })).toBe("empty-completed");
  });
});
