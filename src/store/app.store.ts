import { create } from "zustand";
import { persist } from "zustand/middleware";
import { listLatestWorkspaceTurns } from "@/lib/db/turns.db";
import { sanitizeFileContextPayload } from "@/lib/file-context-sanitization";
import { workspaceFsAdapter } from "@/lib/fs";
import { getProviderAdapter } from "@/lib/providers";
import {
  listWorkspaceSummaries,
  loadWorkspaceSnapshot,
  deleteWorkspacePersistence,
  type TaskProviderConversationState,
  type WorkspaceSummary,
} from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent, ProviderId, ProviderTurnRequest } from "@/lib/providers/provider.types";
import { resolveCommandInput } from "@/lib/commands";
import {
  buildCanonicalConversationRequest,
} from "@/lib/providers/canonical-request";
import { getDefaultModelForProvider, listProviderIds } from "@/lib/providers/model-catalog";
import { getCachedProviderCommandCatalog } from "@/lib/providers/provider-command-catalog";
import { getArchiveFallbackTaskId, isTaskArchived } from "@/lib/tasks";
import {
  replayProviderEventsToTaskState,
} from "@/lib/session/provider-event-replay";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";
import type {
  ChatMessage,
  EditorTab,
  FileContextPart,
  MessagePart,
  Task,
  TextPart,
} from "@/types/chat";
import {
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  persistWorkspaceSnapshot,
  starterWorkspaceId,
} from "@/store/workspace-session-state";
import { interruptWorkspaceTurnsBeforeTransition } from "@/store/task-turn-lifecycle";

interface LayoutState {
  taskListWidth: number;
  taskListCollapsed: boolean;
  editorPanelWidth: number;
  explorerPanelWidth: number;
  terminalDockHeight: number;
  editorVisible: boolean;
  sidebarOverlayVisible: boolean;
  terminalDocked: boolean;
  editorDiffMode: boolean;
}

const APP_STORE_KEY = "stave-store";
export const MIN_EDITOR_PANEL_WIDTH = 600;
export const DEFAULT_EDITOR_PANEL_WIDTH = 720;
export const PROVIDER_TIMEOUT_OPTIONS = [600000, 1200000, 1800000] as const;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 1800000;

export const THEME_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ThemeModeName = "light" | "dark";
export type ThemeTokenValues = Record<ThemeTokenName, string>;
export type ThemeOverrideValues = Partial<Record<ThemeTokenName, string>>;

export const PRESET_THEME_TOKENS: Record<ThemeModeName, ThemeTokenValues> = {
  light: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.145 0 0)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.145 0 0)",
    primary: "oklch(0.205 0 0)",
    "primary-foreground": "oklch(0.985 0 0)",
    secondary: "oklch(0.97 0 0)",
    "secondary-foreground": "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    "muted-foreground": "oklch(0.556 0 0)",
    accent: "oklch(0.205 0 0)",
    "accent-foreground": "oklch(0.985 0 0)",
    destructive: "oklch(0.58 0.22 27)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.922 0 0)",
    ring: "oklch(0.708 0 0)",
    sidebar: "oklch(0.985 0 0)",
    "sidebar-foreground": "oklch(0.145 0 0)",
    "sidebar-primary": "oklch(0.205 0 0)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(0.97 0 0)",
    "sidebar-accent-foreground": "oklch(0.205 0 0)",
    "sidebar-border": "oklch(0.922 0 0)",
    "sidebar-ring": "oklch(0.708 0 0)",
  },
  dark: {
    background: "oklch(0.145 0 0)",
    foreground: "oklch(0.985 0 0)",
    card: "oklch(0.205 0 0)",
    "card-foreground": "oklch(0.985 0 0)",
    popover: "oklch(0.205 0 0)",
    "popover-foreground": "oklch(0.985 0 0)",
    primary: "oklch(0.87 0 0)",
    "primary-foreground": "oklch(0.205 0 0)",
    secondary: "oklch(0.269 0 0)",
    "secondary-foreground": "oklch(0.985 0 0)",
    muted: "oklch(0.269 0 0)",
    "muted-foreground": "oklch(0.708 0 0)",
    accent: "oklch(0.87 0 0)",
    "accent-foreground": "oklch(0.205 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.556 0 0)",
    sidebar: "oklch(0.205 0 0)",
    "sidebar-foreground": "oklch(0.985 0 0)",
    "sidebar-primary": "oklch(0.488 0.243 264.376)",
    "sidebar-primary-foreground": "oklch(0.985 0 0)",
    "sidebar-accent": "oklch(0.269 0 0)",
    "sidebar-accent-foreground": "oklch(0.985 0 0)",
    "sidebar-border": "oklch(1 0 0 / 10%)",
    "sidebar-ring": "oklch(0.556 0 0)",
  },
};

export interface AppSettings {
  themeMode: "light" | "dark" | "system";
  themeOverrides: Record<ThemeModeName, ThemeOverrideValues>;
  language: string;
  updateMode: "auto" | "manual";
  httpProxy: string;
  smartSuggestions: boolean;
  chatSendPreview: boolean;
  chatStreamingEnabled: boolean;
  messageFontSize: "base" | "lg" | "xl";
  messageCodeFontSize: "base" | "lg" | "xl";
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
  reasoningDefaultExpanded: boolean;
  modelClaude: string;
  modelCodex: string;
  rulesPresetPrimary: string;
  rulesPresetSecondary: string;
  permissionMode: "require-approval" | "auto-safe";
  subagentsEnabled: boolean;
  subagentsProfile: string;
  skillsEnabled: boolean;
  skillsAutoSuggest: boolean;
  commandPolicy: "confirm" | "auto-safe";
  commandAllowlist: string;
  customCommands: string;
  reviewStrictMode: boolean;
  reviewChecklistPreset: string;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: "block" | "bar" | "underline";
  terminalLineHeight: number;
  editorFontSize: number;
  editorFontFamily: string;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorLineNumbers: "on" | "off" | "relative";
  editorTabSize: number;
  editorLspEnabled: boolean;
  pythonLspCommand: string;
  diffViewMode: "unified" | "split";
  providerDebugStream: boolean;
  turnDiagnosticsVisible: boolean;
  providerTimeoutMs: number;
  claudePermissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeEffort: "low" | "medium" | "high" | "max";
  claudeThinkingMode: "adaptive" | "enabled" | "disabled";
  claudeAgentProgressSummaries: boolean;
  codexSandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccessEnabled: boolean;
  codexApprovalPolicy: "never" | "on-request" | "untrusted";
  codexPathOverride: string;
  codexModelReasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
  codexWebSearchMode: "disabled" | "cached" | "live";
  codexShowRawAgentReasoning: boolean;
  codexReasoningSummary: "auto" | "concise" | "detailed" | "none";
  codexSupportsReasoningSummaries: "auto" | "enabled" | "disabled";
}

