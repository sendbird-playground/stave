import { describe, expect, test } from "bun:test";
import {
  getLatestPromptSuggestions,
  getPromptHistoryEntries,
  mergePromptSuggestionWithDraft,
} from "@/components/session/chat-input.utils";

describe("getPromptHistoryEntries", () => {
  test("collects non-empty user prompts in chronological order", () => {
    expect(getPromptHistoryEntries([
      {
        id: "m-1",
        role: "user",
        model: "user",
        providerId: "user",
        content: "first prompt",
        parts: [],
      },
      {
        id: "m-2",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "response",
        parts: [],
      },
      {
        id: "m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "",
        parts: [],
      },
      {
        id: "m-4",
        role: "user",
        model: "user",
        providerId: "user",
        content: "second prompt",
        parts: [],
      },
    ])).toEqual([
      "first prompt",
      "second prompt",
    ]);
  });
});

describe("getLatestPromptSuggestions", () => {
  test("returns the latest assistant suggestions", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "First",
        promptSuggestions: ["Old one"],
        parts: [],
      },
      {
        id: "m-2",
        role: "user",
        model: "user",
        providerId: "user",
        content: "Thanks",
        parts: [],
      },
      {
        id: "m-3",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Second",
        promptSuggestions: ["Follow up", "Follow up", "  Another step  "],
        parts: [],
      },
    ])).toEqual(["Follow up", "Another step"]);
  });

  test("returns empty when there are no assistant suggestions", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "No suggestions",
        parts: [],
      },
    ])).toEqual([]);
  });

  test("does not reuse stale suggestions from an older assistant message", () => {
    expect(getLatestPromptSuggestions([
      {
        id: "m-1",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Older",
        promptSuggestions: ["Old one"],
        parts: [],
      },
      {
        id: "m-2",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "Latest",
        parts: [],
      },
    ])).toEqual([]);
  });
});

describe("mergePromptSuggestionWithDraft", () => {
  test("uses the suggestion directly when the draft is empty", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "",
      suggestion: "Open a PR",
    })).toBe("Open a PR");
  });

  test("appends the suggestion when draft content already exists", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "Summarize the diff",
      suggestion: "Open a PR",
    })).toBe("Summarize the diff\nOpen a PR");
  });

  test("does not duplicate an identical draft", () => {
    expect(mergePromptSuggestionWithDraft({
      currentDraft: "Open a PR",
      suggestion: "Open a PR",
    })).toBe("Open a PR");
  });
});
