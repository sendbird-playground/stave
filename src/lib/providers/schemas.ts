import { z } from "zod";

const ThinkingEventSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
  isStreaming: z.boolean().optional(),
});

const TextEventSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const UsageEventSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
});

const PromptSuggestionsEventSchema = z.object({
  type: z.literal("prompt_suggestions"),
  suggestions: z.array(z.string()),
});

const ToolStateSchema = z.union([
  z.literal("input-streaming"),
  z.literal("input-available"),
  z.literal("output-available"),
  z.literal("output-error"),
]);

const ToolEventSchema = z.object({
  type: z.literal("tool"),
  toolUseId: z.string().optional(),
  toolName: z.string(),
  input: z.string(),
  output: z.string().optional(),
  state: ToolStateSchema,
});

const ToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  output: z.string(),
  isError: z.boolean().optional(),
});

const DiffStatusSchema = z.union([
  z.literal("pending"),
  z.literal("accepted"),
  z.literal("rejected"),
]);

const DiffEventSchema = z.object({
  type: z.literal("diff"),
  filePath: z.string(),
  oldContent: z.string(),
  newContent: z.string(),
  status: DiffStatusSchema.optional(),
});

const ApprovalEventSchema = z.object({
  type: z.literal("approval"),
  toolName: z.string(),
  requestId: z.string(),
  description: z.string(),
});

const UserInputQuestionSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })),
  multiSelect: z.boolean().optional(),
});

const UserInputEventSchema = z.object({
  type: z.literal("user_input"),
  toolName: z.string(),
  requestId: z.string(),
  questions: z.array(UserInputQuestionSchema),
});

const PlanReadyEventSchema = z.object({
  type: z.literal("plan_ready"),
  planText: z.string(),
});

const SystemEventSchema = z.object({
  type: z.literal("system"),
  content: z.string(),
});

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  recoverable: z.boolean(),
});

const DoneEventSchema = z.object({
  type: z.literal("done"),
  stop_reason: z.string().optional(),
});

export const NormalizedProviderEventSchema = z.discriminatedUnion("type", [
  ThinkingEventSchema,
  TextEventSchema,
  UsageEventSchema,
  PromptSuggestionsEventSchema,
  ToolEventSchema,
  ToolResultEventSchema,
  DiffEventSchema,
  ApprovalEventSchema,
  UserInputEventSchema,
  PlanReadyEventSchema,
  SystemEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
]);

export type ParsedNormalizedProviderEvent = z.infer<typeof NormalizedProviderEventSchema>;
