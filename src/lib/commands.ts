import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderCommandCatalogState, ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";
import { getProviderLabel, providerSupportsNativeCommandCatalog } from "@/lib/providers/model-catalog";
import type { AppSettings } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

export interface CommandContext {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  settings: Pick<AppSettings, "customCommands">;
  taskId: string;
  taskTitle?: string;
  workspaceCwd?: string;
  checkpoint?: string;
  isTurnActive?: boolean;
  providerCommandCatalog?: ProviderCommandCatalogState;
}

export interface CommandPaletteItem {
  id: string;
  command: string;
  insertText: string;
  description: string;
  source: "stave_builtin" | "stave_custom" | "provider_native";
  searchText: string;
}

export interface CommandPaletteProviderNote {
  title: string;
  description: string;
}

export type CommandResult =
  | { kind: "not-command" }
  | { kind: "provider-passthrough"; command: string; rawArgs: string }
  | {
    kind: "local-response";
    source: "stave_builtin" | "stave_custom" | "stave_meta" | "provider_meta";
    command: string;
    response: string;
    action?: "clear" | "sync";
  };

interface ParsedCustomCommand {
  responseTemplate: string;
  action?: "clear";
}

interface ParsedSlashCommand {
  cmd: string;
  rawArgs: string;
}

interface StaveBuiltinCommand {
  command: string;
  description: string;
  run: (ctx: CommandContext) => { response: string; action?: "clear" };
}

const STAVE_NAMESPACE = "/stave:";
const integerFormatter = new Intl.NumberFormat("en-US");

function formatInteger(value: number) {
  return integerFormatter.format(value);
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function markdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map(row => `| ${row.map(cell => cell.replaceAll("|", "\\|")).join(" | ")} |`);
  return [headerRow, separator, ...dataRows].join("\n");
}

function markdownKeyValueTable(entries: Array<{ key: string; value: string }>): string {
  return markdownTable(
    ["Property", "Value"],
    entries.map(e => [`**${e.key}**`, e.value]),
  );
}

function toStaveCommandKey(args: { cmd: string }) {
  const normalized = args.cmd.trim().toLowerCase();
  if (!normalized) {
    return STAVE_NAMESPACE;
  }
  if (normalized.startsWith(STAVE_NAMESPACE)) {
    return normalized;
  }
  if (!normalized.startsWith("/")) {
    return `${STAVE_NAMESPACE}${normalized}`;
  }
  return `${STAVE_NAMESPACE}${normalized.slice(1)}`;
}

function toCommandSearchText(args: { command: string; description: string }) {
  const withoutPrefix = args.command.startsWith(STAVE_NAMESPACE)
    ? args.command.slice(STAVE_NAMESPACE.length)
    : args.command.replace(/^\//, "");
  return [
    args.command,
    withoutPrefix,
    withoutPrefix.replaceAll(":", " "),
    args.description,
  ].join(" ").toLowerCase();
}

function parseCustomCommandMap(args: { value: string }) {
  const map = new Map<string, ParsedCustomCommand>();
  const lines = args.value.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const arrowIndex = line.indexOf("=>");
    const equalIndex = line.indexOf("=");
    const separatorIndex = arrowIndex >= 0 ? arrowIndex : equalIndex;
    const separatorLength = arrowIndex >= 0 ? 2 : 1;
    if (separatorIndex <= 0) {
      continue;
    }

    const rawCommand = line.slice(0, separatorIndex).trim();
    const rawResponse = line.slice(separatorIndex + separatorLength).trim();
    if (!rawCommand || !rawResponse) {
      continue;
    }

    const canonicalCommand = toStaveCommandKey({
      cmd: rawCommand.startsWith("/") ? rawCommand : `/${rawCommand}`,
    });

    map.set(canonicalCommand, {
      responseTemplate: rawResponse,
      action: rawResponse === "@clear" ? "clear" : undefined,
    });
  }
  return map;
}

