import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";
import { TooltipProvider } from "@/components/ui";

const MODEL_OPTION: ModelSelectorOption = {
  key: "codex:gpt-5.4",
  providerId: "codex",
  model: "gpt-5.4",
  label: "GPT-5.4",
  available: true,
};

describe("PromptInput queue mode", () => {
  test("renders queued-next-turn status and queue action during an active turn", () => {
    const html = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(PromptInput, {
      value: "Follow up after this finishes",
      isTurnActive: true,
      submitMode: "queue-next" as const,
      queuedNextTurn: {
        queuedAt: "2026-04-09T00:00:00.000Z",
        sourceTurnId: "turn-1",
      },
      selectedModel: MODEL_OPTION,
      modelOptions: [MODEL_OPTION],
      attachedFilePaths: [],
      onValueChange: () => {},
      onModelSelect: () => {},
      onAttachFilesChange: () => {},
      onSubmit: () => {},
      onClearQueuedNextTurn: () => {},
      onAbort: () => {},
    })));

    expect(html).toContain("Queued next turn");
    expect(html).toContain("Update queued");
    expect(html).toContain("Clear");
    expect(html).toContain("aria-label=\"Abort\"");
  });
});
