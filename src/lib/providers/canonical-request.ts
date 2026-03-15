import type { ChatMessage, FileContextPart, MessagePart } from "@/types/chat";
import {
  sanitizeChatMessagePayload,
  sanitizeFileContextPayload,
} from "@/lib/file-context-sanitization";
import type {
  CanonicalConversationMessage,
  CanonicalConversationRequest,
  CanonicalRetrievedContextPart,
  ProviderId,
} from "./provider.types";

function cloneMessagePart(part: MessagePart): MessagePart {
  switch (part.type) {
    case "text":
      return { ...part };
    case "thinking":
      return { ...part };
    case "tool_use":
      return { ...part };
    case "code_diff":
      return { ...part };
    case "file_context":
      return { ...part };
    case "approval":
      return { ...part };
    case "user_input":
      return {
        ...part,
        questions: part.questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({ ...option })),
        })),
        answers: part.answers ? { ...part.answers } : undefined,
      };
    case "system_event":
      return { ...part };
  }
}

function cloneContextPart(part: FileContextPart | CanonicalRetrievedContextPart) {
  if (part.type === "retrieved_context") {
    return { ...part };
  }
  return sanitizeFileContextPayload({ ...part });
}

export function toCanonicalConversationMessage(args: {
  message: ChatMessage;
}): CanonicalConversationMessage {
  const sanitizedMessage = sanitizeChatMessagePayload(args.message);
  return {
    messageId: sanitizedMessage.id,
    role: sanitizedMessage.role,
    providerId: sanitizedMessage.providerId,
    model: sanitizedMessage.model,
    content: sanitizedMessage.content,
    parts: sanitizedMessage.parts.map((part) => cloneMessagePart(part)),
    isPlanResponse: sanitizedMessage.isPlanResponse,
    planText: sanitizedMessage.planText,
  };
}

export function buildCanonicalConversationRequest(args: {
  turnId?: string;
  taskId?: string;
  workspaceId?: string;
  providerId: ProviderId;
  model?: string;
  history: ChatMessage[];
  userInput: string;
  mode?: CanonicalConversationRequest["mode"];
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
  nativeConversationId?: string | null;
  retrievedContextParts?: CanonicalRetrievedContextPart[];
}): CanonicalConversationRequest {
  const contextParts: CanonicalConversationRequest["contextParts"] = [];
  if (args.fileContexts) {
    for (const fc of args.fileContexts) {
      contextParts.push(sanitizeFileContextPayload({
        type: "file_context",
        filePath: fc.filePath,
        content: fc.content,
        language: fc.language,
        instruction: fc.instruction,
      }));
    }
  }
  args.retrievedContextParts?.forEach((part) => {
    contextParts.push(cloneContextPart(part));
  });

  return {
    turnId: args.turnId,
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    target: {
      providerId: args.providerId,
      model: args.model,
    },
    mode: args.mode ?? "chat",
    history: args.history.map((message) => toCanonicalConversationMessage({ message })),
    input: {
      role: "user",
      providerId: "user",
      model: "user",
      content: args.userInput,
      parts: args.userInput.trim().length > 0
        ? [{ type: "text", text: args.userInput }]
        : [],
    },
    contextParts,
    resume: args.nativeConversationId?.trim()
      ? { nativeConversationId: args.nativeConversationId.trim() }
      : undefined,
  };
}

function canonicalPartToContextText(part: CanonicalConversationMessage["parts"][number]) {
  switch (part.type) {
    case "text":
      return part.text;
    case "thinking":
      return `[thinking] ${part.text}`;
    case "tool_use":
      return `[tool:${part.toolName}] input=${part.input}${part.output ? ` output=${part.output}` : ""}`;
    case "code_diff":
      return `[diff:${part.filePath}] status=${part.status}`;
    case "file_context":
      return `[file_context:${part.filePath}] ${part.instruction ?? ""}`.trim();
    case "approval":
      return `[approval:${part.toolName}] ${part.description} state=${part.state}`;
    case "user_input":
      return `[user_input:${part.toolName}] questions=${part.questions.length} state=${part.state}`;
    case "system_event":
      return `[system] ${part.content}`;
  }
}

function toHistoryLine(args: { message: CanonicalConversationMessage }) {
  const primary = args.message.content.trim();
  if (primary.length > 0) {
    return `${args.message.role}: ${primary}`;
  }
  if (args.message.isPlanResponse && args.message.planText?.trim()) {
    return `${args.message.role}: ${args.message.planText.trim()}`;
  }
  const partText = args.message.parts.map((part) => canonicalPartToContextText(part)).join(" | ").trim();
  return `${args.message.role}: ${partText}`;
}

export function buildLegacyPromptFromCanonicalRequest(args: {
  request: CanonicalConversationRequest;
  includeHistory?: boolean;
}) {
  const maxHistoryChars = 12000;
  const sections = [
    ...(args.includeHistory !== false
      ? [
          "[Task Shared Context]",
          args.request.history
            .map((message) => toHistoryLine({ message }))
            .join("\n")
            .slice(-maxHistoryChars) || "(no prior messages)",
        ]
      : []),
  ];

  args.request.contextParts.forEach((part) => {
    if (part.type === "file_context") {
      sections.push(
        "[Selected File Context]",
        `file: ${part.filePath}`,
        `language: ${part.language}`,
        part.instruction ? `instruction: ${part.instruction}` : "instruction: (none)",
        part.content,
      );
      return;
    }

    sections.push(
      "[Retrieved Context]",
      `source: ${part.sourceId}`,
      part.title ? `title: ${part.title}` : "title: (none)",
      part.content,
    );
  });

  sections.push(
    "[Current User Input]",
    args.request.input.content,
  );

  return sections.join("\n\n");
}
