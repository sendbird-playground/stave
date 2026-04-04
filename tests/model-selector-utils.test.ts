import { describe, expect, test } from "bun:test";
import {
  buildModelSelectorOptions,
  buildRecommendedModelSelectorOptions,
  buildModelSelectorValue,
} from "@/components/ai-elements/model-selector.utils";

describe("model selector utils", () => {
  test("can build prompt-input options across all providers", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["stave", "claude-code", "codex"],
    });

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "stave:stave-auto",
        model: "stave-auto",
        providerId: "stave",
      }),
      expect.objectContaining({
        key: "claude-code:claude-sonnet-4-6",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
      }),
      expect.objectContaining({
        key: "codex:gpt-5.4",
        model: "gpt-5.4",
        providerId: "codex",
      }),
    ]));
  });

  test("can build routed-role options without the stave meta-model", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["claude-code", "codex"],
    });

    expect(options.map((option) => option.key)).not.toContain("stave:stave-auto");
    expect(options.map((option) => option.providerId)).toEqual(expect.not.arrayContaining(["stave"]));
  });

  test("infers a provider-specific display value from a persisted model id", () => {
    expect(buildModelSelectorValue({ model: "gpt-5.3-codex" })).toMatchObject({
      key: "codex:gpt-5.3-codex",
      providerId: "codex",
      label: "GPT-5.3-Codex",
      available: true,
    });
  });

  test("builds the recommended group from available options in the expected order", () => {
    const options = buildModelSelectorOptions({
      providerIds: ["stave", "claude-code", "codex"],
      availabilityByProvider: {
        stave: true,
        "claude-code": true,
        codex: true,
      },
    });

    expect(buildRecommendedModelSelectorOptions({ options }).map((option) => option.key)).toEqual([
      "claude-code:opusplan",
      "codex:gpt-5.4",
      "stave:stave-auto",
    ]);
  });
});
