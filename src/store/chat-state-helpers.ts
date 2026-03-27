import { sanitizeFileContextPayload } from "@/lib/file-context-sanitization";
import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type {
  ChatMessage,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  Task,
  TextPart,
} from "@/types/chat";

export function buildMessageId(args: { taskId: string; count: number }) {
  return `${args.taskId}-m-${args.count + 1}`;
}

export function buildRecentTimestamp() {
  return new Date().toISOString();
}

export function createUserTextPart(args: { text: string }): TextPart {
  return {
    type: "text",
    text: args.text,
  };
}

export function createFileContextPart(args: {
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}): FileContextPart {
  return sanitizeFileContextPayload({
    type: "file_context",
    filePath: args.filePath,
    content: args.content,
    language: args.language,
    instruction: args.instruction,
  });
}

export function buildLocalCommandResponseState(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  nativeConversationReadyByTask: Record<string, boolean>;
  providerConversationByTask: Record<string, TaskProviderConversationState>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceSnapshotVersion: number;
  taskId: string;
  taskWorkspaceId: string;
  provider: ProviderId;
  activeModel: string;
  content: string;
  responseText: string;
  shouldClearProviderConversation: boolean;
}) {
  const current = args.messagesByTask[args.taskId] ?? [];
  const userMessageId = buildMessageId({ taskId: args.taskId, count: current.length });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: current.length + 1 });

  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: [createUserTextPart({ text: args.content })],
  };

  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    model: args.activeModel,
    providerId: args.provider,
    content: args.responseText,
    isStreaming: false,
    parts: args.responseText ? [createUserTextPart({ text: args.responseText })] : [],
  };

  return {
    tasks: args.tasks.map((taskItem) =>
      taskItem.id === args.taskId
        ? { ...taskItem, archivedAt: null, updatedAt: buildRecentTimestamp() }
        : taskItem
    ),
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: args.shouldClearProviderConversation
        ? [userMessage, assistantMessage]
        : [...current, userMessage, assistantMessage],
    },
    activeTurnIdsByTask: {
      ...args.activeTurnIdsByTask,
      [args.taskId]: undefined,
    },
    nativeConversationReadyByTask: args.shouldClearProviderConversation
      ? {
          ...args.nativeConversationReadyByTask,
          [args.taskId]: false,
        }
      : args.nativeConversationReadyByTask,
    providerConversationByTask: args.shouldClearProviderConversation
      ? Object.fromEntries(
          Object.entries(args.providerConversationByTask).filter(([key]) => key !== args.taskId)
        )
      : args.providerConversationByTask,
    taskWorkspaceIdById: {
      ...args.taskWorkspaceIdById,
      [args.taskId]: args.taskWorkspaceId,
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}

export function buildPendingProviderTurnState(args: {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceSnapshotVersion: number;
  taskId: string;
  taskWorkspaceId: string;
  turnId: string;
  provider: ProviderId;
  activeModel: string;
  content: string;
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
  imageContexts?: Array<{
    dataUrl: string;
    label: string;
    mimeType: string;
  }>;
}) {
  const current = args.messagesByTask[args.taskId] ?? [];
  const userMessageId = buildMessageId({ taskId: args.taskId, count: current.length });
  const assistantMessageId = buildMessageId({ taskId: args.taskId, count: current.length + 1 });
  const userParts: MessagePart[] = [];

  if (args.fileContexts) {
    for (const fileContext of args.fileContexts) {
      userParts.push(createFileContextPart({
        filePath: fileContext.filePath,
        content: fileContext.content,
        language: fileContext.language,
        instruction: fileContext.instruction,
      }));
    }
  }

  if (args.imageContexts) {
    for (const imageContext of args.imageContexts) {
      userParts.push({
        type: "image_context",
        dataUrl: imageContext.dataUrl,
        label: imageContext.label,
        mimeType: imageContext.mimeType,
      } satisfies ImageContextPart);
    }
  }

  if (args.content.trim().length > 0) {
    userParts.push(createUserTextPart({ text: args.content }));
  }

  const userMessage: ChatMessage = {
    id: userMessageId,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: userParts.length > 0 ? userParts : [createUserTextPart({ text: args.content })],
  };

  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    model: args.activeModel,
    providerId: args.provider,
    content: "",
    isStreaming: true,
    parts: [],
  };

  return {
    tasks: args.tasks.map((taskItem) =>
      taskItem.id === args.taskId
        ? {
            ...taskItem,
            archivedAt: null,
            updatedAt: buildRecentTimestamp(),
          }
        : taskItem
    ),
    messagesByTask: {
      ...args.messagesByTask,
      [args.taskId]: [...current, userMessage, assistantMessage],
    },
    activeTurnIdsByTask: {
      ...args.activeTurnIdsByTask,
      [args.taskId]: args.turnId,
    },
    taskWorkspaceIdById: {
      ...args.taskWorkspaceIdById,
      [args.taskId]: args.taskWorkspaceId,
    },
    workspaceSnapshotVersion: args.workspaceSnapshotVersion + 1,
  };
}
