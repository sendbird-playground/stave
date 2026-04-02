export type MessageRole = "user" | "assistant";

export type MessagePartType =
  | "text"
  | "thinking"
  | "tool_use"
  | "code_diff"
  | "file_context"
  | "image_context"
  | "approval"
  | "user_input"
  | "system_event"
  | "orchestration_progress"
  | "stave_processing";

export type Attachment =
  | { kind: "file"; filePath: string }
  | { kind: "image"; id: string; dataUrl: string; label: string };

export type ClaudePermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
export type ClaudePermissionModeBeforePlan = Exclude<ClaudePermissionMode, "plan"> | null;

export interface PromptDraftRuntimeOverrides {
  claudePermissionMode?: ClaudePermissionMode;
  claudePermissionModeBeforePlan?: ClaudePermissionModeBeforePlan;
  codexExperimentalPlanMode?: boolean;
}

export interface PromptDraft {
  text: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
  runtimeOverrides?: PromptDraftRuntimeOverrides;
}

export interface MessagePartBase {
  type: MessagePartType;
}

export interface TextPart extends MessagePartBase {
  type: "text";
  text: string;
}

export interface ThinkingPart extends MessagePartBase {
  type: "thinking";
  text: string;
  isStreaming: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface ToolUsePart extends MessagePartBase {
  type: "tool_use";
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  elapsedSeconds?: number;
  /** Progress messages streamed from a running subagent (Agent tool only). */
  progressMessages?: string[];
}

export interface CodeDiffPart extends MessagePartBase {
  type: "code_diff";
  filePath: string;
  oldContent: string;
  newContent: string;
  status: "pending" | "accepted" | "rejected";
}

export interface FileContextPart extends MessagePartBase {
  type: "file_context";
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}

export interface ApprovalPart extends MessagePartBase {
  type: "approval";
  toolName: string;
  description: string;
  requestId: string;
  state: "approval-requested" | "approval-responded" | "output-denied";
}

export interface UserInputOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  question: string;
  header: string;
  options: UserInputOption[];
  multiSelect?: boolean;
}

export interface UserInputPart extends MessagePartBase {
  type: "user_input";
  requestId: string;
  toolName: string;
  questions: UserInputQuestion[];
  answers?: Record<string, string>;
  state: "input-requested" | "input-responded" | "input-denied";
}

export interface ImageContextPart extends MessagePartBase {
  type: "image_context";
  dataUrl: string;
  label: string;
  mimeType: string;
}

export interface SystemEventPart extends MessagePartBase {
  type: "system_event";
  content: string;
  compactBoundary?: {
    trigger?: string;
    gitRef?: string;
  };
}

export interface StaveProcessingPart extends MessagePartBase {
  type: "stave_processing";
  strategy: "direct" | "orchestrate";
  /** The model chosen for direct execution. */
  model?: string;
  /** The supervisor model chosen for orchestration. */
  supervisorModel?: string;
  /** Short human-readable reason from the Pre-processor. */
  reason: string;
  /** Whether the Pre-processor flagged this as an urgent request. */
  fastModeRequested?: boolean;
  /** Whether fast mode was actually applied to the resolved provider. */
  fastModeApplied?: boolean;
}

export interface OrchestrationSubtaskState {
  id: string;
  title: string;
  model: string;
  status: "pending" | "running" | "done" | "error";
}

export interface OrchestrationProgressPart extends MessagePartBase {
  type: "orchestration_progress";
  supervisorModel: string;
  subtasks: OrchestrationSubtaskState[];
  status: "planning" | "executing" | "synthesizing" | "done";
}

export type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolUsePart
  | CodeDiffPart
  | FileContextPart
  | ImageContextPart
  | ApprovalPart
  | UserInputPart
  | SystemEventPart
  | OrchestrationProgressPart
  | StaveProcessingPart;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  model: string;
  providerId: "claude-code" | "codex" | "stave" | "user";
  content: string;
  startedAt?: string;
  completedAt?: string;
  isStreaming?: boolean;
  isPlanResponse?: boolean;
  planText?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    totalCostUsd?: number;
  };
  promptSuggestions?: string[];
  parts: MessagePart[];
}

export type TaskControlMode = "interactive" | "managed";
export type TaskControlOwner = "stave" | "external";

export interface Task {
  id: string;
  title: string;
  provider: "claude-code" | "codex" | "stave";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
  controlMode: TaskControlMode;
  controlOwner: TaskControlOwner;
  /** Legacy relative paths to persisted plan files kept for snapshot compatibility. */
  planFilePaths?: string[];
}

export interface EditorTab {
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
}
