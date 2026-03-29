import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import { sanitizeMessagePartPayload } from "@/lib/file-context-sanitization";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import {
  hasRenderableAssistantContent,
  mergePromptSuggestions,
  mergeToolResultIntoPart,
} from "@/store/provider-message.utils";
import type {
  ApprovalPart,
  ChatMessage,
  CodeDiffPart,
  MessagePart,
  OrchestrationProgressPart,
  StaveProcessingPart,
  TextPart,
  ThinkingPart,
  ToolUsePart,
  UserInputPart,
} from "@/types/chat";

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function createTextPart(args: { text: string }): TextPart {
  return sanitizeMessagePartPayload({
    type: "text",
    text: args.text,
  });
}

function createThinkingPart(args: { text: string; isStreaming: boolean }): ThinkingPart {
  return sanitizeMessagePartPayload({
    type: "thinking",
    text: args.text,
    isStreaming: args.isStreaming,
  });
}

function createToolPart(args: {
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state: ToolUsePart["state"];
}): ToolUsePart {
  return sanitizeMessagePartPayload({
    type: "tool_use",
    toolUseId: args.toolUseId,
    toolName: args.toolName,
    input: args.input,
    output: args.output,
    state: args.state,
  });
}

function createDiffPart(args: {
  filePath: string;
  oldContent: string;
  newContent: string;
  status: CodeDiffPart["status"];
}): CodeDiffPart {
  return sanitizeMessagePartPayload({
    type: "code_diff",
    filePath: args.filePath,
    oldContent: args.oldContent,
    newContent: args.newContent,
    status: args.status,
  });
}

function createApprovalPart(args: {
  requestId: string;
  toolName: string;
  description: string;
}): ApprovalPart {
  return sanitizeMessagePartPayload({
    type: "approval",
    toolName: args.toolName,
    requestId: args.requestId,
    description: args.description,
    state: "approval-requested",
  });
}

function createUserInputPart(args: {
  requestId: string;
  toolName: string;
  questions: UserInputPart["questions"];
}): UserInputPart {
  return sanitizeMessagePartPayload({
    type: "user_input",
    requestId: args.requestId,
    toolName: args.toolName,
    questions: args.questions,
    state: "input-requested",
  });
}

function isAgentToolPart(part: MessagePart): part is ToolUsePart {
  return part.type === "tool_use" && part.toolName.trim().toLowerCase() === "agent";
}

/**
 * Append a progress message to the matching Agent tool_use part.
 *
 * Resolution:
 *  1. If `toolUseId` is provided, find the exact ToolUsePart.
 *  2. Otherwise, find the last Agent tool_use that has not completed yet.
 *  3. If no active Agent exists, fall back to the last Agent in the array.
 */
function appendSubagentProgressToPart(args: {
  parts: MessagePart[];
  toolUseId: string | undefined;
  content: string;
}): MessagePart[] {
  const { parts, toolUseId, content } = args;

  let targetIndex = -1;

  // 1. Try exact match by toolUseId
  if (toolUseId) {
    targetIndex = parts.findIndex(
      (p) => p.type === "tool_use" && p.toolUseId === toolUseId,
    );
  }

  // 2. Fallback: last active (non-completed) Agent tool_use
  if (targetIndex === -1) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i]!;
      if (
        isAgentToolPart(p)
        && (p.state === "input-streaming" || p.state === "input-available")
      ) {
        targetIndex = i;
        break;
      }
    }
  }

  // 3. Fallback: last Agent tool_use regardless of state
  if (targetIndex === -1) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (isAgentToolPart(parts[i]!)) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) {
    // No Agent tool_use found — degrade to a standalone system_event part.
    return [...parts, { type: "system_event" as const, content: `Subagent progress: ${content}` }];
  }

  const target = parts[targetIndex] as ToolUsePart;
  const updatedPart: ToolUsePart = {
    ...target,
    progressMessages: [...(target.progressMessages ?? []), content],
  };
  const result = [...parts];
  result[targetIndex] = updatedPart;
  return result;
}

function parseJsonString(raw: string): unknown | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (cleaned.length === 0) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLikelyStaveExecutionProcessingPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.strategy === "direct") {
    return (typeof candidate.model === "string" || typeof candidate.intent === "string") && typeof candidate.reason === "string";
  }

  if (candidate.strategy === "orchestrate") {
    return typeof candidate.supervisorModel === "string" && typeof candidate.reason === "string";
  }

  return false;
}

function isLikelyStaveOrchestrationBreakdownPayload(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.id === "string"
      && typeof candidate.title === "string"
      && typeof candidate.model === "string"
      && typeof candidate.prompt === "string"
      && (candidate.dependsOn === undefined || isStringArray(candidate.dependsOn))
    );
  });
}

