import { z } from "zod";
import type { WorkspaceSnapshot } from "@/lib/db/workspaces.db";
const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ThinkingPartSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
  isStreaming: z.boolean(),
});

const ToolUsePartSchema = z.object({
  type: z.literal("tool_use"),
  toolUseId: z.string().optional(),
  toolName: z.string(),
  input: z.string(),
  output: z.string().optional(),
  state: z.union([
    z.literal("input-streaming"),
    z.literal("input-available"),
    z.literal("output-available"),
    z.literal("output-error"),
  ]),
});

const CodeDiffPartSchema = z.object({
  type: z.literal("code_diff"),
  filePath: z.string(),
  oldContent: z.string(),
  newContent: z.string(),
  status: z.union([z.literal("pending"), z.literal("accepted"), z.literal("rejected")]).optional().default("pending"),
});

const FileContextPartSchema = z.object({
  type: z.literal("file_context"),
  filePath: z.string(),
  content: z.string(),
  language: z.string(),
  instruction: z.string().optional(),
});

const ApprovalPartSchema = z.object({
  type: z.literal("approval"),
  toolName: z.string(),
  description: z.string(),
  requestId: z.string(),
  state: z.union([
    z.literal("approval-requested"),
    z.literal("approval-responded"),
    z.literal("output-denied"),
  ]),
});

const UserInputPartSchema = z.object({
  type: z.literal("user_input"),
  requestId: z.string(),
  toolName: z.string(),
  questions: z.array(z.object({
    question: z.string(),
    header: z.string(),
    options: z.array(z.object({
      label: z.string(),
      description: z.string(),
    })),
    multiSelect: z.boolean().optional(),
  })),
  answers: z.record(z.string(), z.string()).optional(),
  state: z.union([
    z.literal("input-requested"),
    z.literal("input-responded"),
    z.literal("input-denied"),
  ]),
});

const ImageContextPartSchema = z.object({
  type: z.literal("image_context"),
  dataUrl: z.string(),
  label: z.string(),
  mimeType: z.string(),
});

const SystemEventPartSchema = z.object({
  type: z.literal("system_event"),
  content: z.string(),
});

const MessagePartSchema = z.discriminatedUnion("type", [
  TextPartSchema,
  ThinkingPartSchema,
  ToolUsePartSchema,
  CodeDiffPartSchema,
  FileContextPartSchema,
  ImageContextPartSchema,
  ApprovalPartSchema,
  UserInputPartSchema,
  SystemEventPartSchema,
]);

const AttachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), filePath: z.string() }),
  z.object({ kind: z.literal("image"), id: z.string(), dataUrl: z.string(), label: z.string() }),
]);

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  model: z.string(),
  providerId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave"), z.literal("user")]),
  content: z.string(),
  isStreaming: z.boolean().optional(),
  isPlanResponse: z.boolean().optional(),
  planText: z.string().optional(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number().optional(),
    cacheCreationTokens: z.number().optional(),
    totalCostUsd: z.number().optional(),
  }).optional(),
  promptSuggestions: z.array(z.string()).optional(),
  parts: z.array(MessagePartSchema),
});

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave")]),
  updatedAt: z.string(),
  unread: z.boolean(),
  archivedAt: z.string().nullable().optional().transform((value) => value ?? null),
});

const TaskProviderConversationStateSchema = z.object({
  "claude-code": z.string().optional(),
  codex: z.string().optional(),
});

const EditorTabSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  kind: z.union([z.literal("text"), z.literal("image")]).optional(),
  language: z.string(),
  content: z.string(),
  originalContent: z.string().optional(),
  savedContent: z.string().optional(),
  baseRevision: z.string().nullable().optional(),
  hasConflict: z.boolean(),
  isDirty: z.boolean(),
});

export const WorkspaceSnapshotSchema = z.object({
  activeTaskId: z.string(),
  tasks: z.array(TaskSchema),
  messagesByTask: z.record(z.string(), z.array(ChatMessageSchema)),
  promptDraftByTask: z.record(z.string(), z.object({
    text: z.string(),
    attachedFilePaths: z.array(z.string()).optional().default([]),
    attachments: z.array(AttachmentSchema).optional().default([]),
  })).optional().default({}),
  providerConversationByTask: z.record(z.string(), TaskProviderConversationStateSchema).optional().default({}),
  editorTabs: z.array(EditorTabSchema).optional().default([]),
  activeEditorTabId: z.string().nullable().optional().default(null),
});

export function parseWorkspaceSnapshot(args: { payload: unknown }): WorkspaceSnapshot | null {
  const parsed = WorkspaceSnapshotSchema.safeParse(args.payload);
  if (!parsed.success) {
    console.error("[task-context] invalid workspace snapshot payload", parsed.error.flatten());
    return null;
  }
  return parsed.data as WorkspaceSnapshot;
}