interface AppState {
  hasHydratedWorkspaces: boolean;
  workspaceSnapshotVersion: number;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  projectPath: string | null;
  defaultBranch: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  isDarkMode: boolean;
  activeTaskId: string;
  draftProvider: ProviderId;
  promptDraftByTask: Record<string, { text: string; attachedFilePaths: string[] }>;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  layout: LayoutState;
  settings: AppSettings;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  workspaceRootName: string | null;
  projectFiles: string[];
  taskCheckpointById: Record<string, string>;
  providerAvailability: Record<ProviderId, boolean>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  nativeConversationReadyByTask: Record<string, boolean>;
  providerConversationByTask: Record<string, TaskProviderConversationState>;
  hydrateWorkspaces: () => Promise<void>;
  flushActiveWorkspaceSnapshot: (args?: { sync?: boolean }) => Promise<void>;
  createProject: (args: { name?: string }) => Promise<void>;
  createWorkspace: (args: { name: string; mode: "branch" | "clean"; fromBranch?: string }) => Promise<{ ok: boolean; message?: string }>;
  deleteWorkspace: (args: { workspaceId: string }) => Promise<void>;
  switchWorkspace: (args: { workspaceId: string }) => Promise<void>;
  setDarkMode: (args: { enabled: boolean }) => void;
  updateSettings: (args: { patch: Partial<AppSettings> }) => void;
  selectTask: (args: { taskId: string }) => void;
  clearTaskSelection: () => void;
  updatePromptDraft: (args: { taskId: string; patch: Partial<{ text: string; attachedFilePaths: string[] }> }) => void;
  clearPromptDraft: (args: { taskId: string }) => void;
  createTask: (args: { title?: string }) => void;
  renameTask: (args: { taskId: string; title: string }) => void;
  duplicateTask: (args: { taskId: string }) => void;
  exportTask: (args: { taskId: string }) => void;
  viewTaskChanges: (args: { taskId: string }) => Promise<void>;
  rollbackTask: (args: { taskId: string }) => Promise<void>;
  archiveTask: (args: { taskId: string }) => void;
  setTaskProvider: (args: { taskId: string; provider: ProviderId }) => void;
  setWorkspaceBranch: (args: { workspaceId: string; branch: string }) => void;
  setLayout: (args: { patch: Partial<LayoutState> }) => void;
  toggleEditorDiffMode: () => void;
  openWorkspacePicker: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshProviderAvailability: () => Promise<void>;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    fileContexts?: Array<{
      filePath: string;
      content: string;
      language: string;
      instruction?: string;
    }>;
  }) => void;
  abortTaskTurn: (args: { taskId: string }) => void;
  resolveApproval: (args: { taskId: string; messageId: string; approved: boolean }) => void;
  resolveUserInput: (args: {
    taskId: string;
    messageId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => void;
  resolveDiff: (args: { taskId: string; messageId: string; accepted: boolean; partIndex?: number }) => void;
  openDiffInEditor: (args: { editorTabId: string; filePath: string; oldContent: string; newContent: string }) => void;
  openFileFromTree: (args: { filePath: string }) => Promise<void>;
  setActiveEditorTab: (args: { tabId: string }) => void;
  reorderEditorTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeEditorTab: (args: { tabId: string }) => void;
  updateEditorContent: (args: { tabId: string; content: string }) => void;
  saveActiveEditorTab: () => Promise<{ ok: boolean; conflict?: boolean }>;
  checkOpenTabConflicts: () => Promise<void>;
  sendEditorContextToChat: (args: { taskId: string; instruction?: string }) => void;
}

const defaultSettings: AppSettings = {
  themeMode: "dark",
  themeOverrides: {
    light: {},
    dark: {},
  },
  language: "English",
  updateMode: "auto",
  httpProxy: "",
  smartSuggestions: true,
  chatSendPreview: true,
  chatStreamingEnabled: true,
  messageFontSize: "lg",
  messageCodeFontSize: "base",
  messageFontFamily: "Geist Variable",
  messageMonoFontFamily: "JetBrains Mono",
  messageKoreanFontFamily: "Pretendard Variable",
  reasoningDefaultExpanded: false,
  modelClaude: getDefaultModelForProvider({ providerId: "claude-code" }),
  modelCodex: getDefaultModelForProvider({ providerId: "codex" }),
  rulesPresetPrimary: "typescript-best-practices",
  rulesPresetSecondary: "no-target-brand-keyword",
  permissionMode: "auto-safe",
  subagentsEnabled: true,
  subagentsProfile: "default",
  skillsEnabled: true,
  skillsAutoSuggest: true,
  commandPolicy: "confirm",
  commandAllowlist: "bun,git,rg",
  customCommands: "/stave:clear = @clear\n/stave:meow = Meow from {provider} ({model})",
  reviewStrictMode: true,
  reviewChecklistPreset: "safety-first",
  terminalFontSize: 12,
  terminalFontFamily: "JetBrains Mono",
  terminalCursorStyle: "block",
  terminalLineHeight: 1,
  editorFontSize: 14,
  editorFontFamily: "JetBrains Mono, monospace",
  editorWordWrap: true,
  editorMinimap: false,
  editorLineNumbers: "on" as const,
  editorTabSize: 2,
  editorLspEnabled: false,
  pythonLspCommand: "",
  diffViewMode: "unified",
  providerDebugStream: false,
  turnDiagnosticsVisible: true,
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  claudePermissionMode: "bypassPermissions",
  claudeAllowDangerouslySkipPermissions: true,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeEffort: "medium",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: false,
  codexSandboxMode: "workspace-write",
  codexNetworkAccessEnabled: true,
  codexApprovalPolicy: "on-request",
  codexPathOverride: "",
  codexModelReasoningEffort: "medium",
  codexWebSearchMode: "disabled",
  codexShowRawAgentReasoning: false,
  codexReasoningSummary: "auto",
  codexSupportsReasoningSummaries: "auto",
};

function createDefaultProviderAvailability() {
  return Object.fromEntries(
    listProviderIds().map((providerId) => [providerId, true] as const),
  ) as Record<ProviderId, boolean>;
}

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function buildRecentTimestamp() {
  return new Date().toISOString();
}

function incrementWorkspaceSnapshotVersion(state: Pick<AppState, "workspaceSnapshotVersion">) {
  return state.workspaceSnapshotVersion + 1;
}

function mergeLayoutPatch(args: { layout: LayoutState; patch: Partial<LayoutState> }) {
  let changed = false;
  const nextLayout: LayoutState = normalizeLayoutState({ ...args.layout });

  for (const [rawKey, rawValue] of Object.entries(args.patch)) {
    const key = rawKey as keyof LayoutState;
    const value = rawValue as LayoutState[keyof LayoutState];
    if (value === undefined || Object.is(nextLayout[key], value)) {
      continue;
    }
    nextLayout[key] = value as never;
    changed = true;
  }

  const normalizedLayout = normalizeLayoutState(nextLayout);
  return changed ? normalizedLayout : null;
}

function normalizeLayoutState(layout: LayoutState): LayoutState {
  return {
    ...layout,
    editorPanelWidth: Math.max(MIN_EDITOR_PANEL_WIDTH, layout.editorPanelWidth),
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function sanitizeBranchName(args: { value: string }) {
  return args.value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._/-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^\-|\-$/g, "");
}

function toWorkspaceFolderName(args: { branch: string }) {
  return args.branch.replaceAll("/", "__");
}

function resolveLanguage(args: { filePath: string }) {
  if (isImageFilePath({ filePath: args.filePath })) {
    return "image";
  }
  const path = args.filePath.toLowerCase();
  const ext = path.slice(path.lastIndexOf("."));
  const extMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".jsonc": "json",
    ".md": "markdown",
    ".mdx": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".svg": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "ini",
    ".py": "python",
    ".pyi": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".fish": "shell",
    ".ps1": "powershell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".dockerfile": "dockerfile",
    ".tf": "hcl",
    ".lua": "lua",
    ".r": "r",
    ".dart": "dart",
    ".vue": "html",
    ".svelte": "html",
  };
  if (extMap[ext]) {
    return extMap[ext];
  }
  const basename = path.split("/").at(-1) ?? "";
  if (basename === "dockerfile" || basename.startsWith("dockerfile.")) {
    return "dockerfile";
  }
  if (basename === "makefile" || basename === "gnumakefile") {
    return "makefile";
  }
  return "plaintext";
}

function normalizeProviderTimeoutMs(args: { value: number | null | undefined }) {
  return PROVIDER_TIMEOUT_OPTIONS.includes(args.value as (typeof PROVIDER_TIMEOUT_OPTIONS)[number])
    ? args.value!
    : DEFAULT_PROVIDER_TIMEOUT_MS;
}

function isImageFilePath(args: { filePath: string }) {
  const value = args.filePath.toLowerCase();
  return value.endsWith(".png")
    || value.endsWith(".jpg")
    || value.endsWith(".jpeg")
    || value.endsWith(".gif")
    || value.endsWith(".webp")
    || value.endsWith(".svg")
    || value.endsWith(".bmp")
    || value.endsWith(".ico")
    || value.endsWith(".avif");
}

function createUserTextPart(args: { text: string }): TextPart {
  return {
    type: "text",
    text: args.text,
  };
}

function createFileContextPart(args: {
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}): FileContextPart {
  return sanitizeFileContextPayload({
    type: "file_context",
    filePath: args.filePath,
    content: args.content,
    language: args.language,
    instruction: args.instruction,
  });
}

function updateMessageById(args: {
  messages: ChatMessage[];
  messageId: string;
  update: (message: ChatMessage) => ChatMessage;
}) {
  return args.messages.map((message) =>
    message.id === args.messageId ? args.update(message) : message
  );
}

function applyApprovalState(args: {
  taskId: string;
  messageId: string;
  requestId: string;
  approved: boolean;
}) {
  useAppStore.setState((state) => {
    const current = state.messagesByTask[args.taskId] ?? [];
    return {
      messagesByTask: {
        ...state.messagesByTask,
        [args.taskId]: updateMessageById({
          messages: current,
          messageId: args.messageId,
          update: (message) => ({
            ...message,
            parts: updateApprovalPartsByRequestId({
              parts: message.parts,
              requestId: args.requestId,
              approved: args.approved,
            }),
          }),
        }),
      },
      workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
    };
  });
}

function applyUserInputState(args: {
  taskId: string;
  messageId: string;
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}) {
  useAppStore.setState((state) => {
    const current = state.messagesByTask[args.taskId] ?? [];
    return {
      messagesByTask: {
        ...state.messagesByTask,
        [args.taskId]: updateMessageById({
          messages: current,
          messageId: args.messageId,
          update: (message) => ({
            ...message,
            parts: updateUserInputPartsByRequestId({
              parts: message.parts,
              requestId: args.requestId,
              answers: args.answers,
              denied: args.denied,
            }),
          }),
        }),
      },
      workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
    };
  });
}

function normalizeCodexApprovalPolicy(args: { value?: string }) {
  if (args.value === "never" || args.value === "on-request" || args.value === "untrusted") {
    return args.value;
  }
  if (args.value === "on-failure") {
    return "on-request" as const;
  }
  return defaultSettings.codexApprovalPolicy;
}

function runProviderTurn(args: {
  turnId?: string;
  provider: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
  onEvent: (args: { event: NormalizedProviderEvent }) => void;
}) {
  const adapter = getProviderAdapter({ providerId: args.provider });

  void (async () => {
    try {
      for await (const event of adapter.runTurn({
        turnId: args.turnId,
        prompt: args.prompt,
        conversation: args.conversation,
        taskId: args.taskId,
        workspaceId: args.workspaceId,
        cwd: args.cwd,
        runtimeOptions: args.runtimeOptions,
      })) {
        args.onEvent({ event });
      }
    } catch (error) {
      args.onEvent({
        event: {
          type: "system",
          content: `Provider stream failed: ${String(error)}`,
        },
      });
    } finally {
      args.onEvent({ event: { type: "done" } });
    }
  })();
}

function applyThemeClass(args: { enabled: boolean }) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", args.enabled);
}

function buildThemeOverrideCss(args: { themeOverrides: AppSettings["themeOverrides"] }) {
  const blocks: string[] = [];

  for (const mode of ["light", "dark"] as const) {
    const overrides = args.themeOverrides[mode];
    const declarations = Object.entries(overrides)
      .filter((entry): entry is [ThemeTokenName, string] => Boolean(entry[1]?.trim()))
      .map(([token, value]) => `--${token}: ${value};`);

    if (declarations.length === 0) {
      continue;
    }

    const selector = mode === "light" ? ":root" : ".dark";
    blocks.push(`${selector}{${declarations.join("")}}`);
  }

  return blocks.join("\n");
}

function applyThemeOverrides(args: { themeOverrides: AppSettings["themeOverrides"] }) {
  if (typeof document === "undefined") {
    return;
  }

  const styleId = "stave-theme-overrides";
  const css = buildThemeOverrideCss({ themeOverrides: args.themeOverrides });
  let element = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!css) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("style");
    element.id = styleId;
    document.head.appendChild(element);
  }

  element.textContent = css;
}

function applyFontOverrides(args: {
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
}) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const sans = [args.messageFontFamily, args.messageKoreanFontFamily, "sans-serif"]
    .filter(Boolean)
    .join(", ");
  const mono = [args.messageMonoFontFamily, "monospace"]
    .filter(Boolean)
    .join(", ");
  root.style.setProperty("--font-sans", sans);
  root.style.setProperty("--font-mono", mono);
}

