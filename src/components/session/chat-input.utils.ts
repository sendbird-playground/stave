import type { ChatMessage } from "@/types/chat";

export function getPromptHistoryEntries(messages: ChatMessage[]) {
  const entries: string[] = [];

  for (const message of messages) {
    if (message.role !== "user" || message.providerId !== "user") {
      continue;
    }
    if (!message.content.trim()) {
      continue;
    }
    entries.push(message.content);
  }

  return entries;
}

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

const APPROVAL_SHORTCUT_BLOCKED_TAGS = new Set([
  "A",
  "BUTTON",
  "INPUT",
  "OPTION",
  "SELECT",
  "SUMMARY",
  "TEXTAREA",
]);

const APPROVAL_SHORTCUT_BLOCKED_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
  "textbox",
]);

export function shouldHandleApprovalEnterShortcut(args: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  targetTagName?: string | null;
  targetRole?: string | null;
  targetIsContentEditable?: boolean;
}) {
  if (args.key !== "Enter") {
    return false;
  }
  if (args.altKey || args.ctrlKey || args.metaKey || args.shiftKey || args.isComposing) {
    return false;
  }
  if (args.targetIsContentEditable) {
    return false;
  }

  const targetTagName = args.targetTagName?.toUpperCase() ?? null;
  if (targetTagName && APPROVAL_SHORTCUT_BLOCKED_TAGS.has(targetTagName)) {
    return false;
  }

  const targetRole = args.targetRole?.toLowerCase() ?? null;
  if (targetRole && APPROVAL_SHORTCUT_BLOCKED_ROLES.has(targetRole)) {
    return false;
  }

  return true;
}