function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const cmd = (parts[0] ?? "").toLowerCase();
  const rawArgs = parts.slice(1).join(" ").trim();
  if (!cmd) {
    return null;
  }

  return { cmd, rawArgs };
}

function fillTemplate(args: {
  template: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  rawArgs: string;
}) {
  const userMessages = args.messages.filter((message) => message.role === "user").length;
  const assistantMessages = args.messages.filter((message) => message.role === "assistant").length;

  return args.template
    .replaceAll("{args}", args.rawArgs)
    .replaceAll("{provider}", args.provider)
    .replaceAll("{model}", args.model)
    .replaceAll("{user_count}", String(userMessages))
    .replaceAll("{assistant_count}", String(assistantMessages));
}

function buildStatusResponse(ctx: CommandContext) {
  const userMessages = ctx.messages.filter((message) => message.role === "user").length;
  const assistantMessages = ctx.messages.filter((message) => message.role === "assistant").length;
  const taskLabel = ctx.taskTitle?.trim() || ctx.taskId;

  return markdownKeyValueTable([
    { key: "Task", value: taskLabel },
    { key: "Provider", value: `${getProviderLabel({ providerId: ctx.provider })} (${ctx.model})` },
    { key: "Workspace", value: `\`${ctx.workspaceCwd ?? "Unknown"}\`` },
    { key: "Turn", value: ctx.isTurnActive ? "active" : "idle" },
    { key: "Messages", value: `${formatInteger(userMessages)} user, ${formatInteger(assistantMessages)} assistant` },
    { key: "Checkpoint", value: ctx.checkpoint ? `\`${ctx.checkpoint}\`` : "Not captured yet" },
  ]);
}

function buildUsageResponse(ctx: CommandContext) {
  const assistantMessages = ctx.messages.filter((message) => message.role === "assistant");
  const usageMessages = assistantMessages.filter((message) => message.usage);
  if (usageMessages.length === 0) {
    return [
      "No token usage recorded yet for this task.",
      `Provider: ${getProviderLabel({ providerId: ctx.provider })} (${ctx.model})`,
    ].join("\n");
  }

  const totals = usageMessages.reduce((acc, message) => ({
    inputTokens: acc.inputTokens + (message.usage?.inputTokens ?? 0),
    outputTokens: acc.outputTokens + (message.usage?.outputTokens ?? 0),
    cacheReadTokens: acc.cacheReadTokens + (message.usage?.cacheReadTokens ?? 0),
    cacheCreationTokens: acc.cacheCreationTokens + (message.usage?.cacheCreationTokens ?? 0),
    totalCostUsd: acc.totalCostUsd + (message.usage?.totalCostUsd ?? 0),
    hasCacheRead: acc.hasCacheRead || message.usage?.cacheReadTokens != null,
    hasCacheCreation: acc.hasCacheCreation || message.usage?.cacheCreationTokens != null,
    hasCost: acc.hasCost || message.usage?.totalCostUsd != null,
  }), {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    hasCacheRead: false,
    hasCacheCreation: false,
    hasCost: false,
  });

  const lastUsage = [...usageMessages].reverse().find((message) => message.usage)?.usage;
  const entries: Array<{ key: string; value: string }> = [
    { key: "Provider", value: `${getProviderLabel({ providerId: ctx.provider })} (${ctx.model})` },
    { key: "Assistant turns with usage", value: formatInteger(usageMessages.length) },
    { key: "Input tokens", value: formatInteger(totals.inputTokens) },
    { key: "Output tokens", value: formatInteger(totals.outputTokens) },
  ];

  if (totals.hasCacheRead) {
    entries.push({ key: "Cache read tokens", value: formatInteger(totals.cacheReadTokens) });
  }
  if (totals.hasCacheCreation) {
    entries.push({ key: "Cache creation tokens", value: formatInteger(totals.cacheCreationTokens) });
  }
  if (totals.hasCost) {
    entries.push({ key: "Total cost", value: formatUsd(totals.totalCostUsd) });
  }
  if (lastUsage) {
    entries.push({ key: "Last response", value: `in ${formatInteger(lastUsage.inputTokens)} / out ${formatInteger(lastUsage.outputTokens)}` });
  }

  return markdownKeyValueTable(entries);
}

