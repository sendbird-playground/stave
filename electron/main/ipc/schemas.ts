import { z } from "zod";

export const ProviderIdSchema = z.union([z.literal("claude-code"), z.literal("codex")]);

const RuntimeOptionsSchema = z.object({
  model: z.string().max(200).optional(),
  chatStreamingEnabled: z.boolean().optional(),
  debug: z.boolean().optional(),
  providerTimeoutMs: z.number().int().min(1).max(3_600_000).optional(),
  claudePermissionMode: z.union([
    z.literal("default"),
    z.literal("acceptEdits"),
    z.literal("bypassPermissions"),
    z.literal("plan"),
    z.literal("dontAsk"),
  ]).optional(),
  claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
  claudeSandboxEnabled: z.boolean().optional(),
  claudeAllowUnsandboxedCommands: z.boolean().optional(),
  claudeSystemPrompt: z.string().max(20_000).optional(),
  claudeMaxTurns: z.number().int().min(1).max(200).optional(),
  claudeMaxBudgetUsd: z.number().min(0).max(10_000).optional(),
  claudeEffort: z.union([z.literal("low"), z.literal("medium"), z.literal("high"), z.literal("max")]).optional(),
  claudeThinkingMode: z.union([z.literal("adaptive"), z.literal("enabled"), z.literal("disabled")]).optional(),
  claudeAgentProgressSummaries: z.boolean().optional(),
  claudeAllowedTools: z.array(z.string().max(200)).max(200).optional(),
  claudeDisallowedTools: z.array(z.string().max(200)).max(200).optional(),
  claudeResumeSessionId: z.string().max(200).optional(),
  codexSandboxMode: z.union([z.literal("read-only"), z.literal("workspace-write"), z.literal("danger-full-access")]).optional(),
  codexSkipGitRepoCheck: z.boolean().optional(),
  codexNetworkAccessEnabled: z.boolean().optional(),
  codexApprovalPolicy: z.union([
    z.literal("never"),
    z.literal("on-request"),
    z.literal("on-failure"),
    z.literal("untrusted"),
  ]).optional(),
  codexPathOverride: z.string().max(4096).optional(),
  codexModelReasoningEffort: z.union([z.literal("minimal"), z.literal("low"), z.literal("medium"), z.literal("high"), z.literal("xhigh")]).optional(),
  codexWebSearchMode: z.union([z.literal("disabled"), z.literal("cached"), z.literal("live")]).optional(),
  codexShowRawAgentReasoning: z.boolean().optional(),
  codexReasoningSummary: z.union([z.literal("auto"), z.literal("concise"), z.literal("detailed"), z.literal("none")]).optional(),
  codexSupportsReasoningSummaries: z.union([z.literal("auto"), z.literal("enabled"), z.literal("disabled")]).optional(),
  codexResumeThreadId: z.string().max(200).optional(),
}).strict().optional();

const UserInputOptionSchema = z.object({
  label: z.string().max(500),
  description: z.string().max(5000),
}).strict();

const UserInputQuestionSchema = z.object({
  question: z.string().max(5000),
  header: z.string().max(200),
  options: z.array(UserInputOptionSchema).max(20),
  multiSelect: z.boolean().optional(),
}).strict();

const CanonicalMessagePartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().max(500_000),
  }).strict(),
  z.object({
    type: z.literal("thinking"),
    text: z.string().max(500_000),
    isStreaming: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("tool_use"),
    toolUseId: z.string().max(200).optional(),
    toolName: z.string().max(200),
    input: z.string().max(500_000),
    output: z.string().max(500_000).optional(),
    state: z.union([
      z.literal("input-streaming"),
      z.literal("input-available"),
      z.literal("output-available"),
      z.literal("output-error"),
    ]),
  }).strict(),
  z.object({
    type: z.literal("code_diff"),
    filePath: z.string().max(4096),
    oldContent: z.string().max(500_000),
    newContent: z.string().max(500_000),
    status: z.union([z.literal("pending"), z.literal("accepted"), z.literal("rejected")]),
  }).strict(),
  z.object({
    type: z.literal("file_context"),
    filePath: z.string().max(4096),
    content: z.string().max(500_000),
    language: z.string().max(200),
    instruction: z.string().max(5000).optional(),
  }).strict(),
  z.object({
    type: z.literal("approval"),
    toolName: z.string().max(200),
    description: z.string().max(5000),
    requestId: z.string().max(200),
    state: z.union([
      z.literal("approval-requested"),
      z.literal("approval-responded"),
      z.literal("output-denied"),
    ]),
  }).strict(),
  z.object({
    type: z.literal("user_input"),
    requestId: z.string().max(200),
    toolName: z.string().max(200),
    questions: z.array(UserInputQuestionSchema).max(20),
    answers: z.record(z.string(), z.string()).optional(),
    state: z.union([
      z.literal("input-requested"),
      z.literal("input-responded"),
      z.literal("input-denied"),
    ]),
  }).strict(),
  z.object({
    type: z.literal("image_context"),
    dataUrl: z.string().max(10_000_000),
    label: z.string().max(500),
    mimeType: z.string().max(200),
  }).strict(),
  z.object({
    type: z.literal("system_event"),
    content: z.string().max(500_000),
  }).strict(),
]);

const CanonicalContextPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_context"),
    filePath: z.string().max(4096),
    content: z.string().max(500_000),
    language: z.string().max(200),
    instruction: z.string().max(5000).optional(),
  }).strict(),
  z.object({
    type: z.literal("image_context"),
    dataUrl: z.string().max(10_000_000),
    label: z.string().max(500),
    mimeType: z.string().max(200),
  }).strict(),
  z.object({
    type: z.literal("retrieved_context"),
    sourceId: z.string().max(200),
    title: z.string().max(500).optional(),
    content: z.string().max(500_000),
  }).strict(),
]);

const CanonicalConversationMessageSchema = z.object({
  messageId: z.string().max(200).optional(),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  providerId: z.union([ProviderIdSchema, z.literal("user")]).optional(),
  model: z.string().max(200).optional(),
  content: z.string().max(500_000),
  parts: z.array(CanonicalMessagePartSchema).max(500),
  isPlanResponse: z.boolean().optional(),
  planText: z.string().max(500_000).optional(),
}).strict();

const CanonicalConversationRequestSchema = z.object({
  turnId: z.string().min(1).max(200).optional(),
  taskId: z.string().max(200).optional(),
  workspaceId: z.string().max(200).optional(),
  target: z.object({
    providerId: ProviderIdSchema,
    model: z.string().max(200).optional(),
  }).strict(),
  mode: z.union([z.literal("chat"), z.literal("review")]),
  history: z.array(CanonicalConversationMessageSchema).max(1000),
  input: CanonicalConversationMessageSchema.extend({
    role: z.literal("user"),
  }),
  contextParts: z.array(CanonicalContextPartSchema).max(200),
  resume: z.object({
    nativeConversationId: z.string().max(200).optional(),
  }).strict().optional(),
}).strict();

export const StreamTurnArgsSchema = z.object({
  turnId: z.string().min(1).max(200).optional(),
  providerId: ProviderIdSchema,
  prompt: z.string().max(500_000),
  conversation: CanonicalConversationRequestSchema.optional(),
  taskId: z.string().max(200).optional(),
  workspaceId: z.string().max(200).optional(),
  cwd: z.string().max(4096).optional(),
  runtimeOptions: RuntimeOptionsSchema,
}).strict();

export const ProviderCommandCatalogArgsSchema = z.object({
  providerId: ProviderIdSchema,
  cwd: z.string().max(4096).optional(),
  runtimeOptions: RuntimeOptionsSchema,
}).strict();

export const StreamReadArgsSchema = z.object({
  streamId: z.string().min(1).max(200),
  cursor: z.number().int().min(0),
}).strict();

export const CleanupTaskArgsSchema = z.object({
  taskId: z.string().min(1).max(200),
}).strict();

export const ApprovalResponseArgsSchema = z.object({
  turnId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
  approved: z.boolean(),
}).strict();

export const UserInputResponseArgsSchema = z.object({
  turnId: z.string().min(1).max(200),
  requestId: z.string().min(1).max(200),
  answers: z.record(z.string(), z.string()).optional(),
  denied: z.boolean().optional(),
}).strict();

export const WorkspaceIdArgsSchema = z.object({
  workspaceId: z.string().min(1).max(200),
}).strict();

export const PersistenceUpsertArgsSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  snapshot: z.record(z.string(), z.unknown()),
}).strict();

export const ListTurnEventsArgsSchema = z.object({
  turnId: z.string().min(1).max(200),
  afterSequence: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
}).strict();

export const ListTaskTurnsArgsSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();

export const ListLatestWorkspaceTurnsArgsSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(500).optional(),
}).strict();

export const OpenExternalArgsSchema = z.object({
  url: z.string().min(1).max(2048),
}).strict();

const FilesystemRootPathSchema = z.string().min(1).max(4096);
const FilesystemFilePathSchema = z.string().min(1).max(4096);

export const FilesystemRootArgsSchema = z.object({
  rootPath: FilesystemRootPathSchema,
}).strict();

export const FilesystemFileArgsSchema = z.object({
  rootPath: FilesystemRootPathSchema,
  filePath: FilesystemFilePathSchema,
}).strict();

export const FilesystemWriteFileArgsSchema = FilesystemFileArgsSchema.extend({
  content: z.string(),
  expectedRevision: z.string().max(4096).nullable().optional(),
}).strict();

const LspLanguageIdSchema = z.literal("python");

const LspBaseRequestSchema = z.object({
  rootPath: z.string().min(1).max(4096),
  languageId: LspLanguageIdSchema,
  commandOverride: z.string().max(4096).optional(),
}).strict();

export const LspSyncDocumentArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
  documentLanguageId: z.string().min(1).max(200),
  text: z.string().max(2_000_000),
  version: z.number().int().min(1),
}).strict();

export const LspCloseDocumentArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
}).strict();

export const LspRequestArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
  line: z.number().int().min(0).max(2_000_000),
  character: z.number().int().min(0).max(20_000),
}).strict();

export const LspStopSessionsArgsSchema = z.object({
  rootPath: z.string().max(4096).optional(),
}).strict();
