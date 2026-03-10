import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
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
  TextPart,
  ThinkingPart,
  ToolUsePart,
  UserInputPart,
} from "@/types/chat";

function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

function createTextPart(args: { text: string }): TextPart {
  return {
    type: "text",
    text: args.text,
  };
}

function createThinkingPart(args: { text: string; isStreaming: boolean }): ThinkingPart {
  return {
    type: "thinking",
    text: args.text,
    isStreaming: args.isStreaming,
  };
}

function createToolPart(args: {
  toolUseId?: string;
  toolName: string;
  input: string;
  output?: string;
  state: ToolUsePart["state"];
}): ToolUsePart {
  return {
    type: "tool_use",
    toolUseId: args.toolUseId,
    toolName: args.toolName,
    input: args.input,
    output: args.output,
    state: args.state,
  };
}

function createDiffPart(args: {
  filePath: string;
  oldContent: string;
  newContent: string;
  status: CodeDiffPart["status"];
}): CodeDiffPart {
  return {
    type: "code_diff",
    filePath: args.filePath,
    oldContent: args.oldContent,
    newContent: args.newContent,
    status: args.status,
  };
}

function createApprovalPart(args: {
  requestId: string;
  toolName: string;
  description: string;
}): ApprovalPart {
  return {
    type: "approval",
    toolName: args.toolName,
    requestId: args.requestId,
    description: args.description,
    state: "approval-requested",
  };
}

function createUserInputPart(args: {
  requestId: string;
  toolName: string;
  questions: UserInputPart["questions"];
}): UserInputPart {
  return {
    type: "user_input",
    requestId: args.requestId,
    toolName: args.toolName,
    questions: args.questions,
    state: "input-requested",
  };
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
      return {
        type: "system_event",
        content: event.content,
      };
    case "error":
      return {
        type: "system_event",
        content: `[error] ${event.message}`,
      };
    case "tool_result":
    case "usage":
    case "prompt_suggestions":
    case "plan_ready":
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

  if (args.event.type === "provider_conversation") {
    return args.message;
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
      if (part.type !== "tool_use") {
        return part;
      }
      if (part.state === "input-available" || part.state === "input-streaming") {
        return { ...part, state: "output-available" as const };
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