function isLikelyStaveInternalRoutingPayload(text: string): boolean {
  const parsed = parseJsonString(text);
  if (!parsed) {
    return false;
  }

  return (
    isLikelyStaveExecutionProcessingPayload(parsed)
    || isLikelyStaveOrchestrationBreakdownPayload(parsed)
  );
}

function shouldSuppressStaveInternalText(args: {
  message: ChatMessage;
  candidateText: string;
  partsExcludingTrailingText: MessagePart[];
}): boolean {
  if (args.message.providerId !== "stave") {
    return false;
  }

  if (args.partsExcludingTrailingText.some((part) => part.type === "orchestration_progress")) {
    return false;
  }

  const hasNonRoutingParts = args.partsExcludingTrailingText.some((part) => (
    part.type !== "stave_processing"
    && part.type !== "system_event"
    && part.type !== "thinking"
  ));
  if (hasNonRoutingParts) {
    return false;
  }

  return isLikelyStaveInternalRoutingPayload(args.candidateText);
}

function normalizeEventToPart(args: { event: NormalizedProviderEvent }): MessagePart | null {
  const { event } = args;

  switch (event.type) {
    case "thinking":
      return createThinkingPart({ text: event.text, isStreaming: event.isStreaming ?? false });
    case "text":
      return createTextPart({ text: event.text });
    case "provider_conversation":
      return null;
    case "tool":
      return createToolPart({
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.input,
        output: event.output,
        state: event.state,
      });
    case "diff":
      return createDiffPart({
        filePath: event.filePath,
        oldContent: event.oldContent,
        newContent: event.newContent,
        status: event.status ?? "pending",
      });
    case "approval":
      return createApprovalPart({
        requestId: event.requestId,
        toolName: event.toolName,
        description: event.description,
      });
    case "user_input":
      return createUserInputPart({
        requestId: event.requestId,
        toolName: event.toolName,
        questions: event.questions,
      });
    case "system":
      return sanitizeMessagePartPayload({
        type: "system_event",
        content: event.content,
        ...(event.compactBoundary
          ? {
              compactBoundary: {
                ...(event.compactBoundary.trigger
                  ? { trigger: event.compactBoundary.trigger }
                  : {}),
                ...(event.compactBoundary.gitRef
                  ? { gitRef: event.compactBoundary.gitRef }
                  : {}),
              },
            }
          : {}),
      });
    case "subagent_progress":
      // Handled separately in appendProviderEventToAssistant — not a standalone part.
      return null;
    case "error":
      return sanitizeMessagePartPayload({
        type: "system_event",
        content: `[error] ${event.message}`,
      });
    case "stave:execution_processing": {
      const plan = sanitizeMessagePartPayload({
        type: "stave_processing",
        strategy: event.strategy,
        reason: event.reason,
        ...(event.strategy === "direct" && event.model
          ? {
              model: event.model,
              fastModeRequested: event.fastModeRequested,
              fastModeApplied: event.fastModeApplied,
            }
          : {}),
        ...(event.strategy === "orchestrate" && event.supervisorModel
          ? { supervisorModel: event.supervisorModel }
          : {}),
      } satisfies StaveProcessingPart);
      return plan;
    }
    case "tool_progress":
    case "tool_result":
    case "usage":
    case "prompt_suggestions":
    case "plan_ready":
    case "model_resolved":
    case "stave:orchestration_processing":
    case "stave:subtask_started":
    case "stave:subtask_done":
    case "stave:synthesis_started":
    case "done":
      return null;
  }
}

function createStreamingAssistantMessage(args: {
  taskId: string;
  count: number;
  provider: ProviderId;
  model: string;
}): ChatMessage {
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: args.model,
    providerId: args.provider,
    content: "",
    isStreaming: true,
    parts: [],
  };
}

function createPlanAssistantMessage(args: {
  taskId: string;
  count: number;
  provider: ProviderId;
  model: string;
  planText: string;
  isStreaming?: boolean;
}): ChatMessage {
  return {
    id: buildMessageId({ taskId: args.taskId, count: args.count }),
    role: "assistant",
    model: args.model,
    providerId: args.provider,
    content: args.planText,
    isStreaming: args.isStreaming ?? true,
    isPlanResponse: true,
    planText: args.planText,
    parts: [],
  };
}

