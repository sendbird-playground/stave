import type {
  CliSessionCreateSessionArgs,
  TerminalCreateSessionArgs,
} from "../../src/lib/terminal/types";
import type {
  ClaudeContextUsageResponse,
  ClaudePluginReloadResponse,
  CodexMcpStatusResponse,
} from "../../src/lib/providers/provider.types";
import type {
  ConnectedToolStatusRequest,
  ConnectedToolStatusResponse,
} from "../../src/lib/providers/connected-tool-status";
import type {
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptsConfig,
  ScriptHookContext,
  ScriptTrigger,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptRunSource,
  WorkspaceScriptStatusEntry,
  WorkspaceScriptHookRunSummary,
} from "../../src/lib/workspace-scripts/types";
import type {
  BridgeEvent,
  ProviderCommandCatalogResult,
  StreamTurnArgs,
} from "../providers/types";

export interface HostWorkspaceScriptRunEntryArgs {
  workspaceId: string;
  scriptEntry: ResolvedWorkspaceScript;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source?: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}

export interface HostWorkspaceScriptRunHookArgs {
  workspaceId: string;
  trigger: ScriptTrigger;
  config: ResolvedWorkspaceScriptsConfig;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  hookContext?: ScriptHookContext;
}

export type HostWorkspaceScriptRunEntryResult =
  | {
      ok: true;
      runId: string;
      sessionId?: string;
      alreadyRunning?: boolean;
      exitCode?: number;
    }
  | {
      ok: false;
      runId: string;
      exitCode?: number;
      error?: string;
    };

export type HostWorkspaceScriptRunHookResult = {
  ok: boolean;
  summary: WorkspaceScriptHookRunSummary;
};

export interface HostTerminalCreateSessionResult {
  ok: boolean;
  sessionId?: string;
  stderr?: string;
}

export interface HostTerminalReadSessionResult {
  ok: boolean;
  output: string;
  stderr?: string;
}

export interface HostTerminalMutationResult {
  ok: boolean;
  stderr?: string;
}

export interface HostProviderStartStreamResult {
  ok: boolean;
  streamId: string;
  message?: string;
}

export interface HostProviderStartPushTurnResult
  extends HostProviderStartStreamResult {
  turnId: string | null;
}

export interface HostProviderReadStreamResult {
  ok: boolean;
  events: BridgeEvent[];
  cursor: number;
  done: boolean;
  message?: string;
}

export interface HostProviderMutationResult {
  ok: boolean;
  message?: string;
}

export interface HostProviderSuggestTaskNameArgs {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}

export interface HostProviderSuggestTaskNameResult {
  ok: boolean;
  title?: string;
}

export interface HostProviderSuggestCommitMessageArgs {
  cwd?: string;
}

export interface HostProviderSuggestCommitMessageResult {
  ok: boolean;
  message?: string;
}

export interface HostProviderSuggestPRDescriptionArgs {
  cwd?: string;
  baseBranch?: string;
  headBranch?: string;
  promptTemplate?: string;
  workspaceContext?: string;
}

export interface HostProviderSuggestPRDescriptionResult {
  ok: boolean;
  title?: string;
  body?: string;
  headBranch?: string;
}

export interface HostProviderStreamEventPayload {
  streamId: string;
  event: BridgeEvent;
  sequence: number;
  done: boolean;
  taskId: string | null;
  workspaceId: string | null;
  providerId: StreamTurnArgs["providerId"];
  turnId: string | null;
}