function buildProviderPassthroughNote(provider: ProviderId) {
  const providerLabel = getProviderLabel({ providerId: provider });
  if (providerSupportsNativeCommandCatalog({ providerId: provider })) {
    return `Supported ${providerLabel} slash commands are forwarded unchanged to ${providerLabel}. Unsupported ones are blocked locally once the current workspace catalog is loaded.`;
  }
  return [
    `Unprefixed slash commands are forwarded unchanged to ${providerLabel}.`,
    `${providerLabel} native slash-command behavior depends on the current SDK-backed runtime path.`,
  ].join("\n");
}

function buildProviderPaletteNote(args: {
  provider: ProviderId;
  providerCommandCatalog?: ProviderCommandCatalogState;
}): CommandPaletteProviderNote {
  const providerLabel = getProviderLabel({ providerId: args.provider });
  if (!providerSupportsNativeCommandCatalog({ providerId: args.provider })) {
    return {
      title: `${providerLabel} passthrough`,
      description: buildProviderPassthroughNote(args.provider),
    };
  }

  const catalog = args.providerCommandCatalog;
  if (!catalog || catalog.status === "idle") {
    return {
      title: `${providerLabel} command catalog`,
      description: `${providerLabel} native slash commands have not been loaded yet for this workspace.`,
    };
  }
  if (catalog.status === "loading") {
    return {
      title: `${providerLabel} command catalog`,
      description: `Loading ${providerLabel} native slash commands for the current workspace...`,
    };
  }
  if (catalog.status === "error") {
    return {
      title: `${providerLabel} command catalog`,
      description: `${catalog.detail}\nUnsupported commands may still pass through unchanged until the catalog is available.`,
    };
  }
  if (catalog.status === "unsupported") {
    return {
      title: `${providerLabel} command catalog`,
      description: catalog.detail,
    };
  }

  return {
    title: `${providerLabel} native commands`,
    description: catalog.detail || buildProviderPassthroughNote(args.provider),
  };
}

function formatProviderCommandLine(command: ProviderSlashCommand) {
  const name = command.argumentHint
    ? `${command.command} ${command.argumentHint}`
    : command.command;
  return `- ${name}: ${command.description}`;
}

function findProviderCommand(args: {
  command: string;
  providerCommandCatalog?: ProviderCommandCatalogState;
}) {
  const candidate = args.command.trim().toLowerCase();
  const commands = args.providerCommandCatalog?.commands ?? [];
  return commands.find((command) => command.command.toLowerCase() === candidate || `/${command.name}`.toLowerCase() === candidate);
}

function listCustomCommandKeys(args: { settings: Pick<AppSettings, "customCommands"> }) {
  return Array.from(parseCustomCommandMap({ value: args.settings.customCommands ?? "" }).keys())
    .filter((command) => !staveBuiltinCommands.some((builtin) => builtin.command === command))
    .sort((left, right) => left.localeCompare(right));
}

function buildHelpResponse(ctx: CommandContext) {
  const providerLabel = getProviderLabel({ providerId: ctx.provider });
  const customCommands = listCustomCommandKeys({ settings: ctx.settings });
  const sections: string[] = [
    "### Stave Local Commands",
    "",
    markdownTable(
      ["Command", "Description"],
      staveBuiltinCommands.map((command) => [`\`${command.command}\``, command.description]),
    ),
  ];

  if (customCommands.length > 0) {
    sections.push("");
    sections.push("### Custom Stave Commands");
    sections.push("");
    customCommands.forEach((command) => sections.push(`- \`${command}\``));
  }

  sections.push("");
  sections.push("### Provider Passthrough");
  sections.push("");
  sections.push(buildProviderPassthroughNote(ctx.provider));

  if (
    providerSupportsNativeCommandCatalog({ providerId: ctx.provider })
    && ctx.providerCommandCatalog?.status === "ready"
  ) {
    sections.push("");
    sections.push(`### Available ${providerLabel} Native Commands`);
    sections.push("");
    sections.push(markdownTable(
      ["Command", "Description"],
      ctx.providerCommandCatalog.commands.map((command) => {
        const name = command.argumentHint
          ? `${command.command} ${command.argumentHint}`
          : command.command;
        return [`\`${name}\``, command.description];
      }),
    ));
  }

  return sections.join("\n");
}