export function appendProviderEventToAssistant(args: {
  message: ChatMessage;
  event: NormalizedProviderEvent;
}): ChatMessage {
  if (args.event.type === "usage") {
    return {
      ...args.message,
      usage: {
        ...args.message.usage,
        inputTokens: args.event.inputTokens,
        outputTokens: args.event.outputTokens,
        ...(args.event.cacheReadTokens != null ? { cacheReadTokens: args.event.cacheReadTokens } : {}),
        ...(args.event.cacheCreationTokens != null ? { cacheCreationTokens: args.event.cacheCreationTokens } : {}),
        ...(args.event.totalCostUsd != null ? { totalCostUsd: args.event.totalCostUsd } : {}),
      },
    };
  }

  if (args.event.type === "prompt_suggestions") {
    return {
      ...args.message,
      promptSuggestions: mergePromptSuggestions({
        existing: args.message.promptSuggestions,
        incoming: args.event.suggestions,
      }),
    };
  }

  if (args.event.type === "text") {
    const lastPart = args.message.parts.at(-1);
    const partsExcludingTrailingText = lastPart?.type === "text"
      ? args.message.parts.slice(0, -1)
      : args.message.parts;
    const candidateText = lastPart?.type === "text"
      ? `${lastPart.text}${args.event.text}`
      : args.event.text;

    if (shouldSuppressStaveInternalText({
      message: args.message,
      candidateText,
      partsExcludingTrailingText,
    })) {
      const nextContent = lastPart?.type === "text" && args.message.content.endsWith(lastPart.text)
        ? args.message.content.slice(0, -lastPart.text.length)
        : args.message.content;

      return {
        ...args.message,
        content: nextContent,
        parts: partsExcludingTrailingText,
        isStreaming: true,
      };
    }
  }

  if (args.event.type === "subagent_progress") {
    const { toolUseId, content } = args.event;
    const updatedParts = appendSubagentProgressToPart({
      parts: args.message.parts,
      toolUseId,
      content,
    });
    return { ...args.message, parts: updatedParts, isStreaming: true };
  }

  // Legacy: system events carrying "Subagent progress:" prefix from older stored
  // events are back-compat migrated into the matching Agent tool part.
  if (
    args.event.type === "system"
    && args.event.content.trimStart().startsWith("Subagent progress:")
  ) {
    const stripped = args.event.content.trimStart().slice("Subagent progress:".length).trim();
    if (stripped) {
      const updatedParts = appendSubagentProgressToPart({
        parts: args.message.parts,
        toolUseId: undefined,
        content: stripped,
      });
      return { ...args.message, parts: updatedParts, isStreaming: true };
    }
  }

  if (args.event.type === "tool_progress") {
    const { toolUseId, elapsedSeconds } = args.event;
    const updatedParts = args.message.parts.map((part) => {
      if (part.type === "tool_use" && part.toolUseId === toolUseId) {
        return { ...part, elapsedSeconds };
      }
      return part;
    });
    return { ...args.message, parts: updatedParts };
  }

  if (args.event.type === "tool_result") {
    const toolResultEvent = args.event;
    const updatedParts = args.message.parts.map((part) => mergeToolResultIntoPart({
      part,
      event: toolResultEvent,
    }));
    return { ...args.message, parts: updatedParts };
  }

  if (args.event.type === "plan_ready") {
    return {
      ...args.message,
      content: args.event.planText,
      isPlanResponse: true,
      planText: args.event.planText,
    };
  }

  if (args.event.type === "model_resolved") {
    return {
      ...args.message,
      providerId: args.event.resolvedProviderId,
      model: args.event.resolvedModel,
    };
  }

  if (args.event.type === "provider_conversation") {
    return args.message;
  }

  if (args.event.type === "stave:orchestration_processing") {
    const planEvent = args.event;
    const progressPart: OrchestrationProgressPart = {
      type: "orchestration_progress",
      supervisorModel: planEvent.supervisorModel,
      subtasks: planEvent.subtasks.map((st) => ({
        id: st.id,
        title: st.title,
        model: st.model,
        status: "pending" as const,
      })),
      status: "executing",
    };
    return {
      ...args.message,
      parts: [...args.message.parts, progressPart],
      isStreaming: true,
    };
  }

  if (args.event.type === "stave:subtask_started") {
    const { subtaskId } = args.event;
    const updatedParts = args.message.parts.map((part) => {
      if (part.type !== "orchestration_progress") {
        return part;
      }
      return {
        ...part,
        subtasks: part.subtasks.map((st) =>
          st.id === subtaskId ? { ...st, status: "running" as const } : st,
        ),
      };
    });
    return { ...args.message, parts: updatedParts };
  }

  if (args.event.type === "stave:subtask_done") {
    const { subtaskId, success } = args.event;
    const updatedParts = args.message.parts.map((part) => {
      if (part.type !== "orchestration_progress") {
        return part;
      }
      return {
        ...part,
        subtasks: part.subtasks.map((st) =>
          st.id === subtaskId
            ? { ...st, status: success ? ("done" as const) : ("error" as const) }
            : st,
        ),
      };
    });
    return { ...args.message, parts: updatedParts };
  }

  if (args.event.type === "stave:synthesis_started") {
    const updatedParts = args.message.parts.map((part) => {
      if (part.type !== "orchestration_progress") {
        return part;
      }
      return { ...part, status: "synthesizing" as const };
    });
    return { ...args.message, parts: updatedParts };
  }

  if (args.event.type === "done") {
    if (!hasRenderableAssistantContent({ message: args.message })) {
      return {
        ...args.message,
        content: "No response returned.",
        isStreaming: false,
        parts: [
          ...args.message.parts,
          { type: "system_event", content: "No response returned." },
        ],
      };
    }

    const finalizedParts = args.message.parts.map((part) => {
      if (part.type === "tool_use") {
        if (part.state === "input-available" || part.state === "input-streaming") {
          return { ...part, state: "output-available" as const };
        }
        return part;
      }
      if (part.type === "orchestration_progress" && part.status !== "done") {
        return { ...part, status: "done" as const };
      }
      return part;
    });

    const truncated = args.event.stop_reason === "max_tokens";

    return {
      ...args.message,
      isStreaming: false,
      parts: truncated
        ? [...finalizedParts, { type: "system_event" as const, content: "Response was cut off because the output limit was reached." }]
        : finalizedParts,
    };
  }

  const part = normalizeEventToPart({ event: args.event });
  if (!part) {
    return args.message;
  }

  const nextParts = [...args.message.parts];
  const lastPart = nextParts.at(-1);

  if (part.type === "text" && lastPart?.type === "text") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${part.text}`,
    };
  } else if (part.type === "thinking" && lastPart?.type === "thinking") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${part.text}`,
      isStreaming: part.isStreaming,
    };
  } else if (
    part.type === "tool_use"
    && part.toolName.trim().toLowerCase() === "todowrite"
  ) {
    // Replace the last TodoWrite part in-place so the list updates in-place.
    let existingIdx = -1;
    for (let index = nextParts.length - 1; index >= 0; index -= 1) {
      const candidate = nextParts[index];
      if (candidate?.type === "tool_use" && candidate.toolName.trim().toLowerCase() === "todowrite") {
        existingIdx = index;
        break;
      }
    }
    if (existingIdx !== -1) {
      nextParts[existingIdx] = part;
    } else {
      nextParts.push(part);
    }
  } else {
    nextParts.push(part);
  }

  const textAdd = args.event.type === "text" ? args.event.text : "";

  return {
    ...args.message,
    content: `${args.message.content}${textAdd}`,
    parts: nextParts,
    isStreaming: true,
  };
}