export interface HostServiceRequestMap {
  "service.shutdown": undefined;
  "terminal.create-session": TerminalCreateSessionArgs;
  "terminal.create-cli-session": CliSessionCreateSessionArgs;
  "terminal.write-session": {
    sessionId: string;
    input: string;
  };
  "terminal.read-session": {
    sessionId: string;
  };
  "terminal.set-session-delivery-mode": {
    sessionId: string;
    deliveryMode: "poll" | "push";
  };
  "terminal.resize-session": {
    sessionId: string;
    cols: number;
    rows: number;
  };
  "terminal.close-session": {
    sessionId: string;
  };
  "terminal.buffer-session-output": {
    sessionId: string;
    output: string;
  };
  "terminal.cleanup-all": undefined;
  "workspace-scripts.run-entry": HostWorkspaceScriptRunEntryArgs;
  "workspace-scripts.run-hook": HostWorkspaceScriptRunHookArgs;
  "workspace-scripts.stop-entry": {
    workspaceId: string;
    scriptId: string;
    scriptKind: ResolvedWorkspaceScript["kind"];
  };
  "workspace-scripts.stop-all": {
    workspaceId: string;
  };
  "workspace-scripts.get-status": {
    workspaceId: string;
  };
  "workspace-scripts.cleanup-all": undefined;
  "provider.stream-turn": StreamTurnArgs;
  "provider.start-stream-turn": StreamTurnArgs;
  "provider.start-push-turn": StreamTurnArgs;
  "provider.read-stream-turn": {
    streamId: string;
    cursor: number;
  };
  "provider.abort-turn": {
    turnId: string;
  };
  "provider.cleanup-task": {
    taskId: string;
  };
  "provider.respond-approval": {
    turnId: string;
    requestId: string;
    approved: boolean;
  };
  "provider.respond-user-input": {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  };
  "provider.check-availability": {
    providerId: StreamTurnArgs["providerId"];
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-command-catalog": {
    providerId: StreamTurnArgs["providerId"];
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-connected-tool-status": ConnectedToolStatusRequest;
  "provider.get-claude-context-usage": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.reload-claude-plugins": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.get-codex-mcp-status": {
    cwd?: string;
    runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  };
  "provider.suggest-task-name": HostProviderSuggestTaskNameArgs;
  "provider.suggest-commit-message": HostProviderSuggestCommitMessageArgs;
  "provider.suggest-pr-description": HostProviderSuggestPRDescriptionArgs;
}

export interface HostServiceResponseMap {
  "service.shutdown": {
    ok: true;
  };
  "terminal.create-session": HostTerminalCreateSessionResult;
  "terminal.create-cli-session": HostTerminalCreateSessionResult;
  "terminal.write-session": HostTerminalMutationResult;
  "terminal.read-session": HostTerminalReadSessionResult;
  "terminal.set-session-delivery-mode": HostTerminalMutationResult;
  "terminal.resize-session": HostTerminalMutationResult;
  "terminal.close-session": HostTerminalMutationResult;
  "terminal.buffer-session-output": HostTerminalMutationResult;
  "terminal.cleanup-all": {
    ok: true;
  };
  "workspace-scripts.run-entry": HostWorkspaceScriptRunEntryResult;
  "workspace-scripts.run-hook": HostWorkspaceScriptRunHookResult;
  "workspace-scripts.stop-entry": {
    ok: true;
  };
  "workspace-scripts.stop-all": {
    ok: true;
  };
  "workspace-scripts.get-status": {
    statuses: WorkspaceScriptStatusEntry[];
  };
  "workspace-scripts.cleanup-all": {
    ok: true;
  };
  "provider.stream-turn": BridgeEvent[];
  "provider.start-stream-turn": HostProviderStartStreamResult;
  "provider.start-push-turn": HostProviderStartPushTurnResult;
  "provider.read-stream-turn": HostProviderReadStreamResult;
  "provider.abort-turn": HostProviderMutationResult;
  "provider.cleanup-task": HostProviderMutationResult;
  "provider.respond-approval": HostProviderMutationResult;
  "provider.respond-user-input": HostProviderMutationResult;
  "provider.check-availability": {
    ok: boolean;
    available: boolean;
    detail: string;
  };
  "provider.get-command-catalog": ProviderCommandCatalogResult;
  "provider.get-connected-tool-status": ConnectedToolStatusResponse;
  "provider.get-claude-context-usage": ClaudeContextUsageResponse;
  "provider.reload-claude-plugins": ClaudePluginReloadResponse;
  "provider.get-codex-mcp-status": CodexMcpStatusResponse;
  "provider.suggest-task-name": HostProviderSuggestTaskNameResult;
  "provider.suggest-commit-message": HostProviderSuggestCommitMessageResult;
  "provider.suggest-pr-description": HostProviderSuggestPRDescriptionResult;
}

export interface HostServiceEventMap {
  "terminal.output": {
    sessionId: string;
    output: string;
  };
  "terminal.exit": {
    sessionId: string;
    exitCode: number;
    signal?: number;
  };
  "workspace-scripts.event": WorkspaceScriptEventEnvelope;
  "provider.stream-event": HostProviderStreamEventPayload;
}

export type HostServiceMethod = keyof HostServiceRequestMap;
export type HostServiceEventName = keyof HostServiceEventMap;

export interface HostServiceReadyEnvelope {
  type: "ready";
}

export interface HostServiceRequestEnvelope<TMethod extends HostServiceMethod> {
  type: "request";
  id: number;
  method: TMethod;
  params: HostServiceRequestMap[TMethod];
}

export interface HostServiceSuccessResponseEnvelope<
  TMethod extends HostServiceMethod,
> {
  type: "response";
  id: number;
  ok: true;
  result: HostServiceResponseMap[TMethod];
}

export interface HostServiceErrorResponseEnvelope {
  type: "response";
  id: number;
  ok: false;
  error: string;
}

export interface HostServiceEventEnvelope<TEvent extends HostServiceEventName> {
  type: "event";
  event: TEvent;
  payload: HostServiceEventMap[TEvent];
}

export type AnyHostServiceRequestEnvelope = {
  [TMethod in HostServiceMethod]: HostServiceRequestEnvelope<TMethod>;
}[HostServiceMethod];

export type AnyHostServiceResponseEnvelope =
  | {
      [TMethod in HostServiceMethod]: HostServiceSuccessResponseEnvelope<TMethod>;
    }[HostServiceMethod]
  | HostServiceErrorResponseEnvelope;

export type AnyHostServiceEventEnvelope = {
  [TEvent in HostServiceEventName]: HostServiceEventEnvelope<TEvent>;
}[HostServiceEventName];

export type AnyHostServiceMessage =
  | HostServiceReadyEnvelope
  | AnyHostServiceRequestEnvelope
  | AnyHostServiceResponseEnvelope
  | AnyHostServiceEventEnvelope;
