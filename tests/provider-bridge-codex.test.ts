import { afterEach, describe, expect, test } from "bun:test";
import { getProviderAdapter } from "@/lib/providers";

const originalWindow = globalThis.window;

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("codex provider bridge normalization", () => {
  test("accepts normalized bridge events from Electron push streams", async () => {
    let listener: ((payload: { streamId: string; event: unknown; done: boolean }) => void) | null = null;
    let receivedArgs: Record<string, unknown> | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (cb: (payload: { streamId: string; event: unknown; done: boolean }) => void) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async (args: Record<string, unknown>) => {
          receivedArgs = args;
          listener?.({ streamId: "codex-stream-1", event: { type: "text", text: "Hello from Codex" }, done: false });
          listener?.({ streamId: "codex-stream-1", event: { type: "done" }, done: true });
          return { ok: true, streamId: "codex-stream-1", turnId: "turn-1" };
        },
      },
    });

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of adapter.runTurn({
      prompt: "hello",
      conversation: {
        target: { providerId: "codex", model: "gpt-5.4" },
        mode: "chat",
        history: [],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
        contextParts: [],
      },
    })) {
      events.push(event as { type: string; text?: string });
    }

    expect(receivedArgs?.conversation).toEqual({
      target: { providerId: "codex", model: "gpt-5.4" },
      mode: "chat",
      history: [],
      input: {
        role: "user",
        providerId: "user",
        model: "user",
        content: "hello",
        parts: [{ type: "text", text: "hello" }],
      },
      contextParts: [],
    });
    expect(events).toEqual([
      { type: "text", text: "Hello from Codex" },
      { type: "done" },
    ]);
  });
});
