import { getRenderableMessageParts, isCodeDiffSummarySystemEvent } from "@/components/session/chat-panel.utils";
import type {
  ApprovalPart,
  ChatMessage,
  CodeDiffPart,
  FileContextPart,
  ImageContextPart,
  MessagePart,
  OrchestrationProgressPart,
  StaveProcessingPart,
  SystemEventPart,
  TextPart,
  ThinkingPart,
  ToolUsePart,
  UserInputPart,
} from "@/types/chat";

const SUBAGENT_PROGRESS_PREFIX = "Subagent progress:";

export type AssistantTraceEntry =
  | { kind: "reasoning"; id: string; parts: ThinkingPart[]; isStreaming: boolean }
  | { kind: "assistant_text"; id: string; parts: TextPart[] }
  | { kind: "tool"; id: string; part: ToolUsePart }
  | { kind: "subagent"; id: string; part: ToolUsePart }
  | { kind: "todo"; id: string; part: ToolUsePart }
  | { kind: "approval"; id: string; part: ApprovalPart }
  | { kind: "user_input"; id: string; part: UserInputPart }
  | { kind: "diff"; id: string; parts: CodeDiffPart[] }
  | { kind: "system"; id: string; part: SystemEventPart }
  | { kind: "orchestration"; id: string; part: OrchestrationProgressPart }
  | { kind: "stave_processing"; id: string; part: StaveProcessingPart };

export interface AssistantTraceData {
  entries: AssistantTraceEntry[];
  responseParts: TextPart[];
  fileContextParts: FileContextPart[];
  imageContextParts: ImageContextPart[];
  showStreamingPlaceholder: boolean;
}

function isSubagentToolPart(toolName: string) {
  return toolName.trim().toLowerCase() === "agent";
}

function isTodoToolPart(toolName: string) {
  return toolName.trim().toLowerCase() === "todowrite";
}

function shouldIncludeSystemEvent(part: SystemEventPart) {
  const normalized = part.content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isCodeDiffSummarySystemEvent(part.content)) {
    return false;
  }
  return !part.content.trimStart().startsWith(SUBAGENT_PROGRESS_PREFIX);
}

export function buildAssistantTrace(args: {
  message: Pick<ChatMessage, "content" | "parts" | "isStreaming">;
}): AssistantTraceData {
  const renderableParts = getRenderableMessageParts({
    content: args.message.content,
    parts: args.message.parts,
  });
  const responseBoundaryIndex = renderableParts.reduce((lastIndex, part, index) => {
    if (part.type === "text" || part.type === "file_context" || part.type === "image_context") {
      return lastIndex;
    }
    return index;
  }, -1);

  const entries: AssistantTraceEntry[] = [];
  const responseParts: TextPart[] = [];
  const fileContextParts: FileContextPart[] = [];
  const imageContextParts: ImageContextPart[] = [];

  renderableParts.forEach((part, index) => {
    switch (part.type) {
      case "text":
        if (!part.text.trim()) {
          return;
        }
        if (index > responseBoundaryIndex) {
          responseParts.push(part);
          return;
        }
        {
          const previous = entries.at(-1);
          if (previous?.kind === "assistant_text") {
            previous.parts.push(part);
            return;
          }
        }
        entries.push({
          kind: "assistant_text",
          id: `assistant-text-${index}`,
          parts: [part],
        });
        return;
      case "thinking": {
        const previous = entries.at(-1);
        if (previous?.kind === "reasoning") {
          previous.parts.push(part);
          previous.isStreaming = part.isStreaming;
          return;
        }
        entries.push({
          kind: "reasoning",
          id: `reasoning-${index}`,
          parts: [part],
          isStreaming: part.isStreaming,
        });
        return;
      }
      case "tool_use":
        entries.push({
          kind: isSubagentToolPart(part.toolName)
            ? "subagent"
            : isTodoToolPart(part.toolName)
            ? "todo"
            : "tool",
          id: `tool-${index}`,
          part,
        });
        return;
      case "approval":
        entries.push({ kind: "approval", id: `approval-${index}`, part });
        return;
      case "user_input":
        entries.push({ kind: "user_input", id: `user-input-${index}`, part });
        return;
      case "code_diff": {
        const previous = entries.at(-1);
        if (previous?.kind === "diff") {
          previous.parts.push(part);
          return;
        }
        entries.push({ kind: "diff", id: `diff-${index}`, parts: [part] });
        return;
      }
      case "system_event":
        if (shouldIncludeSystemEvent(part)) {
          entries.push({ kind: "system", id: `system-${index}`, part });
        }
        return;
      case "orchestration_progress":
        entries.push({ kind: "orchestration", id: `orchestration-${index}`, part });
        return;
      case "stave_processing":
        entries.push({ kind: "stave_processing", id: `stave-processing-${index}`, part });
        return;
      case "file_context":
        fileContextParts.push(part);
        return;
      case "image_context":
        imageContextParts.push(part);
        return;
    }
  });

  return {
    entries,
    responseParts,
    fileContextParts,
    imageContextParts,
    showStreamingPlaceholder: Boolean(args.message.isStreaming) && entries.length === 0 && responseParts.length === 0,
  };
}

export function joinReasoningText(parts: ThinkingPart[]) {
  return parts.map((part) => part.text).join("");
}
