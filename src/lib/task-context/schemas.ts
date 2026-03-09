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
  ApprovalPartSchema,
  UserInputPartSchema,
  SystemEventPartSchema,
]);

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  model: z.string(),
  providerId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("user")]),
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
  provider: z.union([z.literal("claude-code"), z.literal("codex")]),
  updatedAt: z.string(),
  unread: z.boolean(),
  archivedAt: z.string().nullable().optional().transform((value) => value ?? null),
});

export const WorkspaceSnapshotSchema = z.object({
  activeTaskId: z.string(),
  tasks: z.array(TaskSchema),
  messagesByTask: z.record(z.string(), z.array(ChatMessageSchema)),
  promptDraftByTask: z.record(z.string(), z.object({
    text: z.string(),
    attachedFilePath: z.string().optional().default(""),
  })).optional().default({}),
});

export function parseWorkspaceSnapshot(args: { payload: unknown }): WorkspaceSnapshot | null {
  const parsed = WorkspaceSnapshotSchema.safeParse(args.payload);
  if (!parsed.success) {
    console.error("[task-context] invalid workspace snapshot payload", parsed.error.flatten());
    return null;
  }
  return parsed.data as WorkspaceSnapshot;
}
