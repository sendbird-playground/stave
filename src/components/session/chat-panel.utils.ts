import type { ChatMessage, CodeDiffPart, FileContextPart, MessagePart } from "@/types/chat";

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
