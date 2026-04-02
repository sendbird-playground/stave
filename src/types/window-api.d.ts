import type {
  CanonicalConversationRequest,
  ClaudeContextUsageResponse,
  ClaudePluginReloadResponse,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type {
  StaveLocalMcpRequestLog,
  StaveLocalMcpRequestLogQuery,
  StaveLocalMcpStatus,
} from "@/lib/local-mcp";
import type { RepoMapResponse } from "@/lib/fs/repo-map.types";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";
import type { GitHubPrPayload } from "@/lib/pr-status";
import type { SkillCatalogResponse } from "@/lib/skills/types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { PromptDraft } from "@/types/chat";
import type {
  SyncOriginMainResult,
  ToolingStatusRequest,
  ToolingStatusSnapshot,
} from "@/lib/tooling-status";

interface ProviderStreamTurnArgs {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

type ProviderStreamTurnResult =
  | unknown[]
  | AsyncIterable<unknown>
  | Promise<unknown[]>
  | Promise<AsyncIterable<unknown>>;

interface WindowProviderApi {
  streamTurn?: (args: ProviderStreamTurnArgs) => ProviderStreamTurnResult;
  startStreamTurn?: (
    args: ProviderStreamTurnArgs,
  ) => Promise<{ ok: boolean; streamId: string; message?: string }>;
  startPushTurn?: (args: ProviderStreamTurnArgs) => Promise<{
    ok: boolean;
    streamId: string;
    turnId: string | null;
    message?: string;
  }>;
  readStreamTurn?: (args: { streamId: string; cursor: number }) => Promise<{
    ok: boolean;
    events: unknown[];
    cursor: number;
    done: boolean;
    message?: string;
  }>;
  subscribeStreamEvents?: (
    listener: (payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
      taskId: string | null;
      workspaceId: string | null;
      providerId: ProviderId;
      turnId: string | null;
    }) => void,
  ) => () => void;
  abortTurn?: (args: {
    turnId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  cleanupTask?: (args: {
    taskId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  respondUserInput?: (args: {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  checkAvailability?: (args: {
    providerId: ProviderId;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
    ok: boolean;
    available: boolean;
    detail: string;
  }>;
  getCommandCatalog?: (args: {
    providerId: ProviderId;
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<{
    ok: boolean;
    supported: boolean;
    commands: ProviderSlashCommand[];
    detail: string;
  }>;
  getClaudeContextUsage?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudeContextUsageResponse>;
  reloadClaudePlugins?: (args: {
    cwd?: string;
    runtimeOptions?: ProviderStreamTurnArgs["runtimeOptions"];
  }) => Promise<ClaudePluginReloadResponse>;
  /** Generates a short task title from the given prompt and optional
   *  conversation history using a lightweight single-turn Claude query
   *  isolated from the main task conversation. */
  suggestTaskName?: (args: {
    prompt: string;
    history?: Array<{ role: string; content: string }>;
  }) => Promise<{ ok: boolean; title?: string }>;
  /** Generates a conventional commit message from the current git diff in the
   *  given working directory using a lightweight single-turn Claude query. */
  suggestCommitMessage?: (args: {
    cwd?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  /** Generates a PR title and description from the branch diff and commit log
   *  using a lightweight single-turn Claude query. */
  suggestPRDescription?: (args: {
    cwd?: string;
    baseBranch?: string;
  }) => Promise<{ ok: boolean; title?: string; body?: string }>;
}

interface WindowFsApi {
  pickRoot?: () => Promise<{
    ok: boolean;
    rootPath?: string;
    rootName?: string;
    files: string[];
    stderr?: string;
  }>;
  resolvePath?: (args: { inputPath: string }) => Promise<{
    ok: boolean;
    rootPath?: string;
    rootName?: string;
    files?: string[];
    stderr?: string;
  }>;
  listFiles?: (args: {
    rootPath: string;
  }) => Promise<{ ok: boolean; files: string[]; stderr?: string }>;
  getRepoMap?: (args: {
    rootPath: string;
    refresh?: boolean;
  }) => Promise<RepoMapResponse>;
  listDirectory?: (args: {
    rootPath: string;
    directoryPath?: string;
  }) => Promise<{
    ok: boolean;
    entries: Array<{
      name: string;
      path: string;
      type: "file" | "folder";
    }>;
    stderr?: string;
  }>;
  readFile?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    content: string;
    revision: string;
    stderr?: string;
  }>;
  readFileDataUrl?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    dataUrl: string;
    revision: string;
    stderr?: string;
  }>;
  writeFile?: (args: {
    rootPath: string;
    filePath: string;
    content: string;
    expectedRevision?: string | null;
  }) => Promise<{
    ok: boolean;
    revision?: string;
    conflict?: boolean;
    stderr?: string;
  }>;
  createFile?: (args: { rootPath: string; filePath: string }) => Promise<{
    ok: boolean;
    revision?: string;
    alreadyExists?: boolean;
    stderr?: string;
  }>;
  createDirectory?: (args: {
    rootPath: string;
    directoryPath: string;
  }) => Promise<{
    ok: boolean;
    alreadyExists?: boolean;
    stderr?: string;
  }>;
  readTypeDefs?: (args: {
    rootPath: string;
    entryFilePath?: string;
  }) => Promise<{
    ok: boolean;
    libs: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
  readSourceFiles?: (args: {
    rootPath: string;
    entryFilePath?: string;
  }) => Promise<{
    ok: boolean;
    files: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
}

interface WindowSkillsApi {
  getCatalog?: (args?: {
    workspacePath?: string;
  }) => Promise<SkillCatalogResponse>;
}

interface WindowLocalMcpApi {
  getStatus?: () => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  updateConfig?: (args: {
    enabled?: boolean;
    port?: number;
    token?: string;
  }) => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  rotateToken?: () => Promise<{
    ok: boolean;
    status: StaveLocalMcpStatus | null;
    message?: string;
  }>;
  listRequestLogs?: (args?: StaveLocalMcpRequestLogQuery) => Promise<{
    ok: boolean;
    logs: StaveLocalMcpRequestLog[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    message?: string;
  }>;
  getRequestLog?: (args: { id: string; includePayload?: boolean }) => Promise<{
    ok: boolean;
    log: StaveLocalMcpRequestLog | null;
    message?: string;
  }>;
  clearRequestLogs?: () => Promise<{
    ok: boolean;
    cleared: number;
    message?: string;
  }>;
  respondApproval?: (args: {
    workspaceId: string;
    taskId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
    result?: {
      ok: boolean;
      workspaceId: string;
      taskId: string;
      requestId: string;
      approved: boolean;
    };
  }>;
  respondUserInput?: (args: {
    workspaceId: string;
    taskId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
    result?: {
      ok: boolean;
      workspaceId: string;
      taskId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    };
  }>;
}

type LspLanguageId = "python" | "typescript";

interface WindowLspApi {
  syncDocument?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    documentLanguageId: string;
    text: string;
    version: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  closeDocument?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  hover?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  completion?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  definition?: (args: {
    rootPath: string;
    languageId: LspLanguageId;
    filePath: string;
    line: number;
    character: number;
    commandOverride?: string;
  }) => Promise<{
    ok: boolean;
    detail?: string;
    value?: unknown;
  }>;
  stopSessions?: (args: { rootPath?: string }) => Promise<{ ok: boolean }>;
  subscribeEvents?: (
    listener: (
      payload:
        | {
            type: "status";
            rootPath: string;
            languageId: LspLanguageId;
            status?: "starting" | "ready" | "error" | "unavailable" | "stopped";
            detail?: string;
          }
        | {
            type: "diagnostics";
            rootPath: string;
            languageId: LspLanguageId;
            filePath?: string;
            diagnostics?: Array<{
              severity?: number;
              message: string;
              source?: string;
              code?: string;
              range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
              };
            }>;
          },
    ) => void,
  ) => () => void;
}

interface EslintRequestArgs {
  rootPath: string;
  filePath: string;
  text: string;
}

interface EslintDiagnostic {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface EslintResult {
  ok: boolean;
  diagnostics?: EslintDiagnostic[];
  output?: string;
  detail?: string;
}

interface WindowEslintApi {
  lint?: (args: EslintRequestArgs) => Promise<EslintResult>;
  fix?: (args: EslintRequestArgs) => Promise<EslintResult>;
}

interface TerminalRunArgs {
  command: string;
  cwd?: string;
}

interface TerminalRunResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface WindowTerminalApi {
  runCommand?: (args: TerminalRunArgs) => Promise<TerminalRunResult>;
  createSession?: (args: {
    cwd?: string;
    shell?: string;
    cols?: number;
    rows?: number;
  }) => Promise<{ ok: boolean; sessionId?: string }>;
  writeSession?: (args: {
    sessionId: string;
    input: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  readSession?: (args: {
    sessionId: string;
  }) => Promise<{ ok: boolean; output: string; stderr?: string }>;
  resizeSession?: (args: {
    sessionId: string;
    cols: number;
    rows: number;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  closeSession?: (args: {
    sessionId: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
}

interface WindowToolingApi {
  getStatus?: (args: ToolingStatusRequest) => Promise<ToolingStatusSnapshot>;
  syncOriginMain?: (args: { cwd?: string }) => Promise<SyncOriginMainResult>;
}

interface SourceControlStatusItem {
  code: string;
  path: string;
  indexStatus?: string;
  workingTreeStatus?: string;
}

interface SourceControlStatusResult {
  ok: boolean;
  branch: string;
  items: SourceControlStatusItem[];
  hasConflicts: boolean;
  stderr: string;
}

interface SourceControlCommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface WindowSourceControlApi {
  getStatus?: (args: { cwd?: string }) => Promise<SourceControlStatusResult>;
  stageAll?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  unstageAll?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  commit?: (args: {
    message: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  stageFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  unstageFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  discardFile?: (args: {
    path: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  getDiff?: (args: { path: string; cwd?: string }) => Promise<{
    ok: boolean;
    content: string;
    oldContent?: string;
    newContent?: string;
    stderr: string;
  }>;
  getHistory?: (args: { cwd?: string; limit?: number }) => Promise<{
    ok: boolean;
    items: Array<{ hash: string; relativeDate: string; subject: string }>;
    stderr: string;
  }>;
  listBranches?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    current: string;
    branches: string[];
    remoteBranches: string[];
    worktreePathByBranch: Record<string, string>;
    stderr: string;
  }>;
  createBranch?: (args: {
    name: string;
    cwd?: string;
    from?: string;
  }) => Promise<SourceControlCommandResult>;
  checkoutBranch?: (args: {
    name: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  mergeBranch?: (args: {
    branch: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  rebaseBranch?: (args: {
    branch: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  cherryPick?: (args: {
    commit: string;
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  createPR?: (args: {
    title: string;
    body?: string;
    baseBranch?: string;
    draft?: boolean;
    cwd?: string;
  }) => Promise<{ ok: boolean; prUrl?: string; stderr?: string }>;
  getPrStatus?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    pr: GitHubPrPayload | null;
    stderr?: string;
  }>;
  getPrStatusForUrl?: (args: { url: string; cwd?: string }) => Promise<{
    ok: boolean;
    pr: GitHubPrPayload | null;
    stderr?: string;
  }>;
  setPrReady?: (args: { cwd?: string }) => Promise<SourceControlCommandResult>;
  mergePr?: (args: {
    method?: "merge" | "squash" | "rebase";
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
  updatePrBranch?: (args: {
    cwd?: string;
  }) => Promise<SourceControlCommandResult>;
}

interface WindowPersistenceApi {
  listWorkspaces?: () => Promise<{
    ok: boolean;
    rows: Array<{ id: string; name: string; updatedAt: string }>;
  }>;
  loadWorkspace?: (args: { workspaceId: string }) => Promise<{
    ok: boolean;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerConversationByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
      workspaceInformation?: WorkspaceInformationState;
    } | null;
  }>;
  loadProjectRegistry?: () => Promise<{
    ok: boolean;
    projects: unknown[];
  }>;
  upsertWorkspace?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerConversationByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
      workspaceInformation?: WorkspaceInformationState;
    };
  }) => Promise<{ ok: boolean }>;
  saveProjectRegistry?: (args: {
    projects: unknown[];
  }) => Promise<{ ok: boolean }>;
  closeWorkspace?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  listNotifications?: (args?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => Promise<{
    ok: boolean;
    notifications: AppNotification[];
  }>;
  createNotification?: (args: {
    notification: AppNotificationCreateInput;
  }) => Promise<{
    ok: boolean;
    inserted: boolean;
    notification: AppNotification | null;
  }>;
  markNotificationRead?: (args: { id: string; readAt?: string }) => Promise<{
    ok: boolean;
    notification: AppNotification | null;
  }>;
  markAllNotificationsRead?: (args?: { readAt?: string }) => Promise<{
    ok: boolean;
    count: number;
  }>;
  listTaskTurns?: (args: {
    workspaceId: string;
    taskId: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
      eventCount: number;
    }>;
  }>;
  listLatestWorkspaceTurns?: (args: {
    workspaceId: string;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    turns: Array<{
      id: string;
      workspaceId: string;
      taskId: string;
      providerId: "claude-code" | "codex" | "stave";
      createdAt: string;
      completedAt: string | null;
      eventCount: number;
    }>;
  }>;
  upsertWorkspaceSync?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex" | "stave";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<
        string,
        Array<{
          id: string;
          role: "user" | "assistant";
          model: string;
          providerId: string;
          content: string;
          isStreaming?: boolean;
          usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheCreationTokens?: number;
            totalCostUsd?: number;
          };
          promptSuggestions?: string[];
          parts: unknown[];
        }>
      >;
      promptDraftByTask?: Record<string, PromptDraft>;
      providerConversationByTask?: Record<
        string,
        {
          "claude-code"?: string;
          codex?: string;
        }
      >;
      editorTabs?: Array<{
        id: string;
        filePath: string;
        kind?: "text" | "image";
        language: string;
        content: string;
        originalContent?: string;
        savedContent?: string;
        baseRevision?: string | null;
        hasConflict: boolean;
        isDirty: boolean;
      }>;
      activeEditorTabId?: string | null;
      workspaceInformation?: WorkspaceInformationState;
    };
  }) => { ok: boolean };
  listTurnEvents?: (args: {
    turnId: string;
    afterSequence?: number;
    limit?: number;
  }) => Promise<{
    ok: boolean;
    events: Array<{
      id: string;
      turnId: string;
      sequence: number;
      eventType: string;
      payload: unknown;
      createdAt: string;
    }>;
  }>;
}

interface AppMetricsResult {
  processes: Array<{
    pid: number;
    type: string;
    memory: {
      workingSetSizeKB: number;
      peakWorkingSetSizeKB: number;
    };
    cpu: {
      percentCPUUsage: number;
    };
  }>;
  mainProcess: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  uptimeSeconds: number;
}

interface WindowMetricsApi {
  getAppMetrics?: () => Promise<AppMetricsResult>;
}

interface WindowCaptureApi {
  screenshot: () => Promise<{ ok: boolean; dataUrl: string }>;
}

interface WindowInlineCompletionApi {
  request?: (args: {
    prefix: string;
    suffix: string;
    filePath: string;
    language: string;
    maxTokens?: number;
  }) => Promise<{ ok: boolean; text: string; error?: string }>;
  abort?: () => Promise<{ ok: boolean }>;
  available?: () => Promise<{ ok: boolean; available: boolean }>;
}

interface WindowApi {
  platform?: NodeJS.Platform;
  provider?: WindowProviderApi;
  persistence?: WindowPersistenceApi;
  fs?: WindowFsApi;
  skills?: WindowSkillsApi;
  localMcp?: WindowLocalMcpApi;
  lsp?: WindowLspApi;
  eslint?: WindowEslintApi;
  terminal?: WindowTerminalApi;
  tooling?: WindowToolingApi;
  sourceControl?: WindowSourceControlApi;
  metrics?: WindowMetricsApi;
  capture?: WindowCaptureApi;
  inlineCompletion?: WindowInlineCompletionApi;
  window?: {
    minimize?: () => Promise<void>;
    toggleMaximize?: () => Promise<{ isMaximized: boolean }>;
    close?: () => Promise<void>;
    isMaximized?: () => Promise<{ isMaximized: boolean }>;
    getGpuStatus?: () => Promise<{
      hardwareAccelerationEnabled: boolean;
      featureStatus: Record<string, string>;
    }>;
    subscribeZoomChanges?: (
      listener: (payload: { factor: number; percent: number }) => void,
    ) => () => void;
    subscribeCloseShortcut?: (listener: () => void) => () => void;
  };
  shell?: {
    openExternal?: (args: {
      url: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    showInFinder?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    openInVSCode?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
    openInTerminal?: (args: {
      path: string;
    }) => Promise<{ ok: boolean; stderr?: string }>;
  };
}

declare global {
  interface Window {
    api?: WindowApi;
  }
}

export {};