function buildUnknownProviderCommandResponse(ctx: CommandContext, command: string) {
  const providerLabel = getProviderLabel({ providerId: ctx.provider });
  const sections = [`**Unknown ${providerLabel} command for this workspace:** \`${command}\``];

  if (ctx.providerCommandCatalog?.status === "ready") {
    if (ctx.providerCommandCatalog.commands.length > 0) {
      sections.push("");
      sections.push(`**Available ${providerLabel} native commands:**`);
      sections.push("");
      sections.push(markdownTable(
        ["Command", "Description"],
        ctx.providerCommandCatalog.commands.map((item) => {
          const name = item.argumentHint
            ? `${item.command} ${item.argumentHint}`
            : item.command;
          return [`\`${name}\``, item.description];
        }),
      ));
    } else if (ctx.providerCommandCatalog.detail) {
      sections.push("");
      sections.push(ctx.providerCommandCatalog.detail);
    }
  }

  const localEquivalent = toStaveCommandKey({ cmd: command });
  const customCommands = parseCustomCommandMap({ value: ctx.settings.customCommands ?? "" });
  const hasLocalEquivalent = staveBuiltinCommands.some((item) => item.command === localEquivalent) || customCommands.has(localEquivalent);
  if (hasLocalEquivalent) {
    sections.push("");
    sections.push(`Try \`${localEquivalent}\` for Stave's local command instead.`);
  }

  return sections.join("\n");
}

const staveBuiltinCommands: StaveBuiltinCommand[] = [
  {
    command: "/stave:help",
    description: "Show Stave-local command help and provider passthrough behavior.",
    run: (ctx) => ({ response: buildHelpResponse(ctx) }),
  },
  {
    command: "/stave:clear",
    description: "Clear the current task conversation inside Stave.",
    run: () => ({ response: "Conversation cleared.", action: "clear" }),
  },
  {
    command: "/stave:status",
    description: "Show Stave's local task/session status snapshot.",
    run: (ctx) => ({ response: buildStatusResponse(ctx) }),
  },
  {
    command: "/stave:usage",
    description: "Show locally recorded token usage for this task.",
    run: (ctx) => ({ response: buildUsageResponse(ctx) }),
  },
  {
    command: "/stave:sync",
    description: "Fetch and pull the latest changes for the current branch.",
    run: (ctx) => ({
      response: `Syncing branch in ${ctx.workspaceCwd ?? "unknown workspace"}…`,
      action: "sync",
    }),
  },
];

export function getSlashCommandSearchQuery(input: string) {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return null;
  }
  if (trimmedStart.includes("\n")) {
    return null;
  }
  if (/\s/.test(trimmedStart)) {
    return null;
  }
  return trimmedStart;
}

