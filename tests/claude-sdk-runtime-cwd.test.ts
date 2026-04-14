import { afterEach, describe, expect, mock, test } from "bun:test";

const queryCalls: Array<{ prompt: string; options: { cwd?: string } }> = [];
const closeCalls: string[] = [];

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { prompt: string; options: { cwd?: string } }) => {
    queryCalls.push(args);
    return {
      supportedCommands: async () => [{
        name: "review",
        description: "Review the current change",
      }],
      close: () => {
        closeCalls.push("close");
      },
    };
  },
}));

mock.module("../electron/providers/cli-path-env", () => ({
  buildClaudeCliEnv: () => ({
    PATH: "/tmp/bin",
  }),
}));

mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  readPrimaryStaveLocalMcpManifest: async () => null,
  STAVE_LOCAL_MCP_SERVER_NAME: "stave-local-mcp",
  toClaudeSdkMcpServerConfig: (value: unknown) => value,
}));

const { getClaudeCommandCatalog } = await import("../electron/providers/claude-sdk-runtime");

afterEach(() => {
  queryCalls.length = 0;
  closeCalls.length = 0;
  mock.restore();
});

describe("getClaudeCommandCatalog", () => {
  test("falls back to process cwd for relative paths", async () => {
    const result = await getClaudeCommandCatalog({
      cwd: "relative/workspace",
      runtimeOptions: {
        claudeBinaryPath: "/tmp/bin/claude",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      supported: true,
      commands: [{
        name: "review",
        command: "/review",
        description: "Review the current change",
      }],
    });
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.options.cwd).toBe(process.cwd());
    expect(closeCalls).toEqual(["close"]);
  });
});
