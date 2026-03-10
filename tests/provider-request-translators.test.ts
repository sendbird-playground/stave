import { describe, expect, test } from "bun:test";
import {
  buildProviderTurnPrompt,
  resolveProviderResumeConversationId,
} from "@/lib/providers/provider-request-translators";
import type { CanonicalConversationRequest } from "@/lib/providers/provider.types";

function createConversation(overrides: Partial<CanonicalConversationRequest> = {}): CanonicalConversationRequest {
  return {
    target: {
      providerId: "codex",
      model: "gpt-5.4",
    },
    mode: "chat",
    history: [
      {
        role: "user",
        providerId: "user",
        model: "user",
        content: "Summarize the current repo status.",
        parts: [{ type: "text", text: "Summarize the current repo status." }],
      },
    ],
    input: {
      role: "user",
      providerId: "user",
      model: "user",
      content: "Continue with the runtime refactor.",
      parts: [{ type: "text", text: "Continue with the runtime refactor." }],
    },
    contextParts: [],
    ...overrides,
  };
}

describe("provider request translators", () => {
  test("builds provider prompts from canonical conversation state", () => {
    const prompt = buildProviderTurnPrompt({
      providerId: "codex",
      prompt: "fallback prompt",
      conversation: createConversation(),
    });

    expect(prompt).toContain("[Task Shared Context]");
    expect(prompt).toContain("user: Summarize the current repo status.");
    expect(prompt).toContain("[Current User Input]");
    expect(prompt).toContain("Continue with the runtime refactor.");
  });

  test("omits replayed history when the canonical request carries a resume conversation id", () => {
    const prompt = buildProviderTurnPrompt({
      providerId: "claude-code",
      prompt: "fallback prompt",
      conversation: createConversation({
        target: {
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
        },
        resume: {
          nativeConversationId: "session_123",
        },
      }),
    });

    expect(prompt).not.toContain("[Task Shared Context]");
    expect(prompt).toContain("[Current User Input]");
  });

  test("reads resume ids from canonical conversation metadata", () => {
    const conversation = createConversation({
      resume: {
        nativeConversationId: "thread_456",
      },
    });

    expect(resolveProviderResumeConversationId({ conversation })).toBe("thread_456");
    expect(resolveProviderResumeConversationId({
      conversation,
      fallbackResumeId: "thread_override",
    })).toBe("thread_override");
  });
});
