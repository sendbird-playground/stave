import { describe, expect, test } from "bun:test";
import {
  CODEX_SDK_MODEL_OPTIONS,
  getDefaultModelForProvider,
  getNextProviderId,
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";

describe("model catalog", () => {
  test("includes the verified Codex model set", () => {
    expect(CODEX_SDK_MODEL_OPTIONS).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
    ]);
  });

  test("formats GPT-5.4 with the canonical label", () => {
    expect(toHumanModelName({ model: "gpt-5.4" })).toBe("GPT-5.4");
  });

  test("returns provider labels from the descriptor registry", () => {
    expect(getProviderLabel({ providerId: "claude-code", variant: "full" })).toBe("Claude Code");
    expect(getProviderLabel({ providerId: "claude-code" })).toBe("Claude");
  });

  test("returns provider defaults from the descriptor registry", () => {
    expect(getDefaultModelForProvider({ providerId: "claude-code" })).toBe("claude-sonnet-4-6");
  });

  test("cycles provider order from the descriptor registry", () => {
    expect(getNextProviderId({ providerId: "claude-code" })).toBe("codex");
  });
});
