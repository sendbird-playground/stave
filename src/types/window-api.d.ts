import type { ProviderId } from "@/lib/providers/provider.types";

interface ProviderStreamTurnArgs {
  providerId: ProviderId;
  prompt: string;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: {
    model?: string;
    chatStreamingEnabled?: boolean;
    debug?: boolean;
    providerTimeoutMs?: number;
    claudePermissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
    claudeAllowDangerouslySkipPermissions?: boolean;
    claudeSandboxEnabled?: boolean;
    claudeAllowUnsandboxedCommands?: boolean;
    claudeSystemPrompt?: string;
    claudeMaxTurns?: number;
    claudeMaxBudgetUsd?: number;
    claudeEffort?: "low" | "medium" | "high" | "max";
    claudeThinkingMode?: "adaptive" | "enabled" | "disabled";
    claudeAllowedTools?: string[];
    claudeDisallowedTools?: string[];
    codexSandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    codexNetworkAccessEnabled?: boolean;
    codexApprovalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
    codexPathOverride?: string;
    codexModelReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
    codexWebSearchMode?: "disabled" | "cached" | "live";
  };
}

type ProviderStreamTurnResult =
  | unknown[]
  | AsyncIterable<unknown>
  | Promise<unknown[]>
  | Promise<AsyncIterable<unknown>>;

interface WindowProviderApi {
  streamTurn?: (args: ProviderStreamTurnArgs) => ProviderStreamTurnResult;
  startStreamTurn?: (args: ProviderStreamTurnArgs) => Promise<{ ok: boolean; streamId: string }>;
  startPushTurn?: (args: ProviderStreamTurnArgs) => Promise<{ ok: boolean; streamId: string; turnId: string | null }>;
  readStreamTurn?: (args: { streamId: string; cursor: number }) => Promise<{
    ok: boolean;
    events: unknown[];
    cursor: number;
    done: boolean;
    message?: string;
  }>;
  subscribeStreamEvents?: (listener: (payload: {
    streamId: string;
    event: unknown;
    sequence: number;
    done: boolean;
    taskId: string | null;
    workspaceId: string | null;
    providerId: ProviderId;
    turnId: string | null;
  }) => void) => () => void;
  abortTurn?: (args: { providerId: ProviderId }) => Promise<{ ok: boolean; message?: string }>;
  cleanupTask?: (args: { taskId: string }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: { providerId: ProviderId; requestId: string; approved: boolean }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  respondUserInput?: (args: {
    providerId: ProviderId;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  checkAvailability?: (args: { providerId: ProviderId }) => Promise<{
    ok: boolean;
    available: boolean;
    detail: string;
  }>;
}

interface WindowFsApi {
  pickRoot?: () => Promise<{ ok: boolean; rootPath?: string; rootName?: string; files: string[]; stderr?: string }>;
  listFiles?: (args: { rootPath: string }) => Promise<{ ok: boolean; files: string[]; stderr?: string }>;
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
  writeFile?: (args: { rootPath: string; filePath: string; content: string; expectedRevision?: string | null }) => Promise<{
    ok: boolean;
    revision?: string;
    conflict?: boolean;
    stderr?: string;
  }>;
  readTypeDefs?: (args: { rootPath: string }) => Promise<{
    ok: boolean;
    libs: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
  readSourceFiles?: (args: { rootPath: string }) => Promise<{
    ok: boolean;
    files: Array<{ content: string; filePath: string }>;
    stderr?: string;
  }>;
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
  createSession?: (args: { cwd?: string; shell?: string; cols?: number; rows?: number }) => Promise<{ ok: boolean; sessionId?: string }>;
  writeSession?: (args: { sessionId: string; input: string }) => Promise<{ ok: boolean; stderr?: string }>;
  readSession?: (args: { sessionId: string }) => Promise<{ ok: boolean; output: string; stderr?: string }>;
  resizeSession?: (args: { sessionId: string; cols: number; rows: number }) => Promise<{ ok: boolean; stderr?: string }>;
  closeSession?: (args: { sessionId: string }) => Promise<{ ok: boolean; stderr?: string }>;
}

interface SourceControlStatusItem {
  code: string;
  path: string;
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
  commit?: (args: { message: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  stageFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  unstageFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  discardFile?: (args: { path: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  getDiff?: (args: { path: string; cwd?: string }) => Promise<{ ok: boolean; content: string; stderr: string }>;
  getHistory?: (args: { cwd?: string; limit?: number }) => Promise<{
    ok: boolean;
    items: Array<{ hash: string; relativeDate: string; subject: string }>;
    stderr: string;
  }>;
  listBranches?: (args: { cwd?: string }) => Promise<{
    ok: boolean;
    current: string;
    branches: string[];
    stderr: string;
  }>;
  createBranch?: (args: { name: string; cwd?: string; from?: string }) => Promise<SourceControlCommandResult>;
  checkoutBranch?: (args: { name: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  mergeBranch?: (args: { branch: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  rebaseBranch?: (args: { branch: string; cwd?: string }) => Promise<SourceControlCommandResult>;
  cherryPick?: (args: { commit: string; cwd?: string }) => Promise<SourceControlCommandResult>;
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
        provider: "claude-code" | "codex";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
    } | null;
  }>;
  upsertWorkspace?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
    };
  }) => Promise<{ ok: boolean }>;
  deleteWorkspace?: (args: { workspaceId: string }) => Promise<{ ok: boolean }>;
  upsertWorkspaceSync?: (args: {
    id: string;
    name: string;
    snapshot: {
      activeTaskId: string;
      tasks: Array<{
        id: string;
        title: string;
        provider: "claude-code" | "codex";
        updatedAt: string;
        unread: boolean;
      }>;
      messagesByTask: Record<string, Array<{
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
      }>>;
    };
  }) => { ok: boolean };
  listTurnEvents?: (args: { turnId: string; afterSequence?: number; limit?: number }) => Promise<{
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

interface WindowApi {
  provider?: WindowProviderApi;
  persistence?: WindowPersistenceApi;
  fs?: WindowFsApi;
  terminal?: WindowTerminalApi;
  sourceControl?: WindowSourceControlApi;
  window?: {
    minimize?: () => Promise<void>;
    toggleMaximize?: () => Promise<{ isMaximized: boolean }>;
    close?: () => Promise<void>;
    isMaximized?: () => Promise<{ isMaximized: boolean }>;
  };
  shell?: {
    openExternal?: (args: { url: string }) => Promise<{ ok: boolean }>;
  };
}

declare global {
  interface Window {
    api?: WindowApi;
  }
}

export {};