export function replayProviderEventsToTaskState(args: {
  taskId: string;
  messages: ChatMessage[];
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId?: string;
  nativeConversationReady?: boolean;
  providerConversation?: TaskProviderConversationState;
}) {
  let current = args.messages;
  let nextActiveTurnId = args.turnId;
  let nextNativeConversationReady = args.nativeConversationReady ?? false;
  let nextProviderConversation = args.providerConversation;
  let changed = false;

  for (const event of args.events) {
    if (event.type === "provider_conversation") {
      if (nextProviderConversation?.[event.providerId] !== event.nativeConversationId) {
        nextProviderConversation = {
          ...nextProviderConversation,
          [event.providerId]: event.nativeConversationId,
        };
        changed = true;
      }
      if (!nextNativeConversationReady) {
        nextNativeConversationReady = true;
        changed = true;
      }
      continue;
    }

    let target = current[current.length - 1];
    if (!target || target.role !== "assistant") {
      target = createStreamingAssistantMessage({
        taskId: args.taskId,
        count: current.length,
        provider: args.provider,
        model: args.model,
      });
      current = [...current, target];
      changed = true;
    }

    if (event.type === "plan_ready") {
      const shouldAppendSeparatePlanMessage =
        !target.isPlanResponse
        && hasRenderableAssistantContent({ message: target });

      if (shouldAppendSeparatePlanMessage) {
        const planMessage = createPlanAssistantMessage({
          taskId: args.taskId,
          count: current.length,
          provider: args.provider,
          model: args.model,
          planText: event.planText,
        });

        current = [...current, planMessage];
        changed = true;
        continue;
      }
    }

    const updated = appendProviderEventToAssistant({
      message: target,
      event,
    });

    current = [...current.slice(0, -1), updated];
    changed = true;

    if (
      event.type !== "system"
      && event.type !== "error"
      && event.type !== "done"
      && !nextNativeConversationReady
    ) {
      nextNativeConversationReady = true;
    }

    if (event.type === "done") {
      nextActiveTurnId = undefined;
    }
  }

  return {
    changed,
    messages: current,
    activeTurnId: nextActiveTurnId,
    nativeConversationReady: nextNativeConversationReady,
    providerConversation: nextProviderConversation,
  };
}
