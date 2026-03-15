import type { ChatMessage, FileContextPart, MessagePart } from "@/types/chat";

export const MAX_PROVIDER_TEXT_FIELD_CHARS = 500_000;
export const MAX_FILE_CONTEXT_CONTENT_CHARS = MAX_PROVIDER_TEXT_FIELD_CHARS;

type FileContextPayload = Pick<FileContextPart, "type" | "filePath" | "content" | "language" | "instruction">;

const IMAGE_FILE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
];

function isImageFilePath(args: { filePath: string }) {
  const normalizedPath = args.filePath.toLowerCase();
  return IMAGE_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

function isImageFileContext(args: FileContextPayload) {
  return args.language === "image"
    || isImageFilePath({ filePath: args.filePath })
    || args.content.startsWith("data:image/");
}

function buildOmittedImagePayloadNotice(args: { originalLength: number }) {
  return `[image payload omitted: original content length ${args.originalLength} exceeds the ${MAX_FILE_CONTEXT_CONTENT_CHARS} character IPC limit]`;
}

function truncateOversizedTextContent(args: {
  content: string;
  originalLength: number;
  label: string;
}) {
  const suffix = `\n\n[${args.label} truncated: original length ${args.originalLength} exceeds the ${MAX_PROVIDER_TEXT_FIELD_CHARS} character IPC limit]`;
  const headLength = Math.max(0, MAX_PROVIDER_TEXT_FIELD_CHARS - suffix.length);
  return `${args.content.slice(0, headLength)}${suffix}`.slice(0, MAX_PROVIDER_TEXT_FIELD_CHARS);
}

export function sanitizeTextField(args: { value: string; label: string }) {
  if (args.value.length <= MAX_PROVIDER_TEXT_FIELD_CHARS) {
    return args.value;
  }

  return truncateOversizedTextContent({
    content: args.value,
    originalLength: args.value.length,
    label: args.label,
  });
}

export function sanitizeFileContextPayload<T extends FileContextPayload>(part: T): T {
  if (part.content.length <= MAX_FILE_CONTEXT_CONTENT_CHARS) {
    return part;
  }

  const content = isImageFileContext(part)
    ? buildOmittedImagePayloadNotice({ originalLength: part.content.length })
    : truncateOversizedTextContent({
        content: part.content,
        originalLength: part.content.length,
        label: "content",
      });

  return {
    ...part,
    content,
  } as T;
}

export function sanitizeMessagePartPayload<T extends MessagePart>(part: T): T {
  switch (part.type) {
    case "text": {
      const text = sanitizeTextField({ value: part.text, label: "message text" });
      return text === part.text ? part : { ...part, text } as T;
    }
    case "thinking": {
      const text = sanitizeTextField({ value: part.text, label: "thinking text" });
      return text === part.text ? part : { ...part, text } as T;
    }
    case "tool_use": {
      const input = sanitizeTextField({ value: part.input, label: "tool input" });
      const output = part.output == null
        ? part.output
        : sanitizeTextField({ value: part.output, label: "tool output" });
      return input === part.input && output === part.output
        ? part
        : {
            ...part,
            input,
            ...(output != null ? { output } : {}),
          } as T;
    }
    case "code_diff": {
      const oldContent = sanitizeTextField({ value: part.oldContent, label: "diff old content" });
      const newContent = sanitizeTextField({ value: part.newContent, label: "diff new content" });
      return oldContent === part.oldContent && newContent === part.newContent
        ? part
        : {
            ...part,
            oldContent,
            newContent,
          } as T;
    }
    case "file_context":
      return sanitizeFileContextPayload(part) as T;
    case "system_event": {
      const content = sanitizeTextField({ value: part.content, label: "system event" });
      return content === part.content ? part : { ...part, content } as T;
    }
    case "approval":
    case "user_input":
      return part;
  }
}

export function sanitizeChatMessagePayload(message: ChatMessage): ChatMessage {
  const content = sanitizeTextField({
    value: message.content,
    label: `${message.role} message content`,
  });
  const planText = message.planText == null
    ? message.planText
    : sanitizeTextField({ value: message.planText, label: "plan text" });
  const parts = message.parts.map((part) => sanitizeMessagePartPayload(part));
  const partsChanged = parts.some((part, index) => part !== message.parts[index]);

  if (content === message.content && planText === message.planText && !partsChanged) {
    return message;
  }

  return {
    ...message,
    content,
    ...(planText !== undefined ? { planText } : {}),
    parts,
  };
}
