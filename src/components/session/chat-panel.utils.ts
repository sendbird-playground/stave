import type { ChatMessage, CodeDiffPart, FileContextPart, MessagePart, ToolUsePart } from "@/types/chat";

export function isPendingDiffStatus(status: CodeDiffPart["status"]) {
  return status === "pending";
}

export interface DiffLineChangeSummary {
  added: number;
  removed: number;
}

export type MessagePartSegment =
  | { kind: "tools"; parts: MessagePart[]; startIndex: number }
  | { kind: "diffs"; parts: CodeDiffPart[]; startIndex: number }
  | { kind: "file_contexts"; parts: FileContextPart[]; startIndex: number }
  | { kind: "other"; part: MessagePart; index: number };

function isSubagentToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "agent";
}

function isTodoToolPart(args: { toolName: string }) {
  return args.toolName.trim().toLowerCase() === "todowrite";
}

function toLineArray(text: string) {
  return text.length === 0 ? [] : text.split("\n");
}

export function summarizeDiffLineChanges(args: { oldContent: string; newContent: string }): DiffLineChangeSummary {
  const oldLines = toLineArray(args.oldContent);
  const newLines = toLineArray(args.newContent);

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let oldSuffix = oldLines.length;
  let newSuffix = newLines.length;
  while (oldSuffix > prefix && newSuffix > prefix && oldLines[oldSuffix - 1] === newLines[newSuffix - 1]) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const oldWindow = oldLines.slice(prefix, oldSuffix);
  const newWindow = newLines.slice(prefix, newSuffix);

  if (oldWindow.length === 0) {
    return { added: newWindow.length, removed: 0 };
  }
  if (newWindow.length === 0) {
    return { added: 0, removed: oldWindow.length };
  }

  // Count line-level additions/removals via LCS on the changed window only.
  let previous = new Array<number>(newWindow.length + 1).fill(0);
  for (let oldIndex = 1; oldIndex <= oldWindow.length; oldIndex += 1) {
    const current = new Array<number>(newWindow.length + 1).fill(0);
    for (let newIndex = 1; newIndex <= newWindow.length; newIndex += 1) {
      current[newIndex] = oldWindow[oldIndex - 1] === newWindow[newIndex - 1]
        ? previous[newIndex - 1]! + 1
        : Math.max(previous[newIndex]!, current[newIndex - 1]!);
    }
    previous = current;
  }

  const sharedLineCount = previous[newWindow.length] ?? 0;
  return {
    added: newWindow.length - sharedLineCount,
    removed: oldWindow.length - sharedLineCount,
  };
}

export function groupMessageParts(parts: MessagePart[]): MessagePartSegment[] {
  const segments: MessagePartSegment[] = [];
  let index = 0;

  while (index < parts.length) {
    const currentPart = parts[index];
    if (
      currentPart?.type === "tool_use"
      && !isSubagentToolPart({ toolName: currentPart.toolName })
      && !isTodoToolPart({ toolName: currentPart.toolName })
    ) {
      const group: MessagePart[] = [];
      const startIndex = index;
      while (index < parts.length) {
        const candidate = parts[index];
        if (
          candidate?.type !== "tool_use"
          || isSubagentToolPart({ toolName: candidate.toolName })
          || isTodoToolPart({ toolName: candidate.toolName })
        ) {
          break;
        }
        group.push(candidate);
        index += 1;
      }
      segments.push({ kind: "tools", parts: group, startIndex });
      continue;
    }

    if (currentPart?.type === "code_diff") {
      const group: CodeDiffPart[] = [];
      const startIndex = index;
      while (index < parts.length && parts[index]?.type === "code_diff") {
        group.push(parts[index] as CodeDiffPart);
        index += 1;
      }
      segments.push({ kind: "diffs", parts: group, startIndex });
      continue;
    }

    if (currentPart?.type === "file_context") {
      const group: FileContextPart[] = [];
      const startIndex = index;
      while (index < parts.length && parts[index]?.type === "file_context") {
        group.push(parts[index] as FileContextPart);
        index += 1;
      }
      segments.push({ kind: "file_contexts", parts: group, startIndex });
      continue;
    }

    segments.push({ kind: "other", part: currentPart!, index });
    index += 1;
  }

  return segments;
}

export function getRenderableMessageParts(message: Pick<ChatMessage, "content" | "parts">): MessagePart[] {
  if (message.parts.length > 0) {
    return message.parts;
  }

  if (message.content.trim().length === 0) {
    return message.parts;
  }

  return [{ type: "text", text: message.content }];
}

export function getLatestUserMessageId(messages: Pick<ChatMessage, "id" | "role">[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index]?.id;
    }
  }
  return undefined;
}

function getMessagePartScrollFingerprint(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return `text:${part.text.length}`;
    case "thinking":
      return `thinking:${part.text.length}:${part.isStreaming ? 1 : 0}`;
    case "tool_use":
      return `tool:${part.toolName}:${part.state}:${part.input.length}:${part.output?.length ?? 0}`;
    case "code_diff":
      return `diff:${part.filePath}:${part.status}:${part.oldContent.length}:${part.newContent.length}`;
    case "file_context":
      return `file:${part.filePath}:${part.content.length}:${part.instruction?.length ?? 0}`;
    case "approval":
      return `approval:${part.toolName}:${part.state}:${part.description.length}`;
    case "user_input":
      return `input:${part.toolName}:${part.state}:${part.questions.length}:${Object.keys(part.answers ?? {}).length}`;
    case "system_event":
      return `system:${part.content.length}`;
  }
}

export function getMessageScrollFingerprint(message?: Pick<ChatMessage, "id" | "content" | "isStreaming" | "parts">): string {
  if (!message) {
    return "empty";
  }

  const partFingerprint = message.parts.map(getMessagePartScrollFingerprint).join("|");
  return [
    message.id,
    message.content.length,
    message.isStreaming ? 1 : 0,
    message.parts.length,
    partFingerprint,
  ].join(":");
}

export function hasVisibleMessagePartContent(part: MessagePart): boolean {
  if (part.type === "thinking") {
    return false;
  }
  if (part.type === "text") {
    return part.text.trim().length > 0;
  }
  return true;
}

export function shouldAutoOpenToolPart(state: ToolUsePart["state"]) {
  return state === "input-streaming";
}

export function shouldAutoOpenToolGroup(states: Array<ToolUsePart["state"] | undefined>) {
  return states.some((state) => state !== undefined && shouldAutoOpenToolPart(state));
}

export type MessageBodyFallbackState = "content" | "streaming-placeholder" | "empty-completed";

export function getMessageBodyFallbackState(args: {
  isActivelyStreaming: boolean;
  renderableParts: MessagePart[];
}): MessageBodyFallbackState {
  const reasoningParts = args.renderableParts.filter((part) => part.type === "thinking");
  const visibleParts = args.renderableParts.filter(hasVisibleMessagePartContent);

  if (args.isActivelyStreaming && visibleParts.length === 0 && reasoningParts.length === 0) {
    return "streaming-placeholder";
  }

  if (!args.isActivelyStreaming && visibleParts.length === 0 && reasoningParts.length === 0) {
    return "empty-completed";
  }

  return "content";
}
