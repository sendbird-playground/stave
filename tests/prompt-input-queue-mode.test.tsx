import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext() {
  (globalThis as { window?: unknown }).window = {
    api: {},
    localStorage: createMemoryStorage(),
  } as unknown;
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

const MODEL_OPTION: ModelSelectorOption = {
  key: "codex:gpt-5.4",
  providerId: "codex",
  model: "gpt-5.4",
  label: "GPT-5.4",
  available: true,
};

describe("PromptInput queue mode", () => {
  test("renders queued-next-turn preview and queue action during an active turn", async () => {
    setWindowContext();
    const [{ PromptInput }, { TooltipProvider }] = await Promise.all([
      import("@/components/ai-elements/prompt-input"),
      import("@/components/ui"),
    ]);
    const html = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(PromptInput, {
      value: "Follow up after this finishes",
      isTurnActive: true,
      submitMode: "queue-next" as const,
      queuedNextTurn: {
        queuedAt: "2026-04-09T00:00:00.000Z",
        sourceTurnId: "turn-1",
        content: "Follow up after this finishes",
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
    expect(html).toContain("Follow up after this finishes");
    expect(html).toContain("Update queued");
    expect(html).toContain("Clear");
    expect(html).toContain("aria-label=\"Abort\"");
    expect(html).not.toContain("Sends automatically when the current response finishes.");
  });
});