export function buildCommandPaletteItems(args: {
  provider: ProviderId;
  settings: Pick<AppSettings, "customCommands">;
  providerCommandCatalog?: ProviderCommandCatalogState;
}): { items: CommandPaletteItem[]; providerNote: CommandPaletteProviderNote } {
  const customMap = parseCustomCommandMap({ value: args.settings.customCommands ?? "" });
  const builtinCommands = new Set(staveBuiltinCommands.map((command) => command.command));
  const items: CommandPaletteItem[] = [
    ...staveBuiltinCommands.map((command) => ({
      id: `builtin:${command.command}`,
      command: command.command,
      insertText: `${command.command} `,
      description: command.description,
      source: "stave_builtin" as const,
      searchText: toCommandSearchText({
        command: command.command,
        description: command.description,
      }),
    })),
  ];

  Array.from(customMap.keys())
    .filter((command) => !builtinCommands.has(command))
    .sort((left, right) => left.localeCompare(right))
    .forEach((command) => {
      items.push({
        id: `custom:${command}`,
        command,
        insertText: `${command} `,
        description: "User-defined Stave command from Settings.",
        source: "stave_custom",
        searchText: toCommandSearchText({
          command,
          description: "User-defined Stave command from Settings.",
        }),
      });
    });

  if (
    providerSupportsNativeCommandCatalog({ providerId: args.provider })
    && args.providerCommandCatalog?.status === "ready"
  ) {
    args.providerCommandCatalog.commands
      .slice()
      .sort((left, right) => left.command.localeCompare(right.command))
      .forEach((command) => {
        items.push({
          id: `provider:${command.command}`,
          command: command.command,
          insertText: `${command.command} `,
          description: command.argumentHint
            ? `${command.description} ${command.argumentHint}`.trim()
            : command.description,
          source: "provider_native",
          searchText: toCommandSearchText({
            command: command.command,
            description: [command.description, command.argumentHint].filter(Boolean).join(" "),
          }),
        });
      });
  }

  return {
    items,
    providerNote: buildProviderPaletteNote({
      provider: args.provider,
      providerCommandCatalog: args.providerCommandCatalog,
    }),
  };
}

export function filterCommandPaletteItems(args: {
  items: CommandPaletteItem[];
  query: string | null;
}) {
  const normalized = (args.query ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/^stave:/, "")
    .trim();

  if (!normalized) {
    return args.items;
  }

  return args.items.filter((item) => {
    const commandWithoutPrefix = item.command.startsWith(STAVE_NAMESPACE)
      ? item.command.slice(STAVE_NAMESPACE.length)
      : item.command.replace(/^\//, "");
    return item.searchText.includes(normalized) || commandWithoutPrefix.includes(normalized);
  });
}

export function resolveCommandInput(input: string, ctx: CommandContext): CommandResult {
  const parsed = parseSlashCommand(input);
  if (!parsed) {
    return { kind: "not-command" };
  }

  const { cmd, rawArgs } = parsed;
  if (!cmd.startsWith(STAVE_NAMESPACE)) {
    if (
      providerSupportsNativeCommandCatalog({ providerId: ctx.provider })
      && ctx.providerCommandCatalog?.status === "ready"
    ) {
      const matchedProviderCommand = findProviderCommand({
        command: cmd,
        providerCommandCatalog: ctx.providerCommandCatalog,
      });
      if (matchedProviderCommand) {
        return {
          kind: "provider-passthrough",
          command: cmd,
          rawArgs,
        };
      }

      return {
        kind: "local-response",
        source: "provider_meta",
        command: cmd,
        response: buildUnknownProviderCommandResponse(ctx, cmd),
      };
    }

    return {
      kind: "provider-passthrough",
      command: cmd,
      rawArgs,
    };
  }

  const builtin = staveBuiltinCommands.find((command) => command.command === cmd);
  if (builtin) {
    const result = builtin.run(ctx);
    return {
      kind: "local-response",
      source: "stave_builtin",
      command: cmd,
      response: result.response,
      action: result.action,
    };
  }

  const customMap = parseCustomCommandMap({ value: ctx.settings.customCommands ?? "" });
  const custom = customMap.get(cmd);
  if (custom) {
    if (custom.action === "clear") {
      return {
        kind: "local-response",
        source: "stave_custom",
        command: cmd,
        response: "Conversation cleared.",
        action: "clear",
      };
    }

    return {
      kind: "local-response",
      source: "stave_custom",
      command: cmd,
      response: fillTemplate({
        template: custom.responseTemplate,
        provider: ctx.provider,
        model: ctx.model,
        messages: ctx.messages,
        rawArgs,
      }),
    };
  }

  return {
    kind: "local-response",
    source: "stave_meta",
    command: cmd,
    response: [
      `**Unknown Stave command:** \`${cmd}\``,
      "",
      buildHelpResponse(ctx),
    ].join("\n"),
  };
}
