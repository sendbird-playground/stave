import { describe, expect, test } from "bun:test";
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  getSlashCommandSearchQuery,
  resolveCommandInput,
  type CommandContext,
} from "@/lib/commands";
import type { ProviderCommandCatalogState } from "@/lib/providers/provider-command-catalog";
import type { AppSettings } from "@/store/app.store";

const settings = {
  customCommands: "/stave:clear = @clear\n/meow = Meow from {provider} ({model})",
} as Pick<AppSettings, "customCommands">;

const claudeCommandCatalog: ProviderCommandCatalogState = {
  providerId: "claude-code",
  status: "ready",
  detail: "Loaded 3 Claude native commands.",
  commands: [
    {
      name: "keybindings-help",
      command: "/keybindings-help",
      description: "Customize keyboard shortcuts and keybindings",
    },
    {
      name: "simplify",
      command: "/simplify",
      description: "Review and improve changed code for quality and efficiency",
    },
    {
      name: "claude-api",
      command: "/claude-api",
      description: "Help build apps with the Claude API or Anthropic SDK",
    },
  ],
};

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    provider: "codex",
    model: "gpt-5.4",
    messages: [],
    settings,
    taskId: "task-1",
    taskTitle: "Demo task",
    workspaceCwd: "/tmp/demo",
    checkpoint: "abc123",
    isTurnActive: false,
    providerCommandCatalog: undefined,
    ...overrides,
  };
}

describe("resolveCommandInput", () => {
  test("routes stave status locally under explicit namespace", () => {
    const result = resolveCommandInput("/stave:status", createContext());

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.command).toBe("/stave:status");
    expect(result.response).toContain("Demo task");
    expect(result.response).toContain("Codex (gpt-5.4)");
    expect(result.response).toContain("/tmp/demo");
    expect(result.response).toContain("| **Turn** | idle |");
  });

  test("routes custom Stave commands locally even when settings omit the namespace", () => {
    const result = resolveCommandInput("/stave:meow", createContext({ provider: "claude-code", model: "claude-sonnet-4-6" }));

    expect(result).toEqual({
      kind: "local-response",
      source: "stave_custom",
      command: "/stave:meow",
      response: "Meow from claude-code (claude-sonnet-4-6)",
    });
  });

  test("sums token usage across assistant messages for /stave:usage", () => {
    const result = resolveCommandInput("/stave:usage", createContext({
      messages: [
        {
          id: "user-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "hello",
          parts: [],
        },
        {
          id: "assistant-1",
          role: "assistant",
          model: "gpt-5.4",
          providerId: "codex",
          content: "hi",
          usage: {
            inputTokens: 1200,
            outputTokens: 300,
            cacheReadTokens: 50,
            totalCostUsd: 0.0123,
          },
          parts: [],
        },
        {
          id: "assistant-2",
          role: "assistant",
          model: "gpt-5.4",
          providerId: "codex",
          content: "follow-up",
          usage: {
            inputTokens: 800,
            outputTokens: 200,
            cacheCreationTokens: 25,
            totalCostUsd: 0.01,
          },
          parts: [],
        },
      ],
    }));

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.response).toContain("| **Assistant turns with usage** | 2 |");
    expect(result.response).toContain("| **Input tokens** | 2,000 |");
    expect(result.response).toContain("| **Output tokens** | 500 |");
    expect(result.response).toContain("| **Cache read tokens** | 50 |");
    expect(result.response).toContain("| **Cache creation tokens** | 25 |");
    expect(result.response).toContain("$0.0223");
    expect(result.response).toContain("in 800 / out 200");
  });

  test("preserves clear behavior under /stave:clear", () => {
    expect(resolveCommandInput("/stave:clear", createContext())).toEqual({
      kind: "local-response",
      source: "stave_builtin",
      command: "/stave:clear",
      response: "Conversation cleared.",
      action: "clear",
    });
  });

  test("passes unprefixed slash commands through to the provider", () => {
    expect(resolveCommandInput("/review", createContext())).toEqual({
      kind: "provider-passthrough",
      command: "/review",
      rawArgs: "",
    });
  });

  test("passes supported Claude native commands through when the catalog is loaded", () => {
    expect(resolveCommandInput("/simplify", createContext({
      provider: "claude-code",
      providerCommandCatalog: claudeCommandCatalog,
    }))).toEqual({
      kind: "provider-passthrough",
      command: "/simplify",
      rawArgs: "",
    });
  });

  test("blocks unsupported Claude native commands with a local explanation", () => {
    const result = resolveCommandInput("/usage", createContext({
      provider: "claude-code",
      providerCommandCatalog: claudeCommandCatalog,
    }));

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.source).toBe("provider_meta");
    expect(result.response).toContain("Unknown Claude command for this workspace");
    expect(result.response).toContain("/usage");
    expect(result.response).toContain("/keybindings-help");
    expect(result.response).toContain("/stave:usage");
  });

  test("keeps provider-namespaced commands untouched for passthrough", () => {
    expect(resolveCommandInput("/claude:review", createContext({ provider: "claude-code" }))).toEqual({
      kind: "provider-passthrough",
      command: "/claude:review",
      rawArgs: "",
    });
  });

  test("returns an explanatory local response for unknown /stave commands", () => {
    const result = resolveCommandInput("/stave:unknown", createContext());

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.source).toBe("stave_meta");
    expect(result.response).toContain("Unknown Stave command");
    expect(result.response).toContain("/stave:unknown");
    expect(result.response).toContain("/stave:help");
  });

  test("returns sync action with workspace path for /stave:sync", () => {
    const result = resolveCommandInput("/stave:sync", createContext({ workspaceCwd: "/home/user/project" }));

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.source).toBe("stave_builtin");
    expect(result.command).toBe("/stave:sync");
    expect(result.action).toBe("sync");
    expect(result.response).toContain("/home/user/project");
  });

  test("returns sync action even without workspace path", () => {
    const result = resolveCommandInput("/stave:sync", createContext({ workspaceCwd: undefined }));

    expect(result.kind).toBe("local-response");
    if (result.kind !== "local-response") {
      return;
    }
    expect(result.action).toBe("sync");
    expect(result.response).toContain("unknown workspace");
  });
});

