import type { ChatMessage } from "@/types/chat";

export function getLatestPromptSuggestions(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }

    if (!Array.isArray(message.promptSuggestions)) {
      return [];
    }

    const suggestions = message.promptSuggestions
      .map((suggestion) => suggestion.trim())
      .filter(Boolean);

    return Array.from(new Set(suggestions));
  }

  return [] as string[];
}

export function mergePromptSuggestionWithDraft(args: {
  currentDraft: string;
  suggestion: string;
}) {
  const suggestion = args.suggestion.trim();
  if (!suggestion) {
    return args.currentDraft;
  }

  const currentTrimmed = args.currentDraft.trim();
  if (!currentTrimmed) {
    return suggestion;
  }

  if (currentTrimmed === suggestion) {
    return args.currentDraft;
  }

  const base = args.currentDraft.replace(/\s*$/, "");
  return `${base}\n${suggestion}`;
}
