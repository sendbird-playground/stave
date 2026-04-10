import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  buildClaudeEnv: () => ({}),
  cleanupClaudeTask: () => {},
  getClaudeCommandCatalog: async () => ({
    ok: true,
    supported: true,
    commands: [],
    detail: "",
  }),
  getClaudeContextUsage: async () => ({ ok: true, detail: "" }),
  prewarmClaudeSdk: async () => ({ ok: true, detail: "" }),
  reloadClaudePlugins: async () => ({ ok: true, detail: "" }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: async () => [{ type: "done" }],
  suggestClaudeCommitMessage: async () => "fix: stub",
  suggestClaudePRDescription: async () => ({
    ok: true,
    title: "fix: stub",
    body: "stub",
  }),
  suggestClaudeTaskName: async () => "stub",
}));

mock.module("../electron/providers/codex-sdk-runtime", () => ({
  cleanupCodexTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithSdk: async (args: { onEvent?: (event: { type: string }) => void }) => {
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  cleanupCodexAppServerTask: () => {},
  getCodexConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
  streamCodexWithAppServer: async (args: { onEvent?: (event: { type: string }) => void }) => {
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
}));

const { providerRuntime } = await import("../electron/providers/runtime");

afterEach(async () => {
  await providerRuntime.shutdown();
});

describe("providerRuntime.startTurnStream", () => {
  test("does not synchronously emit push events before returning", async () => {
    let returned = false;
    let sawSynchronousEvent = false;
    const events: string[] = [];
    let resolveDone = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const started = providerRuntime.startTurnStream(
      {
        providerId: "codex",
        prompt: "smoke",
      },
      {
        onEvent: (event) => {
          if (!returned) {
            sawSynchronousEvent = true;
          }
          events.push(event.type);
        },
        onDone: () => {
          resolveDone();
        },
      },
    );

    returned = true;
    await donePromise;

    expect(started.ok).toBe(true);
    expect(sawSynchronousEvent).toBe(false);
    expect(events).toContain("done");
  });

  test("shutdown clears buffered polling streams", async () => {
    const started = providerRuntime.startTurnStream({
      providerId: "codex",
      prompt: "smoke",
    });

    await Promise.resolve();
    await Promise.resolve();
    await providerRuntime.shutdown();

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 0,
      }),
    ).toEqual({
      ok: false,
      events: [],
      cursor: 0,
      done: true,
      message: "Stream session not found.",
    });
  });
});