describe("getSlashCommandSearchQuery", () => {
  test("opens palette only while editing the first slash token", () => {
    expect(getSlashCommandSearchQuery("/st")).toBe("/st");
    expect(getSlashCommandSearchQuery("   /stave:cl")).toBe("/stave:cl");
    expect(getSlashCommandSearchQuery("/stave:status now")).toBeNull();
    expect(getSlashCommandSearchQuery("hello")).toBeNull();
  });
});

describe("buildCommandPaletteItems", () => {
  test("lists builtin, normalized custom, and Claude native commands", () => {
    const palette = buildCommandPaletteItems({
      provider: "claude-code",
      settings,
      providerCommandCatalog: claudeCommandCatalog,
    });

    expect(palette.items.map((item) => item.command)).toContain("/stave:status");
    expect(palette.items.map((item) => item.command)).toContain("/stave:sync");
    expect(palette.items.map((item) => item.command)).toContain("/stave:meow");
    expect(palette.items.map((item) => item.command)).toContain("/simplify");
    expect(palette.providerNote.title).toBe("Claude native commands");
  });
});

describe("filterCommandPaletteItems", () => {
  test("matches explicit Stave commands by bare command name", () => {
    const palette = buildCommandPaletteItems({
      provider: "claude-code",
      settings,
      providerCommandCatalog: claudeCommandCatalog,
    });

    expect(filterCommandPaletteItems({
      items: palette.items,
      query: "/clear",
    }).map((item) => item.command)).toContain("/stave:clear");

    expect(filterCommandPaletteItems({
      items: palette.items,
      query: "/meow",
    }).map((item) => item.command)).toContain("/stave:meow");

    expect(filterCommandPaletteItems({
      items: palette.items,
      query: "/simp",
    }).map((item) => item.command)).toContain("/simplify");

    expect(filterCommandPaletteItems({
      items: palette.items,
      query: "/sync",
    }).map((item) => item.command)).toContain("/stave:sync");
  });
});
