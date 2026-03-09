export type MessageRole = "user" | "assistant";

export type MessagePartType =
  | "text"
  | "thinking"
  | "tool_use"
  | "code_diff"
  | "file_context"
  | "approval"
  | "user_input"
  | "system_event";

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
}

export interface ToolUsePart extends MessagePartBase {
  type: "tool_use";
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
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

export interface SystemEventPart extends MessagePartBase {
  type: "system_event";
  content: string;
}

export type MessagePart =
  | TextPart
  | ThinkingPart
  | ToolUsePart
  | CodeDiffPart
  | FileContextPart
  | ApprovalPart
  | UserInputPart
  | SystemEventPart;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  model: string;
  providerId: "claude-code" | "codex" | "user";
  content: string;
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

export interface Task {
  id: string;
  title: string;
  provider: "claude-code" | "codex";
  updatedAt: string;
  unread: boolean;
  archivedAt?: string | null;
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