function resolveDarkModeForTheme(args: { themeMode: AppSettings["themeMode"]; fallback?: boolean }) {
  if (args.themeMode === "dark") {
    return true;
  }
  if (args.themeMode === "light") {
    return false;
  }
  if (typeof window === "undefined") {
    return args.fallback ?? true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydratedWorkspaces: false,
      workspaceSnapshotVersion: 0,
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      defaultBranch: "main",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      isDarkMode: true,
      activeTaskId: "",
      draftProvider: "claude-code",
      promptDraftByTask: {},
      tasks: [],
      messagesByTask: {},
      layout: {
        taskListWidth: 185,
        taskListCollapsed: false,
        editorPanelWidth: DEFAULT_EDITOR_PANEL_WIDTH,
        explorerPanelWidth: 300,
        terminalDockHeight: 210,
        editorVisible: false,
        sidebarOverlayVisible: false,
        terminalDocked: false,
        editorDiffMode: false,
      },
      settings: defaultSettings,
      editorTabs: [],
      activeEditorTabId: null,
      workspaceRootName: null,
      projectFiles: workspaceFsAdapter.getKnownFiles(),
      taskCheckpointById: {},
      providerAvailability: createDefaultProviderAvailability(),
      activeTurnIdsByTask: {},
      nativeConversationReadyByTask: {},
      providerConversationByTask: {},
      hydrateWorkspaces: async () => {
        const initialRows = await listWorkspaceSummaries();
        const stateBeforeHydrate = get();
        if (initialRows.length === 0 && stateBeforeHydrate.projectPath) {
          await persistWorkspaceSnapshot({
            workspaceId: starterWorkspaceId,
            workspaceName: defaultWorkspaceName,
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            promptDraftByTask: {},
            providerConversationByTask: {},
          });
        }
        let rows = initialRows.length === 0 && stateBeforeHydrate.projectPath
          ? await listWorkspaceSummaries()
          : initialRows;
        const defaultWorkspaceId =
          rows.find((workspace) => workspace.id === starterWorkspaceId)?.id
          ?? rows.find((workspace) => workspace.name.toLowerCase() === defaultWorkspaceName.toLowerCase())?.id
          ?? rows[0]?.id
          ?? "";

        // Worktree cleanup: remove DB workspaces whose git worktrees no longer exist
        const runner = window.api?.terminal?.runCommand;
        const projectPath = stateBeforeHydrate.projectPath;
        if (runner && projectPath) {
          await runner({ cwd: projectPath, command: "git worktree prune" });
          const listResult = await runner({ cwd: projectPath, command: "git worktree list --porcelain" });
          if (listResult.ok) {
            const registeredPaths = new Set(
              listResult.stdout
                .split("\n")
                .filter((line) => line.startsWith("worktree "))
                .map((line) => line.slice("worktree ".length).trim()),
            );
            const staleIds: string[] = [];
            for (const row of rows) {
              if (row.id === defaultWorkspaceId) continue;
              const wsPath = stateBeforeHydrate.workspacePathById[row.id]
                ?? `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
              if (!registeredPaths.has(wsPath)) {
                staleIds.push(row.id);
              }
            }
            for (const id of staleIds) {
              await deleteWorkspacePersistence({ workspaceId: id });
            }
            if (staleIds.length > 0) {
              rows = rows.filter((row) => !staleIds.includes(row.id));
            }
          }
        }

        const branchById: Record<string, string> = { ...stateBeforeHydrate.workspaceBranchById };
        const pathById: Record<string, string> = { ...stateBeforeHydrate.workspacePathById };

        for (const row of rows) {
          const isDefault = row.id === defaultWorkspaceId;
          if (!branchById[row.id]) {
            branchById[row.id] = isDefault ? stateBeforeHydrate.defaultBranch : row.name;
          }
          if (!pathById[row.id] && projectPath) {
            pathById[row.id] = isDefault
              ? projectPath
              : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
          }
        }

        const preferredWorkspaceId = rows[0]?.id ?? "";
        const [snapshot, latestWorkspaceTurns] = preferredWorkspaceId
          ? await Promise.all([
              loadWorkspaceSnapshot({ workspaceId: preferredWorkspaceId }),
              listLatestWorkspaceTurns({ workspaceId: preferredWorkspaceId }),
            ])
          : [null, []];

        const preferredWorkspacePath = pathById[preferredWorkspaceId] ?? null;
        let projectFiles = stateBeforeHydrate.projectFiles;
        if (preferredWorkspacePath) {
          await workspaceFsAdapter.setRoot?.({
            rootPath: preferredWorkspacePath,
            rootName: stateBeforeHydrate.workspaceRootName ?? "project",
          });
          projectFiles = await workspaceFsAdapter.listFiles();
        }

        set((state) => {
          const workspaceState = buildWorkspaceSessionState({
            snapshot,
            latestTurns: latestWorkspaceTurns,
            appendInterruptedNotices: true,
          });

          return {
            hasHydratedWorkspaces: true,
            workspaceSnapshotVersion: 0,
            workspaces: rows,
            activeWorkspaceId: preferredWorkspaceId,
            workspaceDefaultById: defaultWorkspaceId ? { [defaultWorkspaceId]: true } : {},
            workspaceBranchById: branchById,
            workspacePathById: pathById,
            projectFiles,
            ...workspaceState,
          };
        });
      },
      flushActiveWorkspaceSnapshot: async ({ sync } = {}) => {
        const state = get();
        if (!state.hasHydratedWorkspaces) {
          return;
        }
        const workspaceId = state.activeWorkspaceId;
        const workspace = state.workspaces.find((item) => item.id === workspaceId);
        if (!workspaceId || !workspace) {
          return;
        }

        const snapshot = createWorkspaceSnapshot({
          activeTaskId: state.activeTaskId,
          tasks: state.tasks,
          messagesByTask: state.messagesByTask,
          promptDraftByTask: state.promptDraftByTask,
          providerConversationByTask: state.providerConversationByTask,
        });

        if (sync) {
          const upsertSync = window.api?.persistence?.upsertWorkspaceSync;
          if (upsertSync) {
            upsertSync({
              id: workspaceId,
              name: workspace.name,
              snapshot,
            });
            return;
          }
        }

        await persistWorkspaceSnapshot({
          workspaceId,
          workspaceName: workspace.name,
          activeTaskId: state.activeTaskId,
          tasks: state.tasks,
          messagesByTask: state.messagesByTask,
          promptDraftByTask: state.promptDraftByTask,
          providerConversationByTask: state.providerConversationByTask,
        });
      },
      createProject: async ({ name }) => {
        const root = await workspaceFsAdapter.pickRoot();
        if (!root || !root.rootPath) {
          return;
        }
        const projectRootPath = root.rootPath;

        await workspaceFsAdapter.setRoot?.({
          rootPath: projectRootPath,
          rootName: root.rootName,
          files: root.files,
        });

        const terminalRun = window.api?.terminal?.runCommand;
        let defaultBranch = "main";
        if (terminalRun) {
          const branchResult = await terminalRun({
            cwd: projectRootPath,
            command: "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
          });
          const branchLine = (branchResult.stdout || "")
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0);
          if (branchLine) {
            defaultBranch = branchLine.replace(/^origin\//, "");
          }
        }

        const projectName = name?.trim() || root.rootName || "project";
        const empty = createEmptyWorkspaceState();
        await persistWorkspaceSnapshot({
          workspaceId: starterWorkspaceId,
          workspaceName: defaultWorkspaceName,
          activeTaskId: empty.activeTaskId,
          tasks: empty.tasks,
          messagesByTask: empty.messagesByTask,
          promptDraftByTask: empty.promptDraftByTask,
          providerConversationByTask: empty.providerConversationByTask,
        });
        const workspaceState = buildWorkspaceSessionState({
          snapshot: createWorkspaceSnapshot({
            activeTaskId: empty.activeTaskId,
            tasks: empty.tasks,
            messagesByTask: empty.messagesByTask,
            promptDraftByTask: empty.promptDraftByTask,
            providerConversationByTask: empty.providerConversationByTask,
          }),
        });

        set(() => ({
          hasHydratedWorkspaces: true,
          workspaceSnapshotVersion: 0,
          workspaces: [{ id: starterWorkspaceId, name: defaultWorkspaceName, updatedAt: new Date().toISOString() }],
          activeWorkspaceId: starterWorkspaceId,
          projectPath: projectRootPath,
          defaultBranch,
          workspaceBranchById: { [starterWorkspaceId]: defaultBranch },
          workspacePathById: { [starterWorkspaceId]: projectRootPath },
          workspaceDefaultById: { [starterWorkspaceId]: true },
          ...workspaceState,
          workspaceRootName: projectName,
          projectFiles: root.files,
        }));
      },
      createWorkspace: async ({ name, mode, fromBranch }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          return { ok: false, message: "Workspace name is required." };
        }

        const current = get();
        if (!current.projectPath) {
          return { ok: false, message: "Open a project before creating a workspace." };
        }
        const hasActiveWorkspace = current.workspaces.some((workspace) => workspace.id === current.activeWorkspaceId);
        if (hasActiveWorkspace && current.activeWorkspaceId) {
          const currentName = current.workspaces.find((workspace) => workspace.id === current.activeWorkspaceId)?.name ?? defaultWorkspaceName;
          await interruptWorkspaceTurnsBeforeTransition({
            activeWorkspaceId: current.activeWorkspaceId,
            activeTaskId: current.activeTaskId,
            tasks: current.tasks,
            messagesByTask: current.messagesByTask,
            promptDraftByTask: current.promptDraftByTask,
            activeTurnIdsByTask: current.activeTurnIdsByTask,
            providerConversationByTask: current.providerConversationByTask,
            workspaceName: currentName,
            applyInterruptedState: ({ messagesByTask, activeTurnIdsByTask }) => {
              useAppStore.setState((state) => ({
                messagesByTask: messagesByTask === state.messagesByTask ? state.messagesByTask : messagesByTask,
                activeTurnIdsByTask: activeTurnIdsByTask === state.activeTurnIdsByTask
                  ? state.activeTurnIdsByTask
                  : activeTurnIdsByTask,
              }));
            },
          });
        }

        const workspaceId = crypto.randomUUID();
        const branchName = sanitizeBranchName({ value: trimmed });
        if (!branchName) {
          return { ok: false, message: "Workspace branch name is invalid." };
        }
        const baseBranch = (fromBranch?.trim() || current.defaultBranch || "main").replace(/^origin\//, "");
        const workspacePath = `${current.projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName })}`;
        const runner = window.api?.terminal?.runCommand;
        if (runner) {
          await runner({
            cwd: current.projectPath,
            command: "mkdir -p .stave/workspaces",
          });
          const addResult = await runner({
            cwd: current.projectPath,
            command: mode === "clean"
              ? `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)}`
              : `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)} ${JSON.stringify(baseBranch)}`,
          });
          if (!addResult.ok) {
            const fallbackResult = await runner({
              cwd: current.projectPath,
              command: `git worktree add ${JSON.stringify(workspacePath)} ${JSON.stringify(branchName)}`,
            });
            if (!fallbackResult.ok) {
              return { ok: false, message: (fallbackResult.stderr || addResult.stderr || "Failed to create git worktree.").trim() };
            }
          }
        }

        const empty = createEmptyWorkspaceState();
        const snapshot = createWorkspaceSnapshot({
          activeTaskId: empty.activeTaskId,
          tasks: empty.tasks,
          messagesByTask: empty.messagesByTask,
          promptDraftByTask: empty.promptDraftByTask,
          providerConversationByTask: empty.providerConversationByTask,
        });
        await persistWorkspaceSnapshot({
          workspaceId,
          workspaceName: branchName,
          activeTaskId: snapshot.activeTaskId,
          tasks: snapshot.tasks,
          messagesByTask: snapshot.messagesByTask,
          promptDraftByTask: snapshot.promptDraftByTask ?? {},
          providerConversationByTask: snapshot.providerConversationByTask ?? {},
        });
        const workspaceState = buildWorkspaceSessionState({ snapshot });

        let files = current.projectFiles;
        try {
          await workspaceFsAdapter.setRoot?.({
            rootPath: workspacePath,
            rootName: branchName,
          });
          files = await workspaceFsAdapter.listFiles();
        } catch {
          // Worktree may be created successfully before filesystem bridge catches up.
          // Keep workspace registration and use the existing file list as fallback.
        }

        set((state) => ({
          workspaceSnapshotVersion: 0,
          workspaces: state.workspaces.some((workspace) => workspace.id === workspaceId)
            ? state.workspaces
            : [...state.workspaces, { id: workspaceId, name: branchName, updatedAt: new Date().toISOString() }],
          activeWorkspaceId: workspaceId,
          workspaceBranchById: {
            ...state.workspaceBranchById,
            [workspaceId]: branchName,
          },
          workspacePathById: {
            ...state.workspacePathById,
            [workspaceId]: workspacePath,
          },
          workspaceDefaultById: {
            ...state.workspaceDefaultById,
            [workspaceId]: false,
          },
          ...workspaceState,
          projectFiles: files,
        }));
        return { ok: true };
      },
      deleteWorkspace: async ({ workspaceId }) => {
        const state = get();
        const workspace = state.workspaces.find((item) => item.id === workspaceId);
        const isProtectedDefault = state.workspaceDefaultById[workspaceId]
          || workspaceId === starterWorkspaceId
          || workspace?.name.toLowerCase() === defaultWorkspaceName.toLowerCase();
        if (isProtectedDefault) {
          return;
        }
        const workspacePath = state.workspacePathById[workspaceId];
        const projectPath = state.projectPath;
        const runner = window.api?.terminal?.runCommand;
        if (runner && projectPath && workspacePath) {
          await runner({
            cwd: projectPath,
            command: `git worktree remove --force ${JSON.stringify(workspacePath)}`,
          });
        }
        await deleteWorkspacePersistence({ workspaceId });
        const nextWorkspace = state.workspaces.find((item) => state.workspaceDefaultById[item.id]) ?? state.workspaces[0];
        if (!nextWorkspace) {
          const workspaceState = buildWorkspaceSessionState({ snapshot: null });
          set((nextState) => {
            const nextBranchById = { ...nextState.workspaceBranchById };
            const nextPathById = { ...nextState.workspacePathById };
            const nextDefaultById = { ...nextState.workspaceDefaultById };
            delete nextBranchById[workspaceId];
            delete nextPathById[workspaceId];
            delete nextDefaultById[workspaceId];
            return {
              workspaces: nextState.workspaces.filter((item) => item.id !== workspaceId),
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
              activeWorkspaceId: "",
              workspaceSnapshotVersion: 0,
              ...workspaceState,
            };
          });
          return;
        }
        await get().switchWorkspace({ workspaceId: nextWorkspace.id });
        set((nextState) => {
          const nextBranchById = { ...nextState.workspaceBranchById };
          const nextPathById = { ...nextState.workspacePathById };
          const nextDefaultById = { ...nextState.workspaceDefaultById };
          delete nextBranchById[workspaceId];
          delete nextPathById[workspaceId];
          delete nextDefaultById[workspaceId];
          return {
            workspaces: nextState.workspaces.filter((item) => item.id !== workspaceId),
            workspaceBranchById: nextBranchById,
            workspacePathById: nextPathById,
            workspaceDefaultById: nextDefaultById,
          };
        });
      },
      switchWorkspace: async ({ workspaceId }) => {
        const current = get();
        const hasActiveWorkspace = current.workspaces.some((workspace) => workspace.id === current.activeWorkspaceId);
        if (hasActiveWorkspace && current.activeWorkspaceId) {
          const currentName = current.workspaces.find((workspace) => workspace.id === current.activeWorkspaceId)?.name ?? defaultWorkspaceName;
          await interruptWorkspaceTurnsBeforeTransition({
            activeWorkspaceId: current.activeWorkspaceId,
            activeTaskId: current.activeTaskId,
            tasks: current.tasks,
            messagesByTask: current.messagesByTask,
            promptDraftByTask: current.promptDraftByTask,
            activeTurnIdsByTask: current.activeTurnIdsByTask,
            providerConversationByTask: current.providerConversationByTask,
            workspaceName: currentName,
            applyInterruptedState: ({ messagesByTask, activeTurnIdsByTask }) => {
              useAppStore.setState((state) => ({
                messagesByTask: messagesByTask === state.messagesByTask ? state.messagesByTask : messagesByTask,
                activeTurnIdsByTask: activeTurnIdsByTask === state.activeTurnIdsByTask
                  ? state.activeTurnIdsByTask
                  : activeTurnIdsByTask,
              }));
            },
          });
        }

        const nextSnapshot = await loadWorkspaceSnapshot({ workspaceId });
        const workspacePath = current.workspacePathById[workspaceId];
        if (workspacePath) {
          await workspaceFsAdapter.setRoot?.({
            rootPath: workspacePath,
            rootName: current.workspaceRootName ?? "project",
          });
        }
        const files = await workspaceFsAdapter.listFiles();
        const nextWorkspaces = current.workspaces;
        const workspaceState = buildWorkspaceSessionState({ snapshot: nextSnapshot });

        set((state) => {
          return {
            workspaces: nextWorkspaces.length > 0 ? nextWorkspaces : state.workspaces,
            activeWorkspaceId: workspaceId,
            workspaceSnapshotVersion: 0,
            ...workspaceState,
            projectFiles: files,
          };
        });
      },
      setDarkMode: ({ enabled }) => {
        const nextThemeMode: AppSettings["themeMode"] = enabled ? "dark" : "light";
        set((state) => {
          if (state.isDarkMode === enabled && state.settings.themeMode === nextThemeMode) {
            return state;
          }
          return {
            isDarkMode: enabled,
            settings: {
              ...state.settings,
              themeMode: nextThemeMode,
            },
          };
        });
        applyThemeClass({ enabled });
      },
      updateSettings: ({ patch }) => {
        const normalizedPatch = patch.providerTimeoutMs === undefined
          ? patch
          : {
              ...patch,
              providerTimeoutMs: normalizeProviderTimeoutMs({ value: patch.providerTimeoutMs }),
            };

        const nextThemeMode = normalizedPatch.themeMode;
        const nextIsDark = nextThemeMode
          ? resolveDarkModeForTheme({ themeMode: nextThemeMode })
          : null;

        set((state) => {
          const nextSettings = { ...state.settings, ...normalizedPatch };
          const settingsChanged = Object.keys(normalizedPatch).some((key) => (
            nextSettings[key as keyof AppSettings] !== state.settings[key as keyof AppSettings]
          ));
          if (!settingsChanged && (nextIsDark === null || nextIsDark === state.isDarkMode)) {
            return state;
          }
          const nextState: Partial<AppState> = {
            settings: nextSettings,
          };
          if (nextIsDark !== null) {
            nextState.isDarkMode = nextIsDark;
          }
          return {
            ...nextState,
          };
        });

        if (normalizedPatch.themeOverrides) {
          applyThemeOverrides({ themeOverrides: normalizedPatch.themeOverrides });
        }
        if (nextIsDark !== null) {
          applyThemeClass({ enabled: nextIsDark });
        }
        if (
          normalizedPatch.messageFontFamily !== undefined
          || normalizedPatch.messageMonoFontFamily !== undefined
          || normalizedPatch.messageKoreanFontFamily !== undefined
        ) {
          const s = get().settings;
          applyFontOverrides({
            messageFontFamily: s.messageFontFamily,
            messageMonoFontFamily: s.messageMonoFontFamily,
            messageKoreanFontFamily: s.messageKoreanFontFamily,
          });
        }
      },
      selectTask: ({ taskId }) => set((state) => {
        if (state.activeTaskId === taskId) {
          return state;
        }
        return {
          activeTaskId: taskId,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      }),
      clearTaskSelection: () => set((state) => {
        if (!state.activeTaskId) {
          return state;
        }
        return {
          activeTaskId: "",
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      }),
      updatePromptDraft: ({ taskId, patch }) => {
        set((state) => {
          const currentDraft = state.promptDraftByTask[taskId] ?? { text: "", attachedFilePaths: [] };
          const nextDraft = {
            text: currentDraft.text,
            attachedFilePaths: currentDraft.attachedFilePaths,
            ...patch,
          };
          if (
            nextDraft.text === currentDraft.text
            && nextDraft.attachedFilePaths.length === currentDraft.attachedFilePaths.length
            && nextDraft.attachedFilePaths.every((p, i) => p === currentDraft.attachedFilePaths[i])
          ) {
            return state;
          }
          return {
            promptDraftByTask: {
              ...state.promptDraftByTask,
              [taskId]: nextDraft,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      clearPromptDraft: ({ taskId }) => {
        set((state) => {
          const currentDraft = state.promptDraftByTask[taskId] ?? { text: "", attachedFilePaths: [] };
          if (!currentDraft.text && currentDraft.attachedFilePaths.length === 0) {
            return state;
          }
          return {
            promptDraftByTask: {
              ...state.promptDraftByTask,
              [taskId]: { text: "", attachedFilePaths: [] },
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      createTask: ({ title }) => {
        const trimmed = (title ?? "").trim();
        set((state) => {
          const hasActiveWorkspace = state.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId);
          if (!hasActiveWorkspace || !state.activeWorkspaceId) {
            return {};
          }
          const nextTask: Task = {
            id: crypto.randomUUID(),
            title: trimmed.length > 0 ? trimmed : "New Task",
            provider: state.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
          };
          return {
            tasks: [nextTask, ...state.tasks],
            activeTaskId: nextTask.id,
            messagesByTask: {
              ...state.messagesByTask,
              [nextTask.id]: [],
            },
            nativeConversationReadyByTask: {
              ...state.nativeConversationReadyByTask,
              [nextTask.id]: false,
            },
            providerConversationByTask: {
              ...state.providerConversationByTask,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      renameTask: ({ taskId, title }) => {
        const nextTitle = title.trim();
        if (!nextTitle) {
          return;
        }
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  title: nextTitle,
                  updatedAt: buildRecentTimestamp(),
                }
              : task
          ),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        }));
      },
      duplicateTask: ({ taskId }) => {
        set((state) => {
          const sourceTask = state.tasks.find((task) => task.id === taskId);
          if (!sourceTask) {
            return {};
          }
          const nextTaskId = crypto.randomUUID();
          const sourceMessages = state.messagesByTask[taskId] ?? [];
          const duplicatedMessages = sourceMessages.map((message) => ({
            ...message,
            id: crypto.randomUUID(),
            isStreaming: false,
          }));
          const duplicatedTask: Task = {
            ...sourceTask,
            id: nextTaskId,
            title: `${sourceTask.title} (copy)`,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
          };
          return {
            tasks: [duplicatedTask, ...state.tasks],
            activeTaskId: duplicatedTask.id,
            taskCheckpointById: {
              ...state.taskCheckpointById,
              [duplicatedTask.id]: state.taskCheckpointById[taskId] ?? "",
            },
            messagesByTask: {
              ...state.messagesByTask,
              [duplicatedTask.id]: duplicatedMessages,
            },
            nativeConversationReadyByTask: {
              ...state.nativeConversationReadyByTask,
              [duplicatedTask.id]: false,
            },
            providerConversationByTask: {
              ...state.providerConversationByTask,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      exportTask: ({ taskId }) => {
        if (typeof document === "undefined") {
          return;
        }
        const state = get();
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) {
          return;
        }
        const payload = {
          exportedAt: new Date().toISOString(),
          task,
          messages: state.messagesByTask[taskId] ?? [],
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const safeTitle = task.title.replaceAll(/[^a-z0-9-_]+/gi, "-").toLowerCase();
        anchor.href = url;
        anchor.download = `${safeTitle || "task"}-${taskId}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      },
      viewTaskChanges: async ({ taskId }) => {
        const state = get();
        const checkpoint = state.taskCheckpointById[taskId];
        const workspaceCwd = state.workspacePathById[state.activeWorkspaceId] || state.projectPath || undefined;
        const runCommand = window.api?.terminal?.runCommand;
        if (!runCommand) {
          return;
        }

        const command = checkpoint
          ? `git diff --name-status ${JSON.stringify(checkpoint)} --`
          : "git status --porcelain";
        const result = await runCommand({ cwd: workspaceCwd, command });
        const output = result.ok
          ? (result.stdout.trim() || "No file changes for this task checkpoint.")
          : (result.stderr.trim() || "Failed to load task changes.");

        set((nextState) => {
          const current = nextState.messagesByTask[taskId] ?? [];
          const message: ChatMessage = {
            id: buildMessageId({ taskId, count: current.length }),
            role: "assistant",
            model: "system",
            providerId: "user",
            content: output,
            parts: [{
              type: "system_event",
              content: `Task changes\n${output}`,
            }],
          };
          return {
            messagesByTask: {
              ...nextState.messagesByTask,
              [taskId]: [...current, message],
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
          };
        });
      },
      rollbackTask: async ({ taskId }) => {
        const state = get();
        const checkpoint = state.taskCheckpointById[taskId];
        const workspaceCwd = state.workspacePathById[state.activeWorkspaceId] || state.projectPath || undefined;
        const runCommand = window.api?.terminal?.runCommand;
        if (!runCommand || !checkpoint) {
          return;
        }

        const rollbackResult = await runCommand({
          cwd: workspaceCwd,
          command: `git restore --source=${JSON.stringify(checkpoint)} --staged --worktree .`,
        });

        const output = rollbackResult.ok
          ? `Rollback complete to checkpoint ${checkpoint}.`
          : (rollbackResult.stderr.trim() || "Rollback failed.");

        const files = await workspaceFsAdapter.listFiles();
        set((nextState) => {
          const current = nextState.messagesByTask[taskId] ?? [];
          const message: ChatMessage = {
            id: buildMessageId({ taskId, count: current.length }),
            role: "assistant",
            model: "system",
            providerId: "user",
            content: output,
            parts: [{
              type: "system_event",
              content: output,
            }],
          };
          return {
            projectFiles: files,
            messagesByTask: {
              ...nextState.messagesByTask,
              [taskId]: [...current, message],
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
          };
        });
      },
      archiveTask: ({ taskId }) => {
        set((state) => {
          const targetTask = state.tasks.find((task) => task.id === taskId);
          if (!targetTask || isTaskArchived(targetTask)) {
            return {};
          }
          const nextTasks = state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  archivedAt: new Date().toISOString(),
                  updatedAt: buildRecentTimestamp(),
                  unread: false,
                }
              : task
          );
          const shouldSwitch = state.activeTaskId === taskId;
          const fallbackTaskId = getArchiveFallbackTaskId({ tasks: state.tasks, archivedTaskId: taskId });
          return {
            tasks: nextTasks,
            activeTaskId: shouldSwitch ? fallbackTaskId : state.activeTaskId,
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
        void window.api?.provider?.cleanupTask?.({ taskId });
      },
      setTaskProvider: ({ taskId, provider }) => {
        set((state) => {
          const hasTask = state.tasks.some((task) => task.id === taskId);
          if (!hasTask) {
            return { draftProvider: provider };
          }
          return {
            tasks: state.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    provider,
                  }
                : task
            ),
            draftProvider: provider,
            nativeConversationReadyByTask: {
              ...state.nativeConversationReadyByTask,
              [taskId]: Boolean(state.providerConversationByTask[taskId]?.[provider]?.trim()),
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
        void window.api?.provider?.cleanupTask?.({ taskId });
      },
      setWorkspaceBranch: ({ workspaceId, branch }) =>
        set((state) => ({
          workspaceBranchById: {
            ...state.workspaceBranchById,
            [workspaceId]: branch,
          },
        })),
      setLayout: ({ patch }) => set((state) => {
        const nextLayout = mergeLayoutPatch({
          layout: state.layout,
          patch,
        });
        return nextLayout ? { layout: nextLayout } : state;
      }),
      toggleEditorDiffMode: () =>
        set((state) => ({
          layout: {
            ...state.layout,
            editorDiffMode: !state.layout.editorDiffMode,
          },
        })),
      openWorkspacePicker: async () => {
        const root = await workspaceFsAdapter.pickRoot();
        if (!root) {
          return;
        }
        set((state) => ({
          workspaceRootName: root.rootName,
          projectFiles: root.files,
          layout: {
            ...state.layout,
            editorVisible: true,
          },
        }));
      },
      refreshProjectFiles: async () => {
        const files = await workspaceFsAdapter.listFiles();
        set((state) => (areStringArraysEqual(state.projectFiles, files) ? state : { projectFiles: files }));
      },
      refreshProviderAvailability: async () => {
        const checkAvailability = window.api?.provider?.checkAvailability;
        if (!checkAvailability) {
          return;
        }
        const availabilityEntries = await Promise.all(
          listProviderIds().map(async (providerId) => {
            const result = await checkAvailability({ providerId });
            return [providerId, result.ok && result.available] as const;
          }),
        );

        const providerAvailability = createDefaultProviderAvailability();
        availabilityEntries.forEach(([providerId, available]) => {
          providerAvailability[providerId] = available;
        });

        set(() => ({
          providerAvailability,
        }));
      },
      sendUserMessage: ({ taskId, content, fileContexts }) => {
        const turnId = crypto.randomUUID();
        let state = get();
        let resolvedTaskId = taskId;
        let task = state.tasks.find((item) => item.id === resolvedTaskId);
        if (!task) {
          const seededTaskId = crypto.randomUUID();
          const seededTitle = content.split("\n")[0]?.trim().slice(0, 48) || "New Task";
          const seededTask: Task = {
            id: seededTaskId,
            title: seededTitle,
            provider: state.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
          };
          set((nextState) => ({
            tasks: [seededTask, ...nextState.tasks],
            activeTaskId: seededTaskId,
            messagesByTask: {
              ...nextState.messagesByTask,
              [seededTaskId]: nextState.messagesByTask[seededTaskId] ?? [],
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
          }));
          state = get();
          resolvedTaskId = seededTaskId;
          task = seededTask;
        }
        const provider = task?.provider ?? state.draftProvider ?? "claude-code";
        const workspaceCwd = state.workspacePathById[state.activeWorkspaceId] || state.projectPath || undefined;
        const runCommand = window.api?.terminal?.runCommand;

        if (!state.taskCheckpointById[resolvedTaskId] && runCommand) {
          void runCommand({ cwd: workspaceCwd, command: "git rev-parse HEAD" }).then((result) => {
            if (!result.ok) {
              return;
            }
            const checkpoint = result.stdout.trim().split("\n")[0]?.trim();
            if (!checkpoint) {
              return;
            }
            set((nextState) => ({
              taskCheckpointById: {
                ...nextState.taskCheckpointById,
                [resolvedTaskId]: checkpoint,
              },
            }));
          });
        }

        const existingHistory = state.messagesByTask[resolvedTaskId] ?? [];

        // ── Slash-command interception ────────────────────────────────────
        // Check BEFORE building the prompt or touching the provider.
        // Stave-local commands are handled here. Claude native commands are
        // validated against the most recently loaded SDK catalog for the
        // current workspace so unsupported slash commands do not get sent as
        // ordinary prompts.
        const activeModel = provider === "claude-code"
          ? state.settings.modelClaude
          : state.settings.modelCodex;
        const providerCommandCatalog = getCachedProviderCommandCatalog({
          providerId: provider,
          cwd: workspaceCwd,
        });

        const commandResult = resolveCommandInput(content, {
          provider,
          model: activeModel,
          messages: existingHistory,
          settings: state.settings,
          taskId: resolvedTaskId,
          taskTitle: task?.title,
          workspaceCwd,
          checkpoint: state.taskCheckpointById[resolvedTaskId],
          isTurnActive: Boolean(state.activeTurnIdsByTask[resolvedTaskId]),
          providerCommandCatalog,
        });

        if (commandResult.kind === "local-response") {
          const responseText = commandResult.response ?? "";
          const shouldClearProviderConversation = commandResult.action === "clear";
          set((nextState) => {
            const current = nextState.messagesByTask[resolvedTaskId] ?? [];
            const userMessageId = buildMessageId({ taskId: resolvedTaskId, count: current.length });
            const assistantMessageId = buildMessageId({ taskId: resolvedTaskId, count: current.length + 1 });

            const userMessage: ChatMessage = {
              id: userMessageId,
              role: "user",
              model: "user",
              providerId: "user",
              content,
              parts: [createUserTextPart({ text: content })],
            };

            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: "assistant",
              model: activeModel,
              providerId: provider,
              content: responseText,
              isStreaming: false,
              parts: responseText ? [createUserTextPart({ text: responseText })] : [],
            };

            // /clear wipes the task history; other commands append normally
            const nextMessages = commandResult.action === "clear"
              ? [userMessage, assistantMessage]
              : [...current, userMessage, assistantMessage];

            return {
              tasks: nextState.tasks.map((taskItem) =>
                taskItem.id === resolvedTaskId
                  ? { ...taskItem, archivedAt: null, updatedAt: buildRecentTimestamp() }
                  : taskItem
              ),
              messagesByTask: {
                ...nextState.messagesByTask,
                [resolvedTaskId]: nextMessages,
              },
              activeTurnIdsByTask: {
                ...nextState.activeTurnIdsByTask,
                [resolvedTaskId]: undefined,
              },
              nativeConversationReadyByTask: {
                ...nextState.nativeConversationReadyByTask,
                ...(shouldClearProviderConversation ? { [resolvedTaskId]: false } : {}),
              },
              providerConversationByTask: shouldClearProviderConversation
                ? Object.fromEntries(
                    Object.entries(nextState.providerConversationByTask).filter(([key]) => key !== resolvedTaskId)
                  )
                : nextState.providerConversationByTask,
              workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
            };
          });
          if (shouldClearProviderConversation) {
            void window.api?.provider?.cleanupTask?.({ taskId: resolvedTaskId });
          }
          return; // skip runProviderTurn entirely
        }
        // ── End slash-command interception ────────────────────────────────

        const providerConversation = state.providerConversationByTask[resolvedTaskId];
        const conversation = buildCanonicalConversationRequest({
          turnId,
          taskId: resolvedTaskId,
          workspaceId: state.activeWorkspaceId,
          providerId: provider,
          model: activeModel,
          history: existingHistory,
          userInput: content,
          mode: "chat",
          fileContexts,
          nativeConversationId: providerConversation?.[provider] ?? null,
        });
        const prompt = content;

        set((nextState) => {
          const current = nextState.messagesByTask[resolvedTaskId] ?? [];
          const userMessageId = buildMessageId({ taskId: resolvedTaskId, count: current.length });
          const userParts: MessagePart[] = [];
          if (fileContexts) {
            for (const fc of fileContexts) {
              userParts.push(createFileContextPart({
                filePath: fc.filePath,
                content: fc.content,
                language: fc.language,
                instruction: fc.instruction,
              }));
            }
          }
          if (content.trim().length > 0) {
            userParts.push(createUserTextPart({ text: content }));
          }

          const userMessage: ChatMessage = {
            id: userMessageId,
            role: "user",
            model: "user",
            providerId: "user",
            content,
            parts: userParts.length > 0 ? userParts : [createUserTextPart({ text: content })],
          };

          const assistantMessageId = buildMessageId({ taskId: resolvedTaskId, count: current.length + 1 });
          const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            model: activeModel,
            providerId: provider,
            content: "",
            isStreaming: true,
            parts: [],
          };

          return {
            tasks: nextState.tasks.map((taskItem) =>
              taskItem.id === resolvedTaskId
                ? {
                    ...taskItem,
                    archivedAt: null,
                    updatedAt: buildRecentTimestamp(),
                  }
                : taskItem
            ),
            messagesByTask: {
              ...nextState.messagesByTask,
              [resolvedTaskId]: [...current, userMessage, assistantMessage],
            },
            activeTurnIdsByTask: {
              ...nextState.activeTurnIdsByTask,
              [resolvedTaskId]: turnId,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
          };
        });

        const queuedEvents: NormalizedProviderEvent[] = [];
        let flushHandle: number | null = null;

        const scheduleFlush = () => {
          if (flushHandle !== null) {
            return;
          }
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            flushHandle = window.requestAnimationFrame(() => {
              flushHandle = null;
              flushProviderEvents();
            });
            return;
          }
          flushHandle = window.setTimeout(() => {
            flushHandle = null;
            flushProviderEvents();
          }, 16);
        };

        const cancelScheduledFlush = () => {
          if (flushHandle === null) {
            return;
          }
          if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
            window.cancelAnimationFrame(flushHandle);
          } else {
            window.clearTimeout(flushHandle);
          }
          flushHandle = null;
        };

        const flushProviderEvents = () => {
          if (queuedEvents.length === 0) {
            return;
          }

          const pendingEvents = queuedEvents.splice(0, queuedEvents.length);

          set((nextState) => {
            const activeTurnId = nextState.activeTurnIdsByTask[resolvedTaskId];
            if (activeTurnId !== turnId) {
              return {};
            }

            const replayed = replayProviderEventsToTaskState({
              taskId: resolvedTaskId,
              messages: nextState.messagesByTask[resolvedTaskId] ?? [],
              events: pendingEvents,
              provider,
              model: activeModel,
              turnId,
              nativeConversationReady: nextState.nativeConversationReadyByTask[resolvedTaskId],
              providerConversation: nextState.providerConversationByTask[resolvedTaskId],
            });

            const activeTurnMatches = nextState.activeTurnIdsByTask[resolvedTaskId] === replayed.activeTurnId;
            const nativeConversationReadyMatches =
              nextState.nativeConversationReadyByTask[resolvedTaskId] === replayed.nativeConversationReady;
            const providerConversationMatches =
              replayed.providerConversation === undefined
              || nextState.providerConversationByTask[resolvedTaskId] === replayed.providerConversation;

            if (
              !replayed.changed
              && activeTurnMatches
              && nativeConversationReadyMatches
              && providerConversationMatches
            ) {
              return {};
            }

            return {
              messagesByTask: replayed.changed
                ? {
                    ...nextState.messagesByTask,
                    [resolvedTaskId]: replayed.messages,
                  }
                : nextState.messagesByTask,
              activeTurnIdsByTask: activeTurnMatches
                ? nextState.activeTurnIdsByTask
                : {
                    ...nextState.activeTurnIdsByTask,
                    [resolvedTaskId]: replayed.activeTurnId,
                  },
              nativeConversationReadyByTask: nativeConversationReadyMatches
                ? nextState.nativeConversationReadyByTask
                : {
                    ...nextState.nativeConversationReadyByTask,
                    [resolvedTaskId]: replayed.nativeConversationReady,
                  },
              providerConversationByTask: providerConversationMatches
                ? nextState.providerConversationByTask
                : {
                    ...nextState.providerConversationByTask,
                    [resolvedTaskId]: replayed.providerConversation!,
                  },
              workspaceSnapshotVersion: replayed.changed || !providerConversationMatches
                ? incrementWorkspaceSnapshotVersion(nextState)
                : nextState.workspaceSnapshotVersion,
            };
          });
        };

        runProviderTurn({
          turnId,
          provider,
          prompt,
          conversation,
          taskId: resolvedTaskId,
          workspaceId: get().activeWorkspaceId,
          cwd: get().workspacePathById[get().activeWorkspaceId] ?? get().projectPath ?? undefined,
          runtimeOptions: {
            model: activeModel,
            chatStreamingEnabled: get().settings.chatStreamingEnabled,
            debug: get().settings.providerDebugStream,
            providerTimeoutMs: get().settings.providerTimeoutMs,
            claudePermissionMode: get().settings.claudePermissionMode,
            claudeAllowDangerouslySkipPermissions: get().settings.claudeAllowDangerouslySkipPermissions,
            claudeSandboxEnabled: get().settings.claudeSandboxEnabled,
            claudeAllowUnsandboxedCommands: get().settings.claudeAllowUnsandboxedCommands,
            claudeEffort: get().settings.claudeEffort,
            claudeThinkingMode: get().settings.claudeThinkingMode,
            claudeAgentProgressSummaries: get().settings.claudeAgentProgressSummaries,
            ...(provider === "claude-code"
              && providerConversation?.["claude-code"]?.trim()
              ? { claudeResumeSessionId: providerConversation["claude-code"] }
              : {}),
            codexSandboxMode: get().settings.codexSandboxMode,
            codexNetworkAccessEnabled: get().settings.codexNetworkAccessEnabled,
            codexApprovalPolicy: normalizeCodexApprovalPolicy({
              value: get().settings.codexApprovalPolicy,
            }),
            codexPathOverride: get().settings.codexPathOverride || undefined,
            codexModelReasoningEffort: get().settings.codexModelReasoningEffort,
            codexWebSearchMode: get().settings.codexWebSearchMode,
            codexShowRawAgentReasoning: get().settings.codexShowRawAgentReasoning,
            codexReasoningSummary: get().settings.codexReasoningSummary,
            codexSupportsReasoningSummaries: get().settings.codexSupportsReasoningSummaries,
            ...(provider === "codex"
              && providerConversation?.codex?.trim()
              ? { codexResumeThreadId: providerConversation.codex }
              : {}),
          },
          onEvent: ({ event }) => {
            queuedEvents.push(event);
            if (event.type === "done") {
              cancelScheduledFlush();
              flushProviderEvents();
              return;
            }
            scheduleFlush();
          },
        });
      },
      abortTaskTurn: ({ taskId }) => {
        const stateBefore = get();
        const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
        if (activeTurnId) {
          const abortTurn = window.api?.provider?.abortTurn;
          if (abortTurn) {
            void abortTurn({ turnId: activeTurnId });
          }
        }

        set((state) => {
          const current = state.messagesByTask[taskId] ?? [];
          const target = current[current.length - 1];
          if (!target || target.role !== "assistant" || !target.isStreaming) {
            return {
              activeTurnIdsByTask: {
                ...state.activeTurnIdsByTask,
                [taskId]: undefined,
              },
            };
          }

          const aborted: ChatMessage = {
            ...target,
            isStreaming: false,
            parts: [
              ...target.parts,
              { type: "system_event", content: "Generation aborted by user." },
            ],
          };

          return {
            messagesByTask: {
              ...state.messagesByTask,
              [taskId]: [...current.slice(0, -1), aborted],
            },
            activeTurnIdsByTask: {
              ...state.activeTurnIdsByTask,
              [taskId]: undefined,
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      resolveApproval: ({ taskId, messageId, approved }) => {
        const stateBefore = get();
        const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
        const message = (stateBefore.messagesByTask[taskId] ?? []).find((item) => item.id === messageId);
        const approvalPart = findLatestPendingApprovalPart({ message });
        if (activeTurnId && approvalPart) {
          const respondApproval = window.api?.provider?.respondApproval;
          if (respondApproval) {
            void respondApproval({
              turnId: activeTurnId,
              requestId: approvalPart.requestId,
              approved,
            }).then((result) => {
              if (!result.ok) {
                set((state) => {
                  const current = state.messagesByTask[taskId] ?? [];
                  const systemMessage: ChatMessage = {
                    id: buildMessageId({ taskId, count: current.length }),
                    role: "assistant",
                    model: "system",
                    providerId: "user",
                    content: `Approval delivery failed: ${result.message ?? "unknown"}`,
                    parts: [{
                      type: "system_event",
                      content: `Approval delivery failed: ${result.message ?? "unknown"}`,
                    }],
                  };
                  return {
                    messagesByTask: {
                      ...state.messagesByTask,
                      [taskId]: [...current, systemMessage],
                    },
                    workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
                  };
                });
                return;
              }
              applyApprovalState({
                taskId,
                messageId,
                requestId: approvalPart.requestId,
                approved,
              });
            }).catch((error) => {
              set((state) => {
                const current = state.messagesByTask[taskId] ?? [];
                const failureText = `Approval delivery failed: ${String(error)}`;
                const systemMessage: ChatMessage = {
                  id: buildMessageId({ taskId, count: current.length }),
                  role: "assistant",
                  model: "system",
                  providerId: "user",
                  content: failureText,
                  parts: [{
                    type: "system_event",
                    content: failureText,
                  }],
                };
                return {
                  messagesByTask: {
                    ...state.messagesByTask,
                    [taskId]: [...current, systemMessage],
                  },
                  workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
                };
              });
            });
            return;
          }
        }
        if (!activeTurnId && approvalPart && window.api?.provider?.respondApproval) {
          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            const failureText = "Approval delivery failed: no active turn found for this task.";
            const systemMessage: ChatMessage = {
              id: buildMessageId({ taskId, count: current.length }),
              role: "assistant",
              model: "system",
              providerId: "user",
              content: failureText,
              parts: [{
                type: "system_event",
                content: failureText,
              }],
            };
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [...current, systemMessage],
              },
              workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            };
          });
          return;
        }
        if (approvalPart) {
          applyApprovalState({
            taskId,
            messageId,
            requestId: approvalPart.requestId,
            approved,
          });
          return;
        }
      },
      resolveUserInput: ({ taskId, messageId, answers, denied }) => {
        const stateBefore = get();
        const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
        const message = (stateBefore.messagesByTask[taskId] ?? []).find((item) => item.id === messageId);
        const userInputPart = findLatestPendingUserInputPart({ message });
        if (activeTurnId && userInputPart) {
          const respondUserInput = window.api?.provider?.respondUserInput;
          if (respondUserInput) {
            void respondUserInput({
              turnId: activeTurnId,
              requestId: userInputPart.requestId,
              answers,
              denied,
            }).then((result) => {
              if (!result.ok) {
                set((state) => {
                  const current = state.messagesByTask[taskId] ?? [];
                  const failureText = `User input delivery failed: ${result.message ?? "unknown"}`;
                  const systemMessage: ChatMessage = {
                    id: buildMessageId({ taskId, count: current.length }),
                    role: "assistant",
                    model: "system",
                    providerId: "user",
                    content: failureText,
                    parts: [{
                      type: "system_event",
                      content: failureText,
                    }],
                  };
                  return {
                    messagesByTask: {
                      ...state.messagesByTask,
                      [taskId]: [...current, systemMessage],
                    },
                    workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
                  };
                });
                return;
              }
              applyUserInputState({
                taskId,
                messageId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              });
            }).catch((error) => {
              set((state) => {
                const current = state.messagesByTask[taskId] ?? [];
                const failureText = `User input delivery failed: ${String(error)}`;
                const systemMessage: ChatMessage = {
                  id: buildMessageId({ taskId, count: current.length }),
                  role: "assistant",
                  model: "system",
                  providerId: "user",
                  content: failureText,
                  parts: [{
                    type: "system_event",
                    content: failureText,
                  }],
                };
                return {
                  messagesByTask: {
                    ...state.messagesByTask,
                    [taskId]: [...current, systemMessage],
                  },
                  workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
                };
              });
            });
            return;
          }
        }
        if (!activeTurnId && userInputPart && window.api?.provider?.respondUserInput) {
          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            const failureText = "User input delivery failed: no active turn found for this task.";
            const systemMessage: ChatMessage = {
              id: buildMessageId({ taskId, count: current.length }),
              role: "assistant",
              model: "system",
              providerId: "user",
              content: failureText,
              parts: [{
                type: "system_event",
                content: failureText,
              }],
            };
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [...current, systemMessage],
              },
              workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            };
          });
          return;
        }
        if (userInputPart) {
          applyUserInputState({
            taskId,
            messageId,
            requestId: userInputPart.requestId,
            answers,
            denied,
          });
        }
      },
      resolveDiff: ({ taskId, messageId, accepted, partIndex }) => {
        set((state) => {
          const current = state.messagesByTask[taskId] ?? [];
          return {
            messagesByTask: {
              ...state.messagesByTask,
              [taskId]: updateMessageById({
                messages: current,
                messageId,
                update: (message) => ({
                  ...message,
                  parts: message.parts.map((part, index) => {
                    if (part.type !== "code_diff") {
                      return part;
                    }
                    if (partIndex != null && index !== partIndex) {
                      return part;
                    }
                    return {
                      ...part,
                      status: accepted ? "accepted" : "rejected",
                    };
                  }),
                }),
              }),
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      },
      openDiffInEditor: ({ editorTabId, filePath, oldContent, newContent }) => {
        set((state) => {
          const existing = state.editorTabs.find((tab) => tab.id === editorTabId);
          const nextLanguage = resolveLanguage({ filePath });
          if (existing) {
            const canRefreshExisting = !existing.isDirty;
            const shouldRefreshExisting = canRefreshExisting
              && (
                existing.filePath !== filePath
                || existing.language !== nextLanguage
                || existing.originalContent !== oldContent
                || existing.content !== newContent
                || existing.savedContent !== newContent
              );

            return {
              editorTabs: shouldRefreshExisting
                ? state.editorTabs.map((tab) =>
                    tab.id === existing.id
                      ? {
                          ...tab,
                          filePath,
                          language: nextLanguage,
                          content: newContent,
                          originalContent: oldContent,
                          savedContent: newContent,
                          hasConflict: false,
                          isDirty: false,
                        }
                      : tab
                  )
                : state.editorTabs,
              activeEditorTabId: existing.id,
              layout: { ...state.layout, editorVisible: true, editorDiffMode: true },
            };
          }

          const nextTab: EditorTab = {
            id: editorTabId,
            filePath,
            kind: "text",
            language: nextLanguage,
            content: newContent,
            originalContent: oldContent,
            savedContent: newContent,
            baseRevision: null,
            hasConflict: false,
            isDirty: false,
          };

          return {
            editorTabs: [...state.editorTabs, nextTab],
            activeEditorTabId: nextTab.id,
            layout: { ...state.layout, editorVisible: true, editorDiffMode: true },
          };
        });
      },
      openFileFromTree: async ({ filePath }) => {
        const isImageFile = isImageFilePath({ filePath });
        let fileData = isImageFile ? null : await workspaceFsAdapter.readFile({ filePath });
        let imageData = isImageFile ? await workspaceFsAdapter.readFileDataUrl({ filePath }) : null;
        if (!fileData && !imageData) {
          const state = get();
          const workspaceRootPath = state.workspacePathById[state.activeWorkspaceId] || state.projectPath;
          if (workspaceRootPath) {
            await workspaceFsAdapter.setRoot?.({
              rootPath: workspaceRootPath,
              rootName: state.workspaceRootName ?? "project",
            });
            fileData = isImageFile ? null : await workspaceFsAdapter.readFile({ filePath });
            imageData = isImageFile ? await workspaceFsAdapter.readFileDataUrl({ filePath }) : null;
          }
        }

        set((state) => {
          const tabId = `file:${filePath}`;
          const existing = state.editorTabs.find((tab) => tab.id === tabId);
          if (existing) {
            return {
              activeEditorTabId: existing.id,
              layout: { ...state.layout, editorVisible: true, editorDiffMode: false },
            };
          }

          const fileContent = isImageFile ? imageData?.dataUrl ?? "" : fileData?.content ?? "";
          const baseRevision = isImageFile ? imageData?.revision ?? null : fileData?.revision ?? null;
          const nextTab: EditorTab = {
            id: tabId,
            filePath,
            kind: isImageFile ? "image" : "text",
            language: resolveLanguage({ filePath }),
            content: fileContent,
            originalContent: isImageFile ? undefined : fileContent,
            savedContent: isImageFile ? undefined : fileContent,
            baseRevision,
            hasConflict: false,
            isDirty: false,
          };

          return {
            editorTabs: [...state.editorTabs, nextTab],
            activeEditorTabId: nextTab.id,
            layout: { ...state.layout, editorVisible: true, editorDiffMode: false },
          };
        });
      },
      setActiveEditorTab: ({ tabId }) =>
        set((state) => {
          const selectedTab = state.editorTabs.find((tab) => tab.id === tabId);
          if (!selectedTab) {
            return { activeEditorTabId: tabId };
          }
          const isDiffTab = selectedTab.kind !== "image"
            && !selectedTab.id.startsWith("file:")
            && selectedTab.originalContent !== null;
          return {
            activeEditorTabId: tabId,
            layout: {
              ...state.layout,
              editorDiffMode: isDiffTab,
            },
          };
        }),
      reorderEditorTabs: ({ fromTabId, toTabId }) =>
        set((state) => {
          const fromIndex = state.editorTabs.findIndex((tab) => tab.id === fromTabId);
          const toIndex = state.editorTabs.findIndex((tab) => tab.id === toTabId);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            return {};
          }

          const nextTabs = [...state.editorTabs];
          const [movedTab] = nextTabs.splice(fromIndex, 1);
          if (!movedTab) {
            return {};
          }
          nextTabs.splice(toIndex, 0, movedTab);
          return { editorTabs: nextTabs };
        }),
      closeEditorTab: ({ tabId }) =>
        set((state) => {
          const closingIndex = state.editorTabs.findIndex((tab) => tab.id === tabId);
          if (closingIndex < 0) {
            return {};
          }
          const nextTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
          if (nextTabs.length === 0) {
            return {
              editorTabs: [],
              activeEditorTabId: null,
              layout: {
                ...state.layout,
                editorDiffMode: false,
              },
            };
          }

          if (state.activeEditorTabId !== tabId) {
            return { editorTabs: nextTabs };
          }

          const fallbackIndex = Math.max(0, closingIndex - 1);
          const fallbackTab = nextTabs[fallbackIndex] ?? nextTabs[0];
          const isDiffTab = Boolean(fallbackTab && !fallbackTab.id.startsWith("file:") && fallbackTab.originalContent !== null);

          return {
            editorTabs: nextTabs,
            activeEditorTabId: fallbackTab?.id ?? null,
            layout: {
              ...state.layout,
              editorDiffMode: isDiffTab,
            },
          };
        }),
      updateEditorContent: ({ tabId, content }) => {
        set((state) => ({
          editorTabs: state.editorTabs.map((tab) => {
            if (tab.id !== tabId) {
              return tab;
            }
            if (tab.kind === "image") {
              return tab;
            }
            return {
              ...tab,
              content,
              isDirty: (tab.savedContent ?? tab.originalContent ?? tab.content) !== content,
              hasConflict: false,
            };
          }),
        }));
      },
      saveActiveEditorTab: async () => {
        const state = get();
        const tabId = state.activeEditorTabId;
        const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
        if (!activeTab) {
          return { ok: false };
        }
        if (activeTab.kind === "image") {
          return { ok: false };
        }

        let result = await workspaceFsAdapter.writeFile({
          filePath: activeTab.filePath,
          content: activeTab.content,
          expectedRevision: activeTab.baseRevision,
        });
        if (!result.ok) {
          const workspaceRootPath = state.workspacePathById[state.activeWorkspaceId] || state.projectPath;
          if (workspaceRootPath) {
            await workspaceFsAdapter.setRoot?.({
              rootPath: workspaceRootPath,
              rootName: state.workspaceRootName ?? "project",
            });
            result = await workspaceFsAdapter.writeFile({
              filePath: activeTab.filePath,
              content: activeTab.content,
              expectedRevision: activeTab.baseRevision,
            });
          }
        }

        if (!result.ok) {
          if (result.conflict) {
            set((nextState) => ({
              editorTabs: nextState.editorTabs.map((tab) =>
                tab.id === activeTab.id
                  ? {
                      ...tab,
                      hasConflict: true,
                      baseRevision: result.revision ?? tab.baseRevision,
                    }
                  : tab
              ),
            }));
          }
          return { ok: false, conflict: result.conflict };
        }

        set((nextState) => ({
          editorTabs: nextState.editorTabs.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  originalContent: tab.id.startsWith("file:") ? tab.content : tab.originalContent,
                  savedContent: tab.content,
                  baseRevision: result.revision ?? tab.baseRevision,
                  hasConflict: false,
                  isDirty: false,
                }
              : tab
          ),
        }));

        return { ok: true };
      },
      checkOpenTabConflicts: async () => {
        const state = get();
        const updates: Array<{ tabId: string; fromDisk: string; revision: string; dirty: boolean; kind: "text" | "image" }> = [];

        for (const tab of state.editorTabs) {
          if (tab.kind === "image") {
            const imageDisk = await workspaceFsAdapter.readFileDataUrl({ filePath: tab.filePath });
            if (!imageDisk) {
              continue;
            }
            if (tab.baseRevision && imageDisk.revision === tab.baseRevision) {
              continue;
            }
            updates.push({
              tabId: tab.id,
              fromDisk: imageDisk.dataUrl,
              revision: imageDisk.revision,
              dirty: tab.isDirty,
              kind: "image",
            });
            continue;
          }

          const disk = await workspaceFsAdapter.readFile({ filePath: tab.filePath });
          if (!disk) {
            continue;
          }

          if (tab.baseRevision && disk.revision === tab.baseRevision) {
            continue;
          }

          updates.push({
            tabId: tab.id,
            fromDisk: disk.content,
            revision: disk.revision,
            dirty: tab.isDirty,
            kind: "text",
          });
        }

        if (updates.length === 0) {
          return;
        }

        set((nextState) => ({
          editorTabs: nextState.editorTabs.map((tab) => {
            const update = updates.find((item) => item.tabId === tab.id);
            if (!update) {
              return tab;
            }

            if (update.dirty) {
              return {
                ...tab,
                hasConflict: true,
                baseRevision: update.revision,
              };
            }

            return {
              ...tab,
              content: update.fromDisk,
              originalContent: update.kind === "image"
                ? tab.originalContent
                : tab.id.startsWith("file:")
                ? update.fromDisk
                : tab.originalContent,
              savedContent: update.kind === "image" ? tab.savedContent : update.fromDisk,
              baseRevision: update.revision,
              hasConflict: false,
              isDirty: false,
            };
          }),
        }));
      },
      sendEditorContextToChat: ({ taskId, instruction }) => {
        const state = get();
        const tabId = state.activeEditorTabId;
        const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
        if (!activeTab) {
          return;
        }

        get().sendUserMessage({
          taskId,
          content: instruction ?? "",
          fileContexts: [{
            filePath: activeTab.filePath,
            content: activeTab.kind === "image" ? `[image file omitted] ${activeTab.filePath}` : activeTab.content,
            language: activeTab.kind === "image" ? "image" : activeTab.language || resolveLanguage({ filePath: activeTab.filePath }),
            instruction,
          }],
        });
      },
    }),
    {
      name: APP_STORE_KEY,
      partialize: (state) => ({
        // Keep localStorage limited to lightweight UI/session state.
        // Workspace/task/message history is persisted via the workspace snapshot DB.
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        projectPath: state.projectPath,
        defaultBranch: state.defaultBranch,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        taskCheckpointById: state.taskCheckpointById,
        isDarkMode: state.isDarkMode,
        draftProvider: state.draftProvider,
        layout: state.layout,
        settings: state.settings,
        workspaceRootName: state.workspaceRootName,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        // Merge with defaultSettings so newly added fields are never undefined
        // for users whose persisted state pre-dates those fields.
        state.settings = { ...defaultSettings, ...state.settings };
        state.settings.codexApprovalPolicy = normalizeCodexApprovalPolicy({
          value: state.settings.codexApprovalPolicy,
        });
        state.settings.providerTimeoutMs = normalizeProviderTimeoutMs({
          value: state.settings.providerTimeoutMs,
        });
        state.layout = normalizeLayoutState(state.layout);
        const isDark = resolveDarkModeForTheme({
          themeMode: state.settings?.themeMode ?? "dark",
          fallback: state.isDarkMode,
        });
        state.isDarkMode = isDark;
        applyThemeClass({ enabled: isDark });
        applyThemeOverrides({ themeOverrides: state.settings.themeOverrides });
        applyFontOverrides({
          messageFontFamily: state.settings.messageFontFamily,
          messageMonoFontFamily: state.settings.messageMonoFontFamily,
          messageKoreanFontFamily: state.settings.messageKoreanFontFamily,
        });
      },
    }
  )
);
