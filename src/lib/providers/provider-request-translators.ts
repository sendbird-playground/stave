import { buildLegacyPromptFromCanonicalRequest } from "./canonical-request";
import type { CanonicalConversationRequest, ProviderId } from "./provider.types";

function getStoredResumeConversationId(conversation?: CanonicalConversationRequest) {
  const value = conversation?.resume?.nativeConversationId?.trim();
  return value ? value : undefined;
}

function getLatestTargetProviderModel(conversation: CanonicalConversationRequest) {
  for (let index = conversation.history.length - 1; index >= 0; index -= 1) {
    const message = conversation.history[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (message.providerId !== conversation.target.providerId) {
      continue;
    }
    const model = message.model?.trim();
    if (model) {
      return model;
    }
  }

  return undefined;
}

function isResumeCompatibleWithConversationTarget(conversation?: CanonicalConversationRequest) {
  if (!conversation || conversation.target.providerId !== "codex") {
    return true;
  }

  const targetModel = conversation.target.model?.trim();
  if (!targetModel) {
    return true;
  }

  const latestModel = getLatestTargetProviderModel(conversation);
  if (!latestModel) {
    return true;
  }

  return latestModel === targetModel;
}

function getResumeConversationId(conversation?: CanonicalConversationRequest) {
  const value = getStoredResumeConversationId(conversation);
  if (!value) {
    return undefined;
  }

  return isResumeCompatibleWithConversationTarget(conversation) ? value : undefined;
}

function shouldIncludeHistory(conversation: CanonicalConversationRequest) {
  return !getResumeConversationId(conversation);
}

export function buildClaudePromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  // Collect skills and convert $token → /token for native Claude slash commands
  const nativeSlashPrefixes: string[] = [];
  for (const part of args.conversation.contextParts) {
    if (part.type === "skill_context") {
      for (const skill of part.skills) {
        const token = skill.invocationToken;
        nativeSlashPrefixes.push(token.startsWith("$") ? `/${token.slice(1)}` : `/${token}`);
      }
    }
  }

  // Build prompt without [Selected Skills] section; skills become native slash commands
  const basePrompt = buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
    includeSkillContext: false,
  }) || args.fallbackPrompt;

  if (nativeSlashPrefixes.length === 0) {
    return basePrompt;
  }

  return `${nativeSlashPrefixes.join(" ")}\n\n${basePrompt}`;
}

export function buildCodexPromptFromConversation(args: {
  conversation: CanonicalConversationRequest;
  fallbackPrompt: string;
}) {
  return buildLegacyPromptFromCanonicalRequest({
    request: args.conversation,
    includeHistory: shouldIncludeHistory(args.conversation),
  }) || args.fallbackPrompt;
}

export function buildProviderTurnPrompt(args: {
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
}) {
  if (!args.conversation) {
    return args.prompt;
  }

  if (args.providerId === "claude-code") {
    return buildClaudePromptFromConversation({
      conversation: args.conversation,
      fallbackPrompt: args.prompt,
    });
  }

  return buildCodexPromptFromConversation({
    conversation: args.conversation,
    fallbackPrompt: args.prompt,
  });
}

export function resolveProviderResumeConversationId(args: {
  conversation?: CanonicalConversationRequest;
  fallbackResumeId?: string;
}) {
  if (!isResumeCompatibleWithConversationTarget(args.conversation)) {
    return undefined;
  }

  const fallback = args.fallbackResumeId?.trim();
  if (fallback) {
    return fallback;
  }
  return getStoredResumeConversationId(args.conversation);
}
